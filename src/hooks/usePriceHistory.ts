"use client";

import { useRef, useState, useEffect } from "react";

export interface PricePoint {
  timestamp: number;
  brti: number;
}

/**
 * Accumulates a rolling client-side buffer of live price points for the
 * chart, keyed off whatever the current tick's snapshot is — no new
 * backend endpoint needed, since /api/state already returns a fresh point
 * every poll. Resets when the ticker changes (a new 15m market opened) and
 * dedupes/no-ops when the same snapshot timestamp repeats (a throttled or
 * unchanged tick). Chart starts empty on a fresh page load and fills in
 * live as ticks arrive — expected and fine for a market that only lives
 * 15 minutes anyway.
 */
export function usePriceHistory(
  ticker: string | null,
  latest: PricePoint | null,
  maxPoints = 600,
): PricePoint[] {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const tickerRef = useRef<string | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ticker || !latest) return;

    if (tickerRef.current !== ticker) {
      tickerRef.current = ticker;
      lastTsRef.current = latest.timestamp;
      setPoints([latest]);
      return;
    }

    if (lastTsRef.current === latest.timestamp) return;
    lastTsRef.current = latest.timestamp;

    setPoints((prev) => {
      const next = [...prev, latest];
      return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
    });
  }, [ticker, latest, maxPoints]);

  return points;
}
