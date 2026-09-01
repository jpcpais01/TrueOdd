/** Kalshi market object, trimmed to the fields TrueOdd relies on. Extra
 * fields Kalshi returns are ignored, not rejected — the API surface has
 * shifted over time and we'd rather degrade gracefully than hard-crash on
 * an unrecognized field.
 *
 * Confirmed live shape (as of this writing, via /api/debug/kalshi): ask/bid
 * fields are `*_dollars` string fields (e.g. `"0.9990"`, `"0.0020"`), not
 * the plain-integer-cents `yes_ask`/`no_ask` fields older docs describe —
 * and Kalshi's current price grid supports sub-cent increments near 0/1
 * (`price_level_structure: "tapered_deci_cent"`), so these are NOT whole
 * cents. */
export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  series_ticker?: string;
  status: string; // "open" | "closed" | "settled" | ...
  floor_strike?: number | null;
  cap_strike?: number | null;
  strike_type?: string | null;
  open_time: string; // ISO timestamp
  close_time: string; // ISO timestamp
  expiration_time?: string;
  yes_ask_dollars?: string | null;
  no_ask_dollars?: string | null;
  yes_bid_dollars?: string | null;
  no_bid_dollars?: string | null;
  result?: string | null; // "yes" | "no" | ""
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

export interface OrderbookLevel {
  price: number; // cents (fractional — sub-cent pricing is real, see above)
  quantity: number;
}

export interface KalshiOrderbook {
  yes: OrderbookLevel[]; // resting YES bids
  no: OrderbookLevel[]; // resting NO bids
}

/** Confirmed live shape: wrapped under `orderbook_fp`, with `*_dollars`
 * arrays of `[priceDollarsString, quantityString]` pairs. */
export interface KalshiOrderbookResponse {
  orderbook_fp: {
    yes_dollars: [string, string][] | null;
    no_dollars: [string, string][] | null;
  };
}

export interface BestAsks {
  /** best (lowest) price to buy YES right now, in cents (fractional) */
  yesAskCts: number | null;
  /** best (lowest) price to buy NO right now, in cents (fractional) */
  noAskCts: number | null;
}

/** Parses a Kalshi `*_dollars` string field (e.g. `"0.9990"`) into cents
 * (e.g. `99.9`). Returns null for anything that doesn't parse as a
 * positive number, rather than throwing on an unexpected field shape. */
export function dollarsToCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n * 100 : null;
}

/**
 * Kalshi's book only carries resting bids — a bid for one side is
 * economically the mirror-image ask on the other (price + complementary
 * price = 100 cents = $1). Best YES ask = 100 - best NO bid, and vice versa.
 */
export function bestAsksFromOrderbook(book: KalshiOrderbook): BestAsks {
  const bestNoBid = book.no.length > 0 ? Math.max(...book.no.map((l) => l.price)) : null;
  const bestYesBid = book.yes.length > 0 ? Math.max(...book.yes.map((l) => l.price)) : null;
  return {
    yesAskCts: bestNoBid !== null ? 100 - bestNoBid : null,
    noAskCts: bestYesBid !== null ? 100 - bestYesBid : null,
  };
}

export function parseOrderbookResponse(resp: KalshiOrderbookResponse): KalshiOrderbook {
  const toLevels = (raw: [string, string][] | null): OrderbookLevel[] =>
    (raw ?? [])
      .map(([priceStr, qtyStr]) => ({ price: dollarsToCents(priceStr), quantity: Number(qtyStr) }))
      .filter((l): l is OrderbookLevel => l.price !== null && Number.isFinite(l.quantity));
  return {
    yes: toLevels(resp.orderbook_fp?.yes_dollars ?? null),
    no: toLevels(resp.orderbook_fp?.no_dollars ?? null),
  };
}
