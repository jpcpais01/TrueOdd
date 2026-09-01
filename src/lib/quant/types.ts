export interface Tick {
  /** epoch milliseconds */
  timestamp: number;
  value: number;
}

export interface VolatilityResult {
  /** stdev of log returns per 5-second step (zero-drift GBM step size) */
  sigma5s: number;
  /** number of clean consecutive-return samples used */
  sampleSize: number;
  /** true if sampleSize is below the minimum needed for a reliable estimate */
  warmup: boolean;
}

export interface MonteCarloInput {
  /** current BRTI price */
  currentPrice: number;
  /** the market's floor strike ("Price To Beat") */
  strike: number;
  /** ms until the 60s settlement observation window begins (0 if already inside it) */
  msUntilWindowStart: number;
  /** per-5s-step stdev of log returns, zero drift assumed */
  sigma5s: number;
  /** number of Monte Carlo paths to simulate */
  paths: number;
  /**
   * Observations from the 60-second settlement window that have already
   * been recorded (fixed, not simulated), in chronological order. Empty if
   * we have not entered the window yet.
   */
  observedWindowTicks: number[];
  /** RNG override, primarily for deterministic tests */
  rng?: () => number;
}

export interface MonteCarloResult {
  modelYes: number;
  modelNo: number;
  /** fraction of paths that landed exactly on the strike (excluded from yes/no) */
  modelPush: number;
}

export interface EdgeInput {
  modelYes: number;
  modelNo: number;
  /** best ask for YES, in cents (1-99) */
  yesAskCts: number;
  /** best ask for NO, in cents (1-99) */
  noAskCts: number;
}

export interface EdgeResult {
  edgeYes: number;
  edgeNo: number;
}

export type Side = "YES" | "NO";
