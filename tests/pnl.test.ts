import { describe, it, expect } from "vitest";
import {
  computeFill,
  settleTrade,
  computePortfolioStats,
  brierScore,
  calibrationCurve,
} from "@/lib/quant/pnl";

describe("computeFill", () => {
  it("buys the floor number of whole contracts affordable at the ask", () => {
    const fill = computeFill({ side: "YES", entryPriceCts: 55, stake: 10 });
    // 10 / 0.55 = 18.18 -> 18 contracts
    expect(fill.contracts).toBe(18);
    expect(fill.cost).toBeCloseTo(18 * 0.55);
  });

  it("handles a price that divides the stake evenly", () => {
    const fill = computeFill({ side: "NO", entryPriceCts: 50, stake: 10 });
    expect(fill.contracts).toBe(20);
    expect(fill.cost).toBeCloseTo(10);
  });
});

describe("settleTrade", () => {
  it("pays $1 per contract on a win, minus the cost already paid", () => {
    const entry = { side: "YES" as const, entryPriceCts: 40, stake: 10 };
    // 10 / 0.40 = 25 contracts, cost = 10
    const pnl = settleTrade(entry, "YES");
    expect(pnl).toBeCloseTo(25 * 1 - 10); // = 15
  });

  it("loses exactly the cost on a loss", () => {
    const entry = { side: "YES" as const, entryPriceCts: 40, stake: 10 };
    const pnl = settleTrade(entry, "NO");
    expect(pnl).toBeCloseTo(-10);
  });

  it("is zero pnl if stake could not afford a single contract", () => {
    const entry = { side: "YES" as const, entryPriceCts: 99, stake: 0.5 };
    const pnl = settleTrade(entry, "YES");
    expect(pnl).toBe(0);
  });
});

describe("computePortfolioStats", () => {
  it("aggregates win rate, pnl, roi, and drawdown across a trade sequence", () => {
    const trades = [
      { stake: 10, cost: 10, pnl: 15 }, // cum 15, peak 15
      { stake: 10, cost: 10, pnl: -10 }, // cum 5, dd 10
      { stake: 10, cost: 10, pnl: -10 }, // cum -5, dd 20
      { stake: 10, cost: 10, pnl: 20 }, // cum 15, peak still 15
    ];
    const stats = computePortfolioStats(trades);
    expect(stats.totalTrades).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.totalPnl).toBeCloseTo(15);
    expect(stats.totalStaked).toBeCloseTo(40);
    expect(stats.roi).toBeCloseTo(15 / 40);
    expect(stats.maxDrawdown).toBeCloseTo(20);
  });

  it("returns zeroed stats for an empty trade list", () => {
    const stats = computePortfolioStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.maxDrawdown).toBe(0);
  });
});

describe("brierScore", () => {
  it("scores 0 for perfectly confident and correct predictions", () => {
    const score = brierScore([
      { prob: 1, won: true },
      { prob: 0, won: false },
    ]);
    expect(score).toBeCloseTo(0);
  });

  it("scores 1 for perfectly confident and wrong predictions", () => {
    const score = brierScore([{ prob: 1, won: false }]);
    expect(score).toBeCloseTo(1);
  });

  it("scores 0.25 for a coin-flip predictor regardless of outcome", () => {
    const score = brierScore([
      { prob: 0.5, won: true },
      { prob: 0.5, won: false },
    ]);
    expect(score).toBeCloseTo(0.25);
  });
});

describe("calibrationCurve", () => {
  it("buckets predictions and compares predicted mean vs observed frequency", () => {
    const predictions = [
      { prob: 0.55, won: true },
      { prob: 0.58, won: false },
      { prob: 0.95, won: true },
      { prob: 0.92, won: true },
    ];
    const curve = calibrationCurve(predictions, 10);
    expect(curve).toHaveLength(10);
    const bucket55 = curve[5]!; // [0.5, 0.6)
    expect(bucket55.count).toBe(2);
    expect(bucket55.observedFrequency).toBeCloseTo(0.5);
    const bucket90 = curve[9]!; // [0.9, 1.0)
    expect(bucket90.count).toBe(2);
    expect(bucket90.observedFrequency).toBeCloseTo(1);
  });

  it("leaves empty buckets at zero without dividing by zero", () => {
    const curve = calibrationCurve([{ prob: 0.05, won: false }], 10);
    expect(curve[9]!.count).toBe(0);
    expect(curve[9]!.observedFrequency).toBe(0);
  });
});
