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

/**
 * A precomputed set of random shocks for a fixed volatility regime, reused
 * across many cheap re-pricings instead of drawing fresh randomness every
 * call. Valid as long as `sigma5s` hasn't materially changed — regenerate
 * periodically (e.g. every few minutes) as the realized-vol estimate
 * updates, not on every price tick.
 */
export interface SimulationRegime {
  sigma5s: number;
  paths: number;
  generatedAt: number; // epoch ms
  /** One N(0,1) draw per path, for the jump from "now" to the settlement
   * window's start. Rescaled by the current time-remaining on every
   * evaluation — see evaluateWithRegime. */
  jumpZ: Float64Array;
  /** `paths * SETTLEMENT_WINDOW_SECONDS` N(0,1) draws, path-major: shock
   * `s` (0-59) of path `p` lives at index `p * 60 + s`. */
  windowStepZ: Float64Array;
}

export function generateRegime(
  sigma5s: number,
  paths: number,
  rng: () => number = Math.random,
): SimulationRegime {
  if (paths <= 0) {
    throw new Error("paths must be > 0");
  }
  const jumpZ = new Float64Array(paths);
  const windowStepZ = new Float64Array(paths * SETTLEMENT_WINDOW_SECONDS);
  for (let p = 0; p < paths; p++) {
    jumpZ[p] = randNormal(rng);
    const base = p * SETTLEMENT_WINDOW_SECONDS;
    for (let s = 0; s < SETTLEMENT_WINDOW_SECONDS; s++) {
      windowStepZ[base + s] = randNormal(rng);
    }
  }
  return { sigma5s, paths, generatedAt: Date.now(), jumpZ, windowStepZ };
}

export interface RegimeEvalInput {
  regime: SimulationRegime;
  currentPrice: number;
  strike: number;
  msUntilWindowStart: number;
  observedWindowTicks: number[];
}

/**
 * Cheap re-pricing against a precomputed regime — the Monte Carlo
 * equivalent of "common random numbers": the same underlying shocks are
 * replayed against updated (price, time-remaining) inputs rather than
 * redrawn, which is mathematically valid because a driftless GBM's future
 * distribution depends only on the current state (Markov property), not
 * simulation history. No random sampling happens in this function at all —
 * it's O(paths) arithmetic, fast enough to call every second or faster.
 * Produces the same distribution runMonteCarlo would for the same inputs,
 * just smoother tick-to-tick since the path skeleton is shared.
 */
export function evaluateWithRegime(input: RegimeEvalInput): MonteCarloResult {
  const { regime, currentPrice, strike, msUntilWindowStart, observedWindowTicks } = input;
  const { sigma5s, paths, jumpZ, windowStepZ } = regime;

  const observedSum = observedWindowTicks.reduce((s, v) => s + v, 0);
  const observedCount = observedWindowTicks.length;
  const remaining = Math.max(0, SETTLEMENT_WINDOW_SECONDS - observedCount);

  const varForMs = (ms: number) => sigma5s * sigma5s * (ms / TARGET_STEP_MS);
  const sdToWindowStart = Math.sqrt(Math.max(0, varForMs(msUntilWindowStart)));
  const sdPerSecond = Math.sqrt(varForMs(ONE_SECOND_MS));

  const logCurrent = Math.log(currentPrice);

  let yesCount = 0;
  let noCount = 0;
  let pushCount = 0;

  for (let p = 0; p < paths; p++) {
    let logPrice = sdToWindowStart > 0 ? logCurrent + sdToWindowStart * jumpZ[p]! : logCurrent;

    let simulatedSum = 0;
    // Shock index == window-second index, so as `observedCount` grows
    // second by second through the live window, this naturally advances
    // through the same fixed shock sequence rather than jumping around.
    const base = p * SETTLEMENT_WINDOW_SECONDS + observedCount;
    for (let s = 0; s < remaining; s++) {
      if (sdPerSecond > 0) {
        logPrice += sdPerSecond * windowStepZ[base + s]!;
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
