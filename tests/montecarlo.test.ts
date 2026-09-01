import { describe, it, expect } from "vitest";
import { runMonteCarlo, SETTLEMENT_WINDOW_SECONDS } from "@/lib/quant/montecarlo";
import { mulberry32 } from "@/lib/quant/rng";

describe("runMonteCarlo", () => {
  it("is fully deterministic (100% one side) with zero volatility", () => {
    const above = runMonteCarlo({
      currentPrice: 65_100,
      strike: 65_000,
      msUntilWindowStart: 120_000,
      sigma5s: 0,
      paths: 500,
      observedWindowTicks: [],
      rng: mulberry32(1),
    });
    expect(above.modelYes).toBe(1);
    expect(above.modelNo).toBe(0);

    const below = runMonteCarlo({
      currentPrice: 64_900,
      strike: 65_000,
      msUntilWindowStart: 120_000,
      sigma5s: 0,
      paths: 500,
      observedWindowTicks: [],
      rng: mulberry32(1),
    });
    expect(below.modelYes).toBe(0);
    expect(below.modelNo).toBe(1);
  });

  it("is ~50/50 when price sits exactly at the strike with symmetric noise", () => {
    const result = runMonteCarlo({
      currentPrice: 65_000,
      strike: 65_000,
      msUntilWindowStart: 300_000,
      sigma5s: 0.0006,
      paths: 20_000,
      observedWindowTicks: [],
      rng: mulberry32(123),
    });
    expect(result.modelYes).toBeGreaterThan(0.45);
    expect(result.modelYes).toBeLessThan(0.55);
    expect(result.modelYes + result.modelNo + result.modelPush).toBeCloseTo(1, 6);
  });

  it("shifts probability toward YES as current price rises above strike", () => {
    const base = {
      strike: 65_000,
      msUntilWindowStart: 300_000,
      sigma5s: 0.0006,
      paths: 20_000,
      observedWindowTicks: [] as number[],
    };
    const low = runMonteCarlo({ ...base, currentPrice: 64_950, rng: mulberry32(9) });
    const mid = runMonteCarlo({ ...base, currentPrice: 65_000, rng: mulberry32(9) });
    const high = runMonteCarlo({ ...base, currentPrice: 65_050, rng: mulberry32(9) });
    expect(low.modelYes).toBeLessThan(mid.modelYes);
    expect(mid.modelYes).toBeLessThan(high.modelYes);
  });

  it("more time remaining (more uncertainty) pulls probability toward 50/50", () => {
    const near = runMonteCarlo({
      currentPrice: 65_200,
      strike: 65_000,
      msUntilWindowStart: 10_000,
      sigma5s: 0.0006,
      paths: 20_000,
      observedWindowTicks: [],
      rng: mulberry32(3),
    });
    const far = runMonteCarlo({
      currentPrice: 65_200,
      strike: 65_000,
      msUntilWindowStart: 800_000,
      sigma5s: 0.0006,
      paths: 20_000,
      observedWindowTicks: [],
      rng: mulberry32(3),
    });
    // With almost no time left, a price already comfortably above strike
    // should be more certain to settle YES than with 13+ minutes left to run.
    expect(near.modelYes).toBeGreaterThan(far.modelYes);
  });

  it("honors already-observed settlement-window ticks as fixed, only simulating the remainder", () => {
    // 59 of the 60 seconds are already locked in with an average that sits
    // just below the strike; even with zero vol for the one remaining
    // second, the realized fixed portion should dominate the outcome.
    const observed = new Array(59).fill(64_990); // sum = 59 * 64990
    const result = runMonteCarlo({
      currentPrice: 64_990,
      strike: 65_000,
      msUntilWindowStart: 0,
      sigma5s: 0, // no uncertainty left in the final second either
      paths: 100,
      observedWindowTicks: observed,
      rng: mulberry32(1),
    });
    // avg = (59*64990 + 64990) / 60 = 64990 < strike -> should be certain NO
    expect(result.modelNo).toBe(1);
  });

  it("with all 60 seconds already observed, result is fully determined (no simulation)", () => {
    const observed = new Array(SETTLEMENT_WINDOW_SECONDS).fill(65_010);
    const result = runMonteCarlo({
      currentPrice: 65_010,
      strike: 65_000,
      msUntilWindowStart: 0,
      sigma5s: 0.01, // vol should be irrelevant now
      paths: 50,
      observedWindowTicks: observed,
      rng: mulberry32(1),
    });
    expect(result.modelYes).toBe(1);
  });

  it("throws on non-positive path counts", () => {
    expect(() =>
      runMonteCarlo({
        currentPrice: 65_000,
        strike: 65_000,
        msUntilWindowStart: 0,
        sigma5s: 0.001,
        paths: 0,
        observedWindowTicks: [],
      }),
    ).toThrow();
  });
});
