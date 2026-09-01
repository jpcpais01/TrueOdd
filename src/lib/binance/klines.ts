/**
 * Binance's public klines REST API (no auth) is used purely to seed the
 * realized-volatility lookback window instantly instead of waiting hours
 * for live Kalshi BRTI observations to accumulate. BTCUSDT spot is a
 * reasonable volatility proxy for that purpose — but it is NOT used for
 * anything settlement-relevant: the live current price, the settlement-
 * window observations, and the actual paper-trade decisions all still come
 * exclusively from Kalshi's real BRTI feed. Backfilled rows are tagged with
 * TickSource "BACKFILL" (never "WS") so they're always distinguishable from
 * genuine Kalshi observations.
 *
 * Uses api.binance.us, not api.binance.com: Binance.com geofences requests
 * from US-located IPs (HTTP 451, "restricted location"), and Vercel builds
 * default to a US region — so calls from a Vercel-deployed function would
 * likely be silently rejected against binance.com. Binance.US serves the
 * same kline shape for BTCUSDT.
 *
 * Uses 1-minute bars, not 1-second: this needs one API call (150 minutes
 * of 1m bars is 150 rows, well under the 1000-row cap) instead of several
 * chunked/parallel 1s-interval calls, which removes both the pagination
 * complexity and any uncertainty about whether Binance.US has rolled out
 * the newer 1s interval the same way binance.com has. The volatility
 * estimator's gap tolerance (see MAX_GAP_MS in quant/volatility.ts) is
 * sized to admit legitimate 60-second-spaced backfill points.
 */

export const BINANCE_API_BASE = process.env.BINANCE_API_BASE ?? "https://api.binance.us/api/v3";
export const BINANCE_SYMBOL = process.env.BINANCE_SYMBOL ?? "BTCUSDT";

const MAX_ROWS_PER_CALL = 1000; // Binance's per-request cap

export interface BackfillTick {
  timestamp: number; // epoch ms
  value: number;
}

interface BinanceKlineRow extends Array<unknown> {
  0: number; // open time (ms)
  4: string; // close price
}

const BACKFILL_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches the trailing `minutes` of BTCUSDT 1-minute close prices, sorted
 * chronologically, in a single request. Retries a couple of times on a
 * transient failure (a dropped connection, a momentary 5xx) with a short
 * fixed delay before giving up — this is the only thing standing between
 * "warm-up clears in one request" and "warm-up clears whenever the next
 * tick happens to retry it," so it's worth not giving up on the first
 * hiccup. Returns an empty array (never throws) only once every attempt
 * has failed — the caller treats that as "try again next tick" rather
 * than a hard error.
 */
export async function fetchBinanceHistory(minutes: number): Promise<BackfillTick[]> {
  const endMs = Date.now();
  const startMs = endMs - minutes * 60_000;

  const url = new URL(`${BINANCE_API_BASE}/klines`);
  url.searchParams.set("symbol", BINANCE_SYMBOL);
  url.searchParams.set("interval", "1m");
  url.searchParams.set("startTime", String(startMs));
  url.searchParams.set("endTime", String(endMs));
  url.searchParams.set("limit", String(Math.min(MAX_ROWS_PER_CALL, minutes + 5)));

  for (let attempt = 1; attempt <= BACKFILL_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `[binance] klines request failed (attempt ${attempt}/${BACKFILL_ATTEMPTS}): HTTP ${res.status} ${body.slice(0, 300)}`,
        );
      } else {
        const rows = (await res.json()) as BinanceKlineRow[];
        return rows
          .map((row) => ({ timestamp: Number(row[0]), value: Number(row[4]) }))
          .filter((t) => Number.isFinite(t.timestamp) && Number.isFinite(t.value) && t.value > 0)
          .sort((a, b) => a.timestamp - b.timestamp);
      }
    } catch (err) {
      console.error(`[binance] klines request failed (attempt ${attempt}/${BACKFILL_ATTEMPTS}):`, err);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < BACKFILL_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  return [];
}
