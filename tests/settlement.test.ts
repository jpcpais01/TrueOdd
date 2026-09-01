import { describe, it, expect } from "vitest";
import {
  settlementWindowFor,
  selectWindowTicks,
  computeRealizedSettlement,
} from "@/lib/quant/settlement";
import type { Tick } from "@/lib/quant/types";

describe("settlementWindowFor", () => {
  it("derives a 60s window ending exactly at close time", () => {
    const closeTime = 1_000_000_000;
    const window = settlementWindowFor(closeTime);
    expect(window.windowEnd).toBe(closeTime);
    expect(window.windowEnd - window.windowStart).toBe(60_000);
  });
});

describe("selectWindowTicks", () => {
  const window = settlementWindowFor(60_000); // [0, 60000)

  it("includes ticks at the start boundary and excludes the end boundary", () => {
    const ticks: Tick[] = [
      { timestamp: -1, value: 1 },
      { timestamp: 0, value: 100 },
      { timestamp: 59_999, value: 200 },
      { timestamp: 60_000, value: 300 },
    ];
    const selected = selectWindowTicks(ticks, window);
    expect(selected.map((t) => t.value)).toEqual([100, 200]);
  });

  it("returns ticks sorted chronologically regardless of input order", () => {
    const ticks: Tick[] = [
      { timestamp: 30_000, value: 3 },
      { timestamp: 0, value: 1 },
      { timestamp: 15_000, value: 2 },
    ];
    const selected = selectWindowTicks(ticks, window);
    expect(selected.map((t) => t.value)).toEqual([1, 2, 3]);
  });
});

describe("computeRealizedSettlement", () => {
  it("resolves YES when the 60-observation average is strictly above strike", () => {
    const ticks: Tick[] = new Array(60).fill(0).map((_, i) => ({ timestamp: i, value: 65_010 }));
    const result = computeRealizedSettlement(ticks, 65_000);
    expect(result.average).toBe(65_010);
    expect(result.side).toBe("YES");
    expect(result.observationCount).toBe(60);
    expect(result.incomplete).toBe(false);
  });

  it("resolves NO when the average is at or below strike", () => {
    const ticks: Tick[] = new Array(60).fill(0).map((_, i) => ({ timestamp: i, value: 65_000 }));
    const result = computeRealizedSettlement(ticks, 65_000);
    expect(result.side).toBe("NO");
  });

  it("flags an incomplete window when fewer than 60 observations were captured", () => {
    const ticks: Tick[] = new Array(45).fill(0).map((_, i) => ({ timestamp: i, value: 65_010 }));
    const result = computeRealizedSettlement(ticks, 65_000);
    expect(result.incomplete).toBe(true);
    expect(result.observationCount).toBe(45);
  });

  it("correctly averages a mixed set of observations straddling the strike", () => {
    // 30 ticks at 64,900 and 30 ticks at 65,100 -> average = 65,000 exactly
    const ticks: Tick[] = [
      ...new Array(30).fill(0).map((_, i) => ({ timestamp: i, value: 64_900 })),
      ...new Array(30).fill(0).map((_, i) => ({ timestamp: 30 + i, value: 65_100 })),
    ];
    const result = computeRealizedSettlement(ticks, 65_000);
    expect(result.average).toBe(65_000);
    expect(result.side).toBe("NO"); // exactly-at-strike resolves NO per Kalshi "strictly above" rule
  });
});
