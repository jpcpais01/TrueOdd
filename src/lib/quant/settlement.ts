import type { Tick, Side } from "./types";
import { SETTLEMENT_WINDOW_SECONDS } from "./montecarlo";

export const SETTLEMENT_WINDOW_MS = SETTLEMENT_WINDOW_SECONDS * 1000;

export interface SettlementWindow {
  /** epoch ms — start of the 60s observation window (closeTime - 60s) */
  windowStart: number;
  /** epoch ms — market close / expiration time */
  windowEnd: number;
}

export function settlementWindowFor(closeTimeMs: number): SettlementWindow {
  return { windowStart: closeTimeMs - SETTLEMENT_WINDOW_MS, windowEnd: closeTimeMs };
}

/**
 * Selects, in chronological order, the ticks that fall inside a market's
 * 60-second settlement observation window: [windowStart, windowEnd).
 * Pure and side-effect free so it can be unit tested against fixed inputs
 * independent of the DB layer that supplies the raw tick history.
 */
export function selectWindowTicks(ticks: Tick[], window: SettlementWindow): Tick[] {
  return ticks
    .filter((t) => t.timestamp >= window.windowStart && t.timestamp < window.windowEnd)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export interface RealizedSettlement {
  average: number;
  side: Side;
  observationCount: number;
  /** true if we had fewer than the expected 60 observations (data gap) */
  incomplete: boolean;
}

/**
 * Computes Kalshi's actual settlement value: the simple average of the 60
 * one-second BRTI observations from the final minute, compared to the
 * market's strike ("Price To Beat").
 */
export function computeRealizedSettlement(
  windowTicks: Tick[],
  strike: number,
): RealizedSettlement {
  const observationCount = windowTicks.length;
  const average =
    observationCount > 0
      ? windowTicks.reduce((s, t) => s + t.value, 0) / observationCount
      : NaN;

  return {
    average,
    side: average > strike ? "YES" : "NO",
    observationCount,
    incomplete: observationCount !== SETTLEMENT_WINDOW_SECONDS,
  };
}
