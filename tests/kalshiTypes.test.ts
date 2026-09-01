import { describe, it, expect } from "vitest";
import {
  dollarsToCents,
  parseOrderbookResponse,
  bestAsksFromOrderbook,
} from "@/lib/kalshi/types";

describe("dollarsToCents", () => {
  it("converts confirmed live dollar-string values to cents", () => {
    expect(dollarsToCents("0.9990")).toBeCloseTo(99.9);
    expect(dollarsToCents("0.0020")).toBeCloseTo(0.2);
    expect(dollarsToCents("0.5000")).toBeCloseTo(50);
  });

  it("returns null for missing or invalid values rather than throwing", () => {
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
    expect(dollarsToCents("not-a-number")).toBeNull();
    expect(dollarsToCents("-1")).toBeNull();
  });
});

describe("parseOrderbookResponse / bestAsksFromOrderbook", () => {
  it("parses the confirmed live orderbook_fp shape (dollar-string price/quantity pairs)", () => {
    // Trimmed real sample captured via /api/debug/kalshi.
    const resp = {
      orderbook_fp: {
        no_dollars: [] as [string, string][],
        yes_dollars: [
          ["0.0010", "573819.00"],
          ["0.0020", "6811.00"],
          ["0.9970", "25192.00"],
          ["0.9980", "6832.15"],
          ["0.9990", "10.92"],
        ] as [string, string][],
      },
    };

    const book = parseOrderbookResponse(resp);
    expect(book.no).toHaveLength(0);
    expect(book.yes).toHaveLength(5);
    expect(book.yes[0]).toEqual({ price: 0.1, quantity: 573819 });
    expect(book.yes[book.yes.length - 1]).toEqual({ price: 99.9, quantity: 10.92 });

    // No resting NO bids in this sample -> no YES-ask can be mirror-derived,
    // but the best resting YES bid (99.9) still mirrors to a NO ask of 0.1.
    const asks = bestAsksFromOrderbook(book);
    expect(asks.yesAskCts).toBeNull();
    expect(asks.noAskCts).toBeCloseTo(0.1);
  });

  it("derives both sides when both books have resting bids", () => {
    const resp = {
      orderbook_fp: {
        yes_dollars: [["0.40", "100"]] as [string, string][],
        no_dollars: [["0.55", "50"]] as [string, string][],
      },
    };
    const book = parseOrderbookResponse(resp);
    const asks = bestAsksFromOrderbook(book);
    expect(asks.yesAskCts).toBeCloseTo(45); // 100 - best NO bid (55)
    expect(asks.noAskCts).toBeCloseTo(60); // 100 - best YES bid (40)
  });
});
