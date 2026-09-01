/** A BRTI observation older than this is considered stale — the engine
 * still records a snapshot (for research completeness) but will never
 * paper-trade off it. */
export const MAX_BRTI_STALENESS_MS = 15_000;

export const DEFAULT_SETTINGS = {
  lookbackMarkets: 10,
  mcPaths: 10_000,
  minEdge: 0.02,
  paperStake: 10,
} as const;
