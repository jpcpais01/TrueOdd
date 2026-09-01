import { describe, it, expect } from "vitest";
import {
  estimateVolatility,
  MIN_RETURNS_FOR_RELIABLE_VOL,
  TARGET_STEP_MS,
} from "@/lib/quant/volatility";
import { mulberry32, randNormal } from "@/lib/quant/rng";
import type { Tick } from "@/lib/quant/types";

function buildGbmSeries(opts: {
  n: number;
  stepMs: number;
  sigmaPerStep: number;
  seed: number;
  start?: number;
}): Tick[] {
  const { n, stepMs, sigmaPerStep, seed, start = 65_000 } = opts;
  const rng = mulberry32(seed);
  const ticks: Tick[] = [{ timestamp: 0, value: start }];
  let logPrice = Math.log(start);
  for (let i = 1; i <= n; i++) {
    logPrice += sigmaPerStep * randNormal(rng);
    ticks.push({ timestamp: i * stepMs, value: Math.exp(logPrice) });
  }
  return ticks;
}

describe("estimateVolatility", () => {
  it("flags warmup when there is little or no data", () => {
    const result = estimateVolatility([]);
    expect(result.warmup).toBe(true);
    expect(result.sigma5s).toBe(0);
    expect(result.sampleSize).toBe(0);
  });

  it("flags warmup below the minimum reliable sample size", () => {
    const ticks = buildGbmSeries({ n: 10, stepMs: TARGET_STEP_MS, sigmaPerStep: 0.001, seed: 1 });
    const result = estimateVolatility(ticks);
    expect(result.sampleSize).toBe(10);
    expect(result.warmup).toBe(true);
  });

  it("recovers the true per-5s sigma from a synthetic GBM series sampled on the 5s grid", () => {
    const trueSigma = 0.0009;
    const ticks = buildGbmSeries({
      n: 5000,
      stepMs: TARGET_STEP_MS,
      sigmaPerStep: trueSigma,
      seed: 42,
    });
    const result = estimateVolatility(ticks);
    expect(result.warmup).toBe(false);
    expect(result.sampleSize).toBeGreaterThanOrEqual(MIN_RETURNS_FOR_RELIABLE_VOL);
    // Large-sample estimate should land within ~10% of the true parameter.
    expect(result.sigma5s).toBeGreaterThan(trueSigma * 0.9);
    expect(result.sigma5s).toBeLessThan(trueSigma * 1.1);
  });

  it("rescales correctly for irregular (non-5s-grid) spacing", () => {
    // Same underlying process, but sampled once per second instead of every
    // 5 seconds. The recovered 5s-equivalent sigma should still match.
    const trueSigmaPerSecond = 0.0004; // implies sigma5s = trueSigmaPerSecond * sqrt(5)
    const ticks = buildGbmSeries({
      n: 20_000,
      stepMs: 1000,
      sigmaPerStep: trueSigmaPerSecond,
      seed: 7,
    });
    const result = estimateVolatility(ticks);
    const expectedSigma5s = trueSigmaPerSecond * Math.sqrt(5);
    expect(result.sigma5s).toBeGreaterThan(expectedSigma5s * 0.92);
    expect(result.sigma5s).toBeLessThan(expectedSigma5s * 1.08);
  });

  it("excludes returns spanning a large gap (data outage)", () => {
    const ticks: Tick[] = [
      { timestamp: 0, value: 65_000 },
      { timestamp: 5000, value: 65_050 },
      // 10 minute gap — should not be treated as one giant realized move
      { timestamp: 5000 + 10 * 60_000, value: 70_000 },
      { timestamp: 5000 + 10 * 60_000 + 5000, value: 70_020 },
    ];
    const result = estimateVolatility(ticks);
    expect(result.sampleSize).toBe(2);
  });

  it("ignores non-positive or duplicate-timestamp values without throwing", () => {
    const ticks: Tick[] = [
      { timestamp: 0, value: 65_000 },
      { timestamp: 0, value: 65_000 }, // dt = 0, dropped
      { timestamp: 5000, value: 65_010 },
    ];
    expect(() => estimateVolatility(ticks)).not.toThrow();
  });
});
