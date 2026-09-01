import type { Tick, VolatilityResult } from "./types";

/** The nominal sampling cadence the model steps on. */
export const TARGET_STEP_MS = 5000;

/**
 * Log returns spanning more than this are treated as a data outage (a
 * polling gap, an API error stretch, etc.) and excluded so a stale
 * reconnect doesn't masquerade as a single giant realized move. Sized to
 * admit the 60-second-spaced points from the Binance 1-minute-kline
 * volatility backfill (see engine/backfill.ts) as legitimate consecutive
 * observations, not an outage, while still catching genuine multi-minute
 * gaps in the live feed.
 */
export const MAX_GAP_MS = 65_000;

/** Returns spanning less than this are dropped — duplicate/near-duplicate
 * timestamps blow up the variance estimate once divided by a tiny dt. */
export const MIN_GAP_MS = 500;

/**
 * Below this many clean returns the volatility estimate is not trustworthy
 * enough to trade on — the app should show warm-up mode instead.
 */
export const MIN_RETURNS_FOR_RELIABLE_VOL = 100;

/**
 * Estimate zero-drift realized volatility, expressed as the standard
 * deviation of a log return over one 5-second step, from a (possibly
 * irregularly spaced) series of BRTI ticks.
 *
 * Irregular spacing is handled by treating each consecutive pair as an
 * independent driftless-Brownian-motion observation: Var(log return over dt)
 * = sigma^2 * dt. We accumulate a per-millisecond variance rate from every
 * clean pair and rescale to a 5-second step at the end, rather than
 * requiring ticks to land exactly on a 5s grid.
 */
export function estimateVolatility(ticks: Tick[]): VolatilityResult {
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);

  let sumSquaredRatePerMs = 0;
  let n = 0;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const dt = cur.timestamp - prev.timestamp;
    if (dt < MIN_GAP_MS || dt > MAX_GAP_MS) continue;
    if (prev.value <= 0 || cur.value <= 0) continue;

    const r = Math.log(cur.value / prev.value);
    // zero-drift assumption: variance rate per ms ≈ r^2 / dt
    sumSquaredRatePerMs += (r * r) / dt;
    n++;
  }

  if (n === 0) {
    return { sigma5s: 0, sampleSize: 0, warmup: true };
  }

  const variancePerMs = sumSquaredRatePerMs / n;
  const sigma5s = Math.sqrt(variancePerMs * TARGET_STEP_MS);

  return {
    sigma5s,
    sampleSize: n,
    warmup: n < MIN_RETURNS_FOR_RELIABLE_VOL,
  };
}
