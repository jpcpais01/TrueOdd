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
 * Warm-up itself is driven purely by `estimateVolatility`'s own sample-size
 * check (enough clean log returns to trust the estimate) — NOT by how much
 * of the requested time window is literally covered by rows in the DB. An
 * earlier version additionally required ~95% of the full lookback window
 * to be covered by wall-clock-old data before clearing warm-up; that meant
 * that if the one-shot Binance backfill ever failed or came back partial
 * (a transient network hiccup, a slow first request), the app would fall
 * back to waiting out the *entire* lookback window in real time — up to
 * hours — before warm-up cleared, even once plenty of clean backfilled
 * returns were sitting in the table. A successful Binance backfill already
 * hands us `lookbackMarkets * 15` minutes of 1-minute-spaced closes in one
 * request, which is far more than the ~100 clean returns needed to trust
 * the estimate — so sample size is both sufficient and the only signal
 * that should gate trading.
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

  // Coverage (how much of the requested window has any data at all) is
  // kept purely as a display/progress figure for the warm-up banner — see
  // the doc comment above for why it no longer gates `warmup` itself.
  const coverageMs = ticks.length > 0 ? now.getTime() - ticks[0]!.timestamp.getTime() : 0;

  const rolling: RollingVolatility = {
    ...result,
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
