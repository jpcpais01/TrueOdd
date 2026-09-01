import { kalshiFetch } from "./client";

export interface BrtiTick {
  timestamp: number; // epoch ms
  value: number;
}

/**
 * BRTI is read via Kalshi's CF Benchmarks REST passthrough
 * (`GET /cfbenchmarks/values?id=BRTI`, forwarded straight to CF Benchmarks
 * and returned wrapped as `{ data: { serverTime, payload } }`), not their
 * websocket feed — see git history / README for why (Vercel serverless
 * functions don't reliably support outbound websocket upgrades).
 *
 * The requesting Kalshi account needs the CF Benchmarks passthrough
 * entitlement enabled; without it this 403s (surfaced as-is so that's
 * visible rather than swallowed).
 *
 * Confirmed live shape (as of this writing): `payload` is an array of the
 * trailing ~60 one-second observations, e.g.
 * `{ value: "78274.43", time: 1788228411000 }` — note `value` is a numeric
 * *string*, not a number, and `time` is already epoch milliseconds. Each
 * poll effectively backfills a full trailing minute of 1-second-resolution
 * history for free, which is used to advantage below rather than just
 * keeping the single latest point.
 */
interface CfBenchmarksResponse {
  data?: {
    serverTime?: string;
    payload?: unknown;
  };
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseEntry(entry: Record<string, unknown>): BrtiTick | null {
  const valueCandidates = [
    entry.value,
    entry.price,
    entry.index_value,
    entry.indexValue,
    entry.last,
    (entry.avg_60s_data as Record<string, unknown> | undefined)?.value,
  ];
  let value: number | undefined;
  for (const c of valueCandidates) {
    const n = coerceNumber(c);
    if (n !== undefined && n > 0) {
      value = n;
      break;
    }
  }
  if (value === undefined) return null;

  const tsCandidates: unknown[] = [
    entry.time,
    entry.timestamp_ms,
    entry.timestampMs,
    entry.ts,
    entry.timestamp,
  ];
  let timestamp: number | undefined;
  for (const c of tsCandidates) {
    if (typeof c === "number") {
      timestamp = c;
      break;
    }
    if (typeof c === "string") {
      const parsed = Date.parse(c);
      if (!Number.isNaN(parsed)) {
        timestamp = parsed;
        break;
      }
    }
  }
  if (timestamp === undefined) return null;
  if (timestamp < 1e12) timestamp *= 1000; // seconds -> ms

  return { timestamp, value };
}

/** Parses every observation out of a CF Benchmarks response, sorted
 * chronologically. Handles both the confirmed array-of-observations shape
 * and a defensive single-object fallback in case a differently-scoped
 * query ever returns one entry directly under `payload`. */
export function parseCfBenchmarksValues(resp: CfBenchmarksResponse, indexId = "BRTI"): BrtiTick[] {
  const payload = resp.data?.payload;
  if (payload === undefined || payload === null) return [];

  const rawEntries: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload as unknown[]).filter(
        (p): p is Record<string, unknown> => typeof p === "object" && p !== null,
      )
    : typeof payload === "object"
      ? [payload as Record<string, unknown>]
      : [];

  const relevant = rawEntries.filter(
    (e) => e.index_id === undefined && e.indexId === undefined && e.id === undefined
      ? true
      : e.index_id === indexId || e.indexId === indexId || e.id === indexId,
  );

  const ticks: BrtiTick[] = [];
  for (const entry of relevant) {
    const tick = parseEntry(entry);
    if (tick) ticks.push(tick);
  }
  return ticks.sort((a, b) => a.timestamp - b.timestamp);
}

let warnedUnparsed = false;

function warnUnparsed(resp: unknown) {
  if (warnedUnparsed) return;
  warnedUnparsed = true;
  console.warn(
    "[brti] CF Benchmarks response did not match any known payload shape. Raw response (first 500 chars):",
    JSON.stringify(resp).slice(0, 500),
  );
}

/**
 * Fetches the trailing window of BRTI observations CF Benchmarks returns
 * per request (confirmed ~60 one-second points), sorted oldest-to-newest.
 * Throws with the raw response inlined if nothing parses, so a schema
 * mismatch is visible wherever this error surfaces (the dashboard's tick
 * error banner, or collector logs) without needing server log access.
 */
export async function fetchBrtiWindow(): Promise<BrtiTick[]> {
  const resp = await kalshiFetch<CfBenchmarksResponse>("/cfbenchmarks/values", { id: "BRTI" });
  const ticks = parseCfBenchmarksValues(resp);
  if (ticks.length === 0) {
    warnUnparsed(resp);
    throw new Error(
      `CF Benchmarks response for BRTI didn't parse — raw: ${JSON.stringify(resp).slice(0, 300)}`,
    );
  }
  return ticks;
}

/** Fetches the BRTI window and returns just the most recent observation.
 * Safe to call from a short-lived serverless request. */
export async function fetchBrtiOnce(): Promise<BrtiTick> {
  const ticks = await fetchBrtiWindow();
  return ticks[ticks.length - 1]!;
}

export interface BrtiPollHandle {
  stop: () => void;
}

/**
 * Polls the BRTI window on a fixed interval — used by the standalone
 * collector worker. Each poll's full window (not just the latest point) is
 * handed to `onWindow` so the caller can bulk-ingest it, since CF
 * Benchmarks' trailing-~60s response means even an occasional poll keeps
 * 1-second resolution gap-free.
 */
export function startBrtiPolling(
  onWindow: (ticks: BrtiTick[]) => void,
  onError: (err: Error) => void,
  intervalMs = 1000,
): BrtiPollHandle {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const ticks = await fetchBrtiWindow();
      onWindow(ticks);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!stopped) setTimeout(poll, intervalMs);
    }
  };

  poll();

  return {
    stop: () => {
      stopped = true;
    },
  };
}
