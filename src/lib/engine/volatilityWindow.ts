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

/**
 * Recomputes realized volatility from 5-second-equivalent BRTI log returns
 * across the previous `lookbackMarkets * 15` minutes of persisted tick
 * history — a time-based window, not one tied to actual completed Kalshi
 * `Market` rows. That distinction matters: it's what lets a one-time
 * Binance backfill (src/lib/engine/backfill.ts) count toward exiting
 * warm-up immediately, rather than requiring `lookbackMarkets` real Kalshi
 * markets to have actually settled first, which could otherwise take hours
 * even with a full backfill sitting in the BrtiTick table unused.
 */
export async function computeRollingVolatility(
  lookbackMarkets: number,
  now: Date = new Date(),
): Promise<RollingVolatility> {
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

  return {
    ...result,
    warmup: result.warmup || coverageWarmup,
    marketsUsed: Math.min(lookbackMarkets, coverageMs / MARKET_DURATION_MS),
    marketsRequired: lookbackMarkets,
  };
}
