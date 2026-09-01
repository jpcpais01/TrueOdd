import type { EdgeInput, EdgeResult } from "./types";

/** Converts a Kalshi cents price (1-99) to an implied probability (0-1). */
export function centsToProb(cents: number): number {
  return cents / 100;
}

/**
 * edgeYes = modelYes - yesBestAsk(as probability)
 * edgeNo  = modelNo  - noBestAsk(as probability)
 *
 * Positive edge means the model believes that side is priced cheap relative
 * to its estimated fair probability.
 */
export function computeEdge({ modelYes, modelNo, yesAskCts, noAskCts }: EdgeInput): EdgeResult {
  return {
    edgeYes: modelYes - centsToProb(yesAskCts),
    edgeNo: modelNo - centsToProb(noAskCts),
  };
}

export interface EntryDecision {
  shouldEnter: boolean;
  side: "YES" | "NO" | null;
  edge: number;
}

/**
 * Decides whether to paper-enter this tick. Trades the side with the larger
 * edge when both clear the threshold; ties break toward YES arbitrarily
 * (both edges being exactly equal is a measure-zero event in practice).
 */
export function decideEntry(edges: EdgeResult, minEdge: number): EntryDecision {
  const yesQualifies = edges.edgeYes >= minEdge;
  const noQualifies = edges.edgeNo >= minEdge;

  if (!yesQualifies && !noQualifies) {
    return { shouldEnter: false, side: null, edge: Math.max(edges.edgeYes, edges.edgeNo) };
  }

  if (yesQualifies && (!noQualifies || edges.edgeYes >= edges.edgeNo)) {
    return { shouldEnter: true, side: "YES", edge: edges.edgeYes };
  }

  return { shouldEnter: true, side: "NO", edge: edges.edgeNo };
}
