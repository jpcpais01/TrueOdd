import { prisma } from "@/lib/db/prisma";
import { fetchBrtiOnce, type BrtiTick } from "@/lib/kalshi/brti";
import { runMonteCarlo } from "@/lib/quant/montecarlo";
import { computeEdge, decideEntry } from "@/lib/quant/edge";
import { computeFill } from "@/lib/quant/pnl";
import { settlementWindowFor } from "@/lib/quant/settlement";
import { ingestBrtiTick } from "./brtiIngest";
import { syncMarkets } from "./marketTracker";
import { getBestAsksForMarket } from "./marketData";
import { computeRollingVolatility, type RollingVolatility } from "./volatilityWindow";
import { getSettings, type StrategySettings } from "./settings";
import { MAX_BRTI_STALENESS_MS } from "./constants";
import type { Market as MarketRow } from "@prisma/client";

export interface EngineTickResult {
  now: Date;
  brti: BrtiTick | null;
  brtiError: string | null;
  volatility: RollingVolatility;
  openMarkets: number;
  tradesOpened: string[]; // market tickers
}

/**
 * Runs one full 5-second engine cycle:
 *  1. ingest the latest BRTI observation
 *  2. detect new/transitioned markets and settle any that just closed
 *  3. recompute rolling realized volatility
 *  4. for every open market: run the Monte Carlo model, persist a snapshot,
 *     and paper-enter a position if edge clears the configured threshold
 *
 * `opts.latestBrti` lets a caller with its own live feed (the standalone
 * collector, which holds a persistent websocket) skip the one-shot fetch;
 * omitting it makes this safe to call from a stateless API route too.
 *
 * Market sync/settlement (Kalshi REST, unauthenticated) and BRTI ingestion
 * (Kalshi websocket, authenticated) are independent Kalshi integrations —
 * a BRTI outage or misconfiguration must never prevent market detection
 * from running, so failures there are caught locally rather than aborting
 * the whole tick.
 */
export async function runEngineTick(opts: { latestBrti?: BrtiTick } = {}): Promise<EngineTickResult> {
  const now = new Date();
  const settings = await getSettings();

  let brti: BrtiTick | null = null;
  let brtiError: string | null = null;
  try {
    brti = opts.latestBrti ?? (await fetchBrtiOnce());
    await ingestBrtiTick(brti);
  } catch (err) {
    brtiError = err instanceof Error ? err.message : "BRTI fetch failed";
    console.error("[engine] BRTI ingestion failed", err);
  }

  const openMarkets = await syncMarkets(now);
  const volatility = await computeRollingVolatility(settings.lookbackMarkets, now);

  const tradesOpened: string[] = [];
  if (brti) {
    for (const market of openMarkets) {
      const opened = await processMarket(market, brti, volatility, settings, now);
      if (opened) tradesOpened.push(market.id);
    }
  }

  return {
    now,
    brti,
    brtiError,
    volatility,
    openMarkets: openMarkets.length,
    tradesOpened,
  };
}

async function processMarket(
  market: MarketRow,
  brti: BrtiTick,
  volatility: RollingVolatility,
  settings: StrategySettings,
  now: Date,
): Promise<boolean> {
  const closeMs = market.closeTime.getTime();
  const nowMs = now.getTime();
  const timeRemainingMs = closeMs - nowMs;
  if (timeRemainingMs <= 0) return false; // about to be settled on the next sync pass

  const brtiAgeMs = nowMs - brti.timestamp;
  const isStale = brtiAgeMs > MAX_BRTI_STALENESS_MS;

  const asks = await getBestAsksForMarket(market.id);
  const window = settlementWindowFor(closeMs);
  const msUntilWindowStart = Math.max(0, window.windowStart - nowMs);

  let observedWindowTicks: number[] = [];
  if (nowMs >= window.windowStart) {
    const rows = await prisma.brtiTick.findMany({
      where: {
        timestamp: {
          gte: new Date(window.windowStart),
          lt: new Date(Math.min(nowMs, window.windowEnd)),
        },
      },
      orderBy: { timestamp: "asc" },
      select: { value: true },
    });
    observedWindowTicks = rows.map((r) => r.value);
  }

  const mc = runMonteCarlo({
    currentPrice: brti.value,
    strike: market.floorStrike,
    msUntilWindowStart,
    sigma5s: volatility.sigma5s,
    paths: settings.mcPaths,
    observedWindowTicks,
  });

  const edges = computeEdge({
    modelYes: mc.modelYes,
    modelNo: mc.modelNo,
    yesAskCts: asks.yesAskCts ?? 50,
    noAskCts: asks.noAskCts ?? 50,
  });

  await prisma.modelSnapshot.create({
    data: {
      marketId: market.id,
      timestamp: now,
      brti: brti.value,
      strike: market.floorStrike,
      timeRemainingMs,
      yesAsk: asks.yesAskCts ?? 0,
      noAsk: asks.noAskCts ?? 0,
      modelYes: mc.modelYes,
      modelNo: mc.modelNo,
      edgeYes: edges.edgeYes,
      edgeNo: edges.edgeNo,
      volatility: volatility.sigma5s,
      simPaths: settings.mcPaths,
      warmup: volatility.warmup,
      observedSecs: observedWindowTicks.length,
    },
  });

  // Never trade during warm-up, on stale data, or with an incomplete book —
  // and never more than one entry per market.
  if (volatility.warmup || isStale || asks.yesAskCts == null || asks.noAskCts == null) {
    return false;
  }

  const existing = await prisma.trade.findUnique({ where: { marketId: market.id } });
  if (existing) return false;

  const decision = decideEntry(edges, settings.minEdge);
  if (!decision.shouldEnter || !decision.side) return false;

  const entryAsk = decision.side === "YES" ? asks.yesAskCts! : asks.noAskCts!;
  const fill = computeFill({ side: decision.side, entryPriceCts: entryAsk, stake: settings.paperStake });
  if (fill.contracts <= 0) return false;

  try {
    await prisma.trade.create({
      data: {
        marketId: market.id,
        side: decision.side,
        entryPriceCts: entryAsk,
        stake: settings.paperStake,
        contracts: fill.contracts,
        modelProb: decision.side === "YES" ? mc.modelYes : mc.modelNo,
        edge: decision.edge,
        entryTime: now,
        status: "OPEN",
      },
    });
    return true;
  } catch {
    // Unique constraint on marketId — a concurrent tick already entered.
    return false;
  }
}
