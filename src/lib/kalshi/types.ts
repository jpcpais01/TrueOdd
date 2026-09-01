/** Kalshi market object, trimmed to the fields TrueOdd relies on. Extra
 * fields Kalshi returns are ignored, not rejected — the API surface has
 * shifted over time and we'd rather degrade gracefully than hard-crash on
 * an unrecognized field. */
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
  yes_ask?: number | null; // cents
  no_ask?: number | null; // cents
  yes_bid?: number | null;
  no_bid?: number | null;
  result?: string | null; // "yes" | "no" | ""
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

export interface OrderbookLevel {
  price: number; // cents
  quantity: number;
}

export interface KalshiOrderbook {
  yes: OrderbookLevel[]; // resting YES bids
  no: OrderbookLevel[]; // resting NO bids
}

export interface KalshiOrderbookResponse {
  orderbook: {
    yes: [number, number][] | null;
    no: [number, number][] | null;
  };
}

export interface BestAsks {
  /** best (lowest) price to buy YES right now, in cents */
  yesAskCts: number | null;
  /** best (lowest) price to buy NO right now, in cents */
  noAskCts: number | null;
}

/**
 * Kalshi's book only carries resting bids — a bid for one side is
 * economically the mirror-image ask on the other (price + complementary
 * price = 100). Best YES ask = 100 - best NO bid, and vice versa.
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
  const toLevels = (raw: [number, number][] | null): OrderbookLevel[] =>
    (raw ?? []).map(([price, quantity]) => ({ price, quantity }));
  return { yes: toLevels(resp.orderbook.yes), no: toLevels(resp.orderbook.no) };
}
