import { kalshiFetch } from "./client";

export interface BrtiTick {
  timestamp: number; // epoch ms
  value: number;
}

/**
 * BRTI is read via Kalshi's CF Benchmarks REST passthrough
 * (`GET /cfbenchmarks/values?id=BRTI`, forwarded straight to CF Benchmarks
 * and returned wrapped as `{ data: { serverTime, payload } }`), not their
 * websocket feed. Vercel serverless functions don't reliably support
 * outbound websocket upgrades — connections there silently never opened —
 * while this reuses the exact signed-REST path that market/orderbook reads
 * already use successfully, so it works the same in a short-lived
 * serverless invocation and in the long-running collector worker alike.
 *
 * The requesting Kalshi account needs the CF Benchmarks passthrough
 * entitlement enabled; without it this 403s (surfaced as-is so that's
 * visible rather than swallowed).
 *
 * CF Benchmarks' exact `payload` field names aren't verifiable from this
 * build environment (docs.cfbenchmarks.com was unreachable here), so
 * parsing is defensive across the field-name variants their docs and the
 * websocket schema use — adjust the candidate lists below if the live
 * response differs.
 */
interface CfBenchmarksResponse {
  data?: {
    serverTime?: string;
    payload?: unknown;
  };
}

export function parseCfBenchmarksValue(resp: CfBenchmarksResponse, indexId = "BRTI"): BrtiTick | null {
  const payload = resp.data?.payload;
  if (payload === undefined || payload === null) return null;

  const candidates: Record<string, unknown>[] = Array.isArray(payload)
    ? (payload as unknown[]).filter(
        (p): p is Record<string, unknown> => typeof p === "object" && p !== null,
      )
    : typeof payload === "object"
      ? [payload as Record<string, unknown>]
      : [];

  const entry =
    candidates.find((c) => c.index_id === indexId || c.indexId === indexId || c.id === indexId) ??
    candidates[0];
  if (!entry) return null;

  const valueCandidates = [
    entry.value,
    entry.price,
    entry.index_value,
    entry.indexValue,
    entry.last,
    (entry.avg_60s_data as Record<string, unknown> | undefined)?.value,
  ];
  const value = valueCandidates.find((v): v is number => typeof v === "number" && v > 0);
  if (value === undefined) return null;

  const tsCandidates: unknown[] = [
    entry.timestamp_ms,
    entry.timestampMs,
    entry.ts,
    entry.time,
    entry.timestamp,
    resp.data?.serverTime,
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
  if (timestamp !== undefined && timestamp < 1e12) timestamp *= 1000; // seconds -> ms
  if (timestamp === undefined) timestamp = Date.now();

  return { timestamp, value };
}

let warnedUnparsed = false;

/** Fetches the current BRTI value. Safe to call from a short-lived
 * serverless request or on a polling interval from a long-running process. */
export async function fetchBrtiOnce(): Promise<BrtiTick> {
  const resp = await kalshiFetch<CfBenchmarksResponse>("/cfbenchmarks/values", { id: "BRTI" });
  const tick = parseCfBenchmarksValue(resp);
  if (!tick) {
    if (!warnedUnparsed) {
      warnedUnparsed = true;
      console.warn(
        "[brti] CF Benchmarks response did not match any known payload shape. Raw response (first 500 chars):",
        JSON.stringify(resp).slice(0, 500),
      );
    }
    throw new Error(
      `CF Benchmarks response for BRTI didn't parse — raw: ${JSON.stringify(resp).slice(0, 300)}`,
    );
  }
  return tick;
}

export interface BrtiPollHandle {
  stop: () => void;
}

/**
 * Polls BRTI on a fixed interval — used by the standalone collector worker
 * to approximate the ~1/s CF Benchmarks update cadence via REST, since
 * there's no persistent push feed being used here anymore.
 */
export function startBrtiPolling(
  onTick: (tick: BrtiTick) => void,
  onError: (err: Error) => void,
  intervalMs = 1000,
): BrtiPollHandle {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    try {
      const tick = await fetchBrtiOnce();
      onTick(tick);
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
