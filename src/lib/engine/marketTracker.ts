import { prisma } from "@/lib/db/prisma";
import { getMarket, getOpenBtc15mMarkets, BTC_15M_SERIES_TICKER } from "@/lib/kalshi/client";
import { computeRealizedSettlement, settlementWindowFor } from "@/lib/quant/settlement";
import { settleTrade } from "@/lib/quant/pnl";
import type { Market as MarketRow, Side } from "@prisma/client";

/**
 * Pulls the current open BTC 15m markets from Kalshi and reconciles them
 * against our local table: new tickers are inserted (market auto-detection),
 * and any market we still have marked OPEN that Kalshi no longer lists as
 * open has transitioned — it gets settled. Upserting by ticker (the primary
 * key) makes this naturally idempotent against duplicate/overlapping calls.
 */
export async function syncMarkets(now: Date = new Date()): Promise<MarketRow[]> {
  const kalshiOpen = await getOpenBtc15mMarkets();
  const seenTickers = new Set<string>();

  for (const km of kalshiOpen) {
    if (km.floor_strike == null || !km.close_time || !km.open_time) continue;
    seenTickers.add(km.ticker);
    await prisma.market.upsert({
      where: { id: km.ticker },
      create: {
        id: km.ticker,
        seriesTicker: km.series_ticker ?? BTC_15M_SERIES_TICKER,
        eventTicker: km.event_ticker,
        floorStrike: km.floor_strike,
        openTime: new Date(km.open_time),
        closeTime: new Date(km.close_time),
        status: "OPEN",
      },
      // floor_strike and open_time are fixed at market creation; close_time
      // can occasionally be revised by Kalshi before the window opens, so
      // keep it in sync.
      update: { closeTime: new Date(km.close_time) },
    });
  }

  const localOpen = await prisma.market.findMany({ where: { status: "OPEN" } });
  for (const m of localOpen) {
    if (seenTickers.has(m.id)) continue;
    // Kalshi's open-markets list can lag by a beat around the boundary;
    // only settle once we're actually past close time.
    if (m.closeTime.getTime() > now.getTime()) continue;
    await settleMarket(m, now);
  }

  return prisma.market.findMany({ where: { status: "OPEN" }, orderBy: { closeTime: "asc" } });
}

/**
 * Resolves a market's final result. Prefers Kalshi's own reported result
 * (the authoritative "eventual settlement") when it's available; otherwise
 * falls back to our own recomputation from the persisted 60-second BRTI
 * window, which also serves as an independent cross-check when both exist.
 */
export async function settleMarket(m: MarketRow, now: Date): Promise<void> {
  const window = settlementWindowFor(m.closeTime.getTime());
  const windowTicks = await prisma.brtiTick.findMany({
    where: { timestamp: { gte: new Date(window.windowStart), lt: new Date(window.windowEnd) } },
    orderBy: { timestamp: "asc" },
  });

  const realized = computeRealizedSettlement(
    windowTicks.map((t) => ({ timestamp: t.timestamp.getTime(), value: t.value })),
    m.floorStrike,
  );

  let side: Side = realized.side;
  try {
    const km = await getMarket(m.id);
    if (km.result === "yes") side = "YES";
    else if (km.result === "no") side = "NO";
  } catch {
    // Kalshi lookup failed — keep our own BRTI-window computation.
  }

  await prisma.market.update({
    where: { id: m.id },
    data: {
      status: "SETTLED",
      settlementAvg: Number.isFinite(realized.average) ? realized.average : null,
      settlementSide: side,
      settledAt: now,
    },
  });

  const trade = await prisma.trade.findUnique({ where: { marketId: m.id } });
  if (trade && trade.status === "OPEN") {
    const pnl = settleTrade(
      { side: trade.side, entryPriceCts: trade.entryPriceCts, stake: trade.stake },
      side,
    );
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: trade.side === side ? "WON" : "LOST",
        settlementSide: side,
        pnl,
        settledAt: now,
      },
    });
  }
}
