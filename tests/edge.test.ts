import { describe, it, expect } from "vitest";
import { centsToProb, computeEdge, decideEntry } from "@/lib/quant/edge";

describe("centsToProb", () => {
  it("converts cents to a 0-1 probability", () => {
    expect(centsToProb(55)).toBeCloseTo(0.55);
    expect(centsToProb(1)).toBeCloseTo(0.01);
    expect(centsToProb(99)).toBeCloseTo(0.99);
  });
});

describe("computeEdge", () => {
  it("computes positive edge when the model is more confident than the ask implies", () => {
    const { edgeYes, edgeNo } = computeEdge({
      modelYes: 0.6,
      modelNo: 0.4,
      yesAskCts: 55,
      noAskCts: 47,
    });
    expect(edgeYes).toBeCloseTo(0.05);
    expect(edgeNo).toBeCloseTo(-0.07);
  });

  it("computes negative edge when the ask is pricier than the model believes", () => {
    const { edgeYes } = computeEdge({ modelYes: 0.4, modelNo: 0.6, yesAskCts: 55, noAskCts: 47 });
    expect(edgeYes).toBeCloseTo(-0.15);
  });
});

describe("decideEntry", () => {
  it("does not enter when neither edge clears the threshold", () => {
    const decision = decideEntry({ edgeYes: 0.01, edgeNo: -0.02 }, 0.02);
    expect(decision.shouldEnter).toBe(false);
    expect(decision.side).toBeNull();
  });

  it("enters YES when only the YES edge clears the threshold", () => {
    const decision = decideEntry({ edgeYes: 0.05, edgeNo: -0.01 }, 0.02);
    expect(decision.shouldEnter).toBe(true);
    expect(decision.side).toBe("YES");
    expect(decision.edge).toBeCloseTo(0.05);
  });

  it("enters NO when only the NO edge clears the threshold", () => {
    const decision = decideEntry({ edgeYes: -0.01, edgeNo: 0.04 }, 0.02);
    expect(decision.shouldEnter).toBe(true);
    expect(decision.side).toBe("NO");
  });

  it("picks the larger edge when both sides qualify", () => {
    const decision = decideEntry({ edgeYes: 0.03, edgeNo: 0.07 }, 0.02);
    expect(decision.side).toBe("NO");
    expect(decision.edge).toBeCloseTo(0.07);
  });

  it("respects an exact-threshold edge as qualifying (>=)", () => {
    const decision = decideEntry({ edgeYes: 0.02, edgeNo: 0 }, 0.02);
    expect(decision.shouldEnter).toBe(true);
    expect(decision.side).toBe("YES");
  });
});
