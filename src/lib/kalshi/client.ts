import { loadKalshiCredentials, signKalshiRequest } from "./auth";
import {
  bestAsksFromOrderbook,
  parseOrderbookResponse,
  type BestAsks,
  type KalshiMarket,
  type KalshiMarketsResponse,
  type KalshiOrderbookResponse,
} from "./types";

export const KALSHI_API_BASE =
  process.env.KALSHI_API_BASE ?? "https://api.elections.kalshi.com/trade-api/v2";

export const BTC_15M_SERIES_TICKER = process.env.KALSHI_BTC_SERIES_TICKER ?? "KXBTC15M";

const API_PATH_PREFIX = "/trade-api/v2";
const DEFAULT_TIMEOUT_MS = 8000;

class KalshiApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "KalshiApiError";
  }
}

async function kalshiFetch<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(KALSHI_API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };

  // Market data is public, but signing anyway (when credentials are
  // configured) buys a higher rate-limit tier.
  const creds = loadKalshiCredentials();
  if (creds) {
    const routePath = API_PATH_PREFIX + path;
    Object.assign(
      headers,
      signKalshiRequest({
        method: "GET",
        path: routePath,
        apiKeyId: creds.apiKeyId,
        privateKeyPem: creds.privateKeyPem,
      }),
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new KalshiApiError(`Kalshi API ${res.status} on ${path}: ${body.slice(0, 300)}`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** All markets in the BTC 15-minute series currently open for trading. */
export async function getOpenBtc15mMarkets(
  seriesTicker = BTC_15M_SERIES_TICKER,
): Promise<KalshiMarket[]> {
  const resp = await kalshiFetch<KalshiMarketsResponse>("/markets", {
    series_ticker: seriesTicker,
    status: "open",
    limit: 50,
  });
  return resp.markets;
}

/** Recently closed/settled markets in the series, newest first — used to
 * discover settlement results and to backfill volatility lookback. */
export async function getRecentBtc15mMarkets(
  seriesTicker = BTC_15M_SERIES_TICKER,
  limit = 30,
): Promise<KalshiMarket[]> {
  const resp = await kalshiFetch<KalshiMarketsResponse>("/markets", {
    series_ticker: seriesTicker,
    status: "settled",
    limit,
  });
  return resp.markets;
}

export async function getMarket(ticker: string): Promise<KalshiMarket> {
  const resp = await kalshiFetch<{ market: KalshiMarket }>(`/markets/${ticker}`);
  return resp.market;
}

export async function getBestAsks(ticker: string): Promise<BestAsks> {
  const resp = await kalshiFetch<KalshiOrderbookResponse>(`/markets/${ticker}/orderbook`);
  return bestAsksFromOrderbook(parseOrderbookResponse(resp));
}

export { KalshiApiError };
