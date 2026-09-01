"use client";

import useSWR from "swr";
import type { AppStateDTO, AnalyticsDTO } from "@/types/api";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
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
 * fires the engine tick before each read, which is what drives the 5-second
 * model cadence while the dashboard is open. Other screens just read.
 */
export function useAppState(opts: { heartbeat?: boolean } = {}) {
  const key = opts.heartbeat ? "/api/state?heartbeat=1" : "/api/state";

  const { data, error, isLoading } = useSWR<HeartbeatResult>(
    key,
    async () => {
      let tickError: string | null = null;
      if (opts.heartbeat) {
        try {
          const res = await fetch("/api/tick", { method: "POST" });
          const body = await res.json().catch(() => null);
          if (!res.ok) tickError = body?.error ?? `tick failed (${res.status})`;
          else if (body?.brtiError) tickError = body.brtiError;
        } catch (e) {
          tickError = e instanceof Error ? e.message : "tick request failed";
        }
      }
      const state = await fetchJson<AppStateDTO>("/api/state");
      return { state, tickError };
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
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
