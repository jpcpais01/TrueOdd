import { describe, it, expect } from "vitest";
import { parseCfBenchmarksValues } from "@/lib/kalshi/brti";

describe("parseCfBenchmarksValues", () => {
  it("parses the confirmed live CF Benchmarks response shape", () => {
    // Real sample captured from the deployed app: string-encoded value,
    // epoch-ms time, wrapped in a trailing-window array.
    const resp = {
      data: {
        serverTime: "2026-09-01T03:06:50.963Z",
        payload: [
          { value: "78274.43", time: 1788228411000 },
          { value: "78272.03", time: 1788228412000 },
          { value: "78268.82", time: 1788228413000 },
          { value: "78270.34", time: 1788228414000 },
          { value: "78270.32", time: 1788228415000 },
          { value: "78270.59", time: 1788228416000 },
        ],
      },
    };

    const ticks = parseCfBenchmarksValues(resp);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toEqual({ timestamp: 1788228411000, value: 78274.43 });
    expect(ticks[ticks.length - 1]).toEqual({ timestamp: 1788228416000, value: 78270.59 });
    // sorted chronologically
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.timestamp).toBeGreaterThan(ticks[i - 1]!.timestamp);
    }
  });

  it("sorts out-of-order entries chronologically", () => {
    const resp = {
      data: {
        payload: [
          { value: "100", time: 1_700_000_003_000 },
          { value: "99", time: 1_700_000_001_000 },
          { value: "101", time: 1_700_000_002_000 },
        ],
      },
    };
    const ticks = parseCfBenchmarksValues(resp);
    expect(ticks.map((t) => t.timestamp)).toEqual([
      1_700_000_001_000,
      1_700_000_002_000,
      1_700_000_003_000,
    ]);
  });

  it("rescales second-precision timestamps to milliseconds", () => {
    const resp = { data: { payload: [{ value: "50000", time: 1_700_000_000 }] } };
    const ticks = parseCfBenchmarksValues(resp);
    expect(ticks[0]!.timestamp).toBe(1_700_000_000_000);
  });

  it("skips entries with a non-numeric value", () => {
    const resp = {
      data: {
        payload: [
          { value: "not-a-number", time: 1000 },
          { value: "42.5", time: 2000 },
        ],
      },
    };
    const ticks = parseCfBenchmarksValues(resp);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.value).toBe(42.5);
  });

  it("returns an empty array for a missing or empty payload", () => {
    expect(parseCfBenchmarksValues({})).toEqual([]);
    expect(parseCfBenchmarksValues({ data: {} })).toEqual([]);
    expect(parseCfBenchmarksValues({ data: { payload: [] } })).toEqual([]);
  });

  it("falls back to parsing a single non-array payload object", () => {
    const resp = { data: { payload: { value: "65000.12", time: 1_800_000_000_000 } } };
    const ticks = parseCfBenchmarksValues(resp);
    expect(ticks).toEqual([{ timestamp: 1_800_000_000_000, value: 65000.12 }]);
  });
});
