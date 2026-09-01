import { randNormal } from "./rng";
import type { MonteCarloInput, MonteCarloResult } from "./types";
import { TARGET_STEP_MS } from "./volatility";

/** Number of one-second observations Kalshi averages to produce the
 * official settlement value for a 15-minute BTC market. */
export const SETTLEMENT_WINDOW_SECONDS = 60;

const ONE_SECOND_MS = 1000;

/**
 * Reproduces Kalshi's real settlement mechanism: the outcome is decided by
 * the simple average of 60 one-second BRTI observations taken during the
 * final minute before expiration — not the final tick.
 *
 * Simulates a zero-drift geometric Brownian motion seeded at `currentPrice`,
 * using `sigma5s` (stdev of a log return over a 5-second step) as the sole
 * volatility input. Any settlement-window observations already recorded
 * (`observedWindowTicks`) are treated as fixed and only the remaining,
 * still-unknown seconds are simulated — so a path can never "know" values
 * that haven't happened yet.
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const {
    currentPrice,
    strike,
    msUntilWindowStart,
    sigma5s,
    paths,
    observedWindowTicks,
    rng = Math.random,
  } = input;

  if (paths <= 0) {
    throw new Error("paths must be > 0");
  }

  const observedSum = observedWindowTicks.reduce((s, v) => s + v, 0);
  const observedCount = observedWindowTicks.length;
  const remaining = Math.max(0, SETTLEMENT_WINDOW_SECONDS - observedCount);

  // Variance of a driftless log-return accumulated over `ms` milliseconds,
  // derived from the 5-second-step volatility: Var scales linearly with time.
  const varForMs = (ms: number) => sigma5s * sigma5s * (ms / TARGET_STEP_MS);

  const varToWindowStart = Math.max(0, varForMs(msUntilWindowStart));
  const sdToWindowStart = Math.sqrt(varToWindowStart);

  const sdPerSecond = Math.sqrt(varForMs(ONE_SECOND_MS));

  let yesCount = 0;
  let noCount = 0;
  let pushCount = 0;

  const logCurrent = Math.log(currentPrice);

  for (let p = 0; p < paths; p++) {
    // Jump straight to the window-start price. Summing independent normal
    // log-increments is itself normal with the summed variance, so a single
    // jump is exact for a driftless GBM — no need to step every 5s.
    let logPrice =
      sdToWindowStart > 0 ? logCurrent + sdToWindowStart * randNormal(rng) : logCurrent;

    let simulatedSum = 0;
    for (let s = 0; s < remaining; s++) {
      if (sdPerSecond > 0) {
        logPrice += sdPerSecond * randNormal(rng);
      }
      simulatedSum += Math.exp(logPrice);
    }

    const settlementAvg = (observedSum + simulatedSum) / SETTLEMENT_WINDOW_SECONDS;

    if (settlementAvg > strike) yesCount++;
    else if (settlementAvg < strike) noCount++;
    else pushCount++;
  }

  return {
    modelYes: yesCount / paths,
    modelNo: noCount / paths,
    modelPush: pushCount / paths,
  };
}
