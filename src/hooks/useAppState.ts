"use client";

import useSWR from "swr";
import type { AppStateDTO, AnalyticsDTO } from "@/types/api";

const CLIENT_FETCH_TIMEOUT_MS = 3_000;

/**
 * A hung request (dropped connection, a stalled proxy) would otherwise
 * block forever and stall SWR's refresh loop entirely — it only schedules
 * the next poll after the current fetcher call settles. Bounding every
 * request means a bad one fails fast and the next cycle still fires.
 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${url} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface HeartbeatResult {
  state: AppStateDTO;
  /** Non-fatal: the engine tick's own error (e.g. the CF Benchmarks
   * passthrough rejecting auth), surfaced separately from state-fetch
   * failures so the dashboard can show a specific reason instead of a
   * generic "can't reach the engine" message. Market sync still runs even
   * when this is set. */
  tickError: string | null;
}

/**
 * Live dashboard state. `heartbeat: true` (the main dashboard screen) also
 * fires the engine tick before each read, which is what drives the model
 * cadence while the dashboard is open — POST /api/tick returns the
 * resulting state directly in the same response (see that route), so this
 * is a single round trip per cycle rather than a tick call followed by a
 * separate state read. Other screens just read.
 */
export function useAppState(opts: { heartbeat?: boolean } = {}) {
  const key = opts.heartbeat ? "/api/state?heartbeat=1" : "/api/state";

  const { data, error, isLoading } = useSWR<HeartbeatResult>(
    key,
    async () => {
      if (!opts.heartbeat) {
        return { state: await fetchJson<AppStateDTO>("/api/state"), tickError: null };
      }

      try {
        const res = await fetchWithTimeout("/api/tick", { method: "POST" });
        const body = await res.json().catch(() => null);

        if (body?.state) {
          const tickError = !res.ok ? (body.error ?? `tick failed (${res.status})`) : (body.brtiError ?? null);
          return { state: body.state as AppStateDTO, tickError };
        }

        // Tick failed before it could build a state view (e.g. DB
        // unreachable) — fall back to a plain read so the dashboard still
        // shows whatever's there, with the tick failure surfaced.
        const state = await fetchJson<AppStateDTO>("/api/state");
        return { state, tickError: body?.error ?? `tick failed (${res.status})` };
      } catch (e) {
        const tickError = e instanceof Error ? e.message : "tick request failed";
        const state = await fetchJson<AppStateDTO>("/api/state");
        return { state, tickError };
      }
    },
    {
      refreshInterval: opts.heartbeat ? 500 : 5000,
      revalidateOnFocus: true,
      dedupingInterval: 400,
    },
  );

  return { state: data?.state, tickError: data?.tickError ?? null, error, isLoading };
}

export function useAnalytics(opts: { refreshInterval?: number } = {}) {
  const { data, error, isLoading, mutate } = useSWR<AnalyticsDTO>(
    "/api/analytics",
    fetchJson<AnalyticsDTO>,
    { refreshInterval: opts.refreshInterval ?? 15000 },
  );
  return { analytics: data, error, isLoading, refresh: mutate };
}
