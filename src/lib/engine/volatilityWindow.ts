import { prisma } from "@/lib/db/prisma";
import { estimateVolatility } from "@/lib/quant/volatility";
import type { VolatilityResult } from "@/lib/quant/types";

export interface RollingVolatility extends VolatilityResult {
  /** Completed-15m-market-equivalents of history actually covered
   * (fractional, e.g. 3.4 of 10) — a coverage measure, not a literal count
   * of Market rows; see the time-based design note below. */
  marketsUsed: number;
  marketsRequired: number;
}

export const MARKET_DURATION_MS = 15 * 60 * 1000;

/** How long a cached volatility estimate is reused before recomputing from
 * the full tick history. Volatility doesn't meaningfully change second to
 * second, but recomputing it means scanning every BrtiTick in the lookback
 * window (thousands of rows) — real, avoidable cost on a stateless
 * serverless invocation that would otherwise pay for it on every tick. */
const CACHE_TTL_MS = 30_000;

/**
 * Recomputes realized volatility from 5-second-equivalent BRTI log returns
 * across the previous `lookbackMarkets * 15` minutes of persisted tick
 * history — a time-based window, not one tied to actual completed Kalshi
 * `Market` rows. That distinction matters: it's what lets a one-time
 * Binance backfill (src/lib/engine/backfill.ts) count toward exiting
 * warm-up immediately, rather than requiring `lookbackMarkets` real Kalshi
 * markets to have actually settled first, which could otherwise take hours
 * even with a full backfill sitting in the BrtiTick table unused.
 *
 * Cached in the DB (see the VolatilityCache model) for CACHE_TTL_MS so
 * repeated calls a few seconds apart — the normal case on every code path
 * in this app — reuse the same estimate instead of rescanning the full
 * history each time.
 */
export async function computeRollingVolatility(
  lookbackMarkets: number,
  now: Date = new Date(),
): Promise<RollingVolatility> {
  const cached = await prisma.volatilityCache.findUnique({ where: { id: 1 } });
  if (
    cached &&
    cached.lookbackMarkets === lookbackMarkets &&
    now.getTime() - cached.computedAt.getTime() < CACHE_TTL_MS
  ) {
    return {
      sigma5s: cached.sigma5s,
      sampleSize: cached.sampleSize,
      warmup: cached.warmup,
      marketsUsed: cached.marketsUsed,
      marketsRequired: cached.marketsRequired,
    };
  }

  const requiredMs = lookbackMarkets * MARKET_DURATION_MS;
  const windowStart = new Date(now.getTime() - requiredMs);

  const ticks = await prisma.brtiTick.findMany({
    where: { timestamp: { gte: windowStart, lte: now } },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true, value: true },
  });

  const result = estimateVolatility(
    ticks.map((t) => ({ timestamp: t.timestamp.getTime(), value: t.value })),
  );

  const coverageMs = ticks.length > 0 ? now.getTime() - ticks[0]!.timestamp.getTime() : 0;
  // Require close to full coverage (95%) rather than exact, so a few
  // minutes of unavoidable startup lag don't keep it in warm-up forever.
  const coverageWarmup = coverageMs < requiredMs * 0.95;

  const rolling: RollingVolatility = {
    ...result,
    warmup: result.warmup || coverageWarmup,
    marketsUsed: Math.min(lookbackMarkets, coverageMs / MARKET_DURATION_MS),
    marketsRequired: lookbackMarkets,
  };

  await prisma.volatilityCache
    .upsert({
      where: { id: 1 },
      create: { id: 1, lookbackMarkets, ...rolling, computedAt: now },
      update: { lookbackMarkets, ...rolling, computedAt: now },
    })
    .catch((err) => {
      // Non-fatal — worst case the next call just recomputes again.
      console.error("[volatility] failed to write cache", err);
    });

  return rolling;
}
