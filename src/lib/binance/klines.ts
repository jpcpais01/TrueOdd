/**
 * Binance's public klines REST API (no auth, generous rate limits) is used
 * purely to seed the realized-volatility lookback window instantly instead
 * of waiting for hours of live Kalshi BRTI observations to accumulate.
 * BTCUSDT spot is one of the most liquid BTC markets and a reasonable
 * volatility proxy for that purpose — but it is NOT used for anything
 * settlement-relevant: the live current price, the settlement-window
 * observations, and the actual paper-trade decisions all still come
 * exclusively from Kalshi's real BRTI feed. Backfilled rows are tagged
 * with TickSource "BACKFILL" (never "WS") so they're always distinguishable
 * from genuine Kalshi observations in the data.
 */

export const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
export const BINANCE_SYMBOL = process.env.BINANCE_SYMBOL ?? "BTCUSDT";

const MAX_ROWS_PER_CALL = 1000; // Binance's per-request cap
const CHUNK_MS = MAX_ROWS_PER_CALL * 1000; // 1s klines -> 1000s covered per call

export interface BackfillTick {
  timestamp: number; // epoch ms
  value: number;
}

interface BinanceKlineRow extends Array<unknown> {
  0: number; // open time (ms)
  4: string; // close price
}

async function fetchChunk(startMs: number, endMs: number): Promise<BackfillTick[]> {
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", BINANCE_SYMBOL);
  url.searchParams.set("interval", "1s");
  url.searchParams.set("startTime", String(startMs));
  url.searchParams.set("endTime", String(endMs));
  url.searchParams.set("limit", String(MAX_ROWS_PER_CALL));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance klines ${res.status}: ${body.slice(0, 200)}`);
    }
    const rows = (await res.json()) as BinanceKlineRow[];
    return rows
      .map((row) => ({ timestamp: Number(row[0]), value: Number(row[4]) }))
      .filter((t) => Number.isFinite(t.timestamp) && Number.isFinite(t.value) && t.value > 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the trailing `minutes` of BTCUSDT 1-second close prices, sorted
 * chronologically. Issues one request per ~16.7-minute chunk in parallel
 * (Binance's 1000-row-per-call cap on 1s klines), so even a 150-minute
 * backfill completes in roughly one round trip's worth of latency.
 */
export async function fetchBinanceHistory(minutes: number): Promise<BackfillTick[]> {
  const endMs = Date.now();
  const startMs = endMs - minutes * 60_000;

  const chunkBounds: { start: number; end: number }[] = [];
  for (let s = startMs; s < endMs; s += CHUNK_MS) {
    chunkBounds.push({ start: s, end: Math.min(s + CHUNK_MS, endMs) });
  }

  const results = await Promise.all(
    chunkBounds.map(({ start, end }) =>
      fetchChunk(start, end).catch((err) => {
        console.error("[binance] chunk fetch failed, skipping:", err);
        return [] as BackfillTick[];
      }),
    ),
  );

  return results.flat().sort((a, b) => a.timestamp - b.timestamp);
}
