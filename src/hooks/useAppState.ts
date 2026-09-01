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

/**
 * Live dashboard state. `heartbeat: true` (the main dashboard screen) also
 * fires the engine tick before each read, which is what drives the 5-second
 * model cadence while the dashboard is open. Other screens just read.
 */
export function useAppState(opts: { heartbeat?: boolean } = {}) {
  const key = opts.heartbeat ? "/api/state?heartbeat=1" : "/api/state";

  const { data, error, isLoading } = useSWR<AppStateDTO>(
    key,
    async () => {
      if (opts.heartbeat) {
        await fetch("/api/tick", { method: "POST" }).catch(() => {});
      }
      return fetchJson<AppStateDTO>("/api/state");
    },
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    },
  );

  return { state: data, error, isLoading };
}

export function useAnalytics(opts: { refreshInterval?: number } = {}) {
  const { data, error, isLoading, mutate } = useSWR<AnalyticsDTO>(
    "/api/analytics",
    fetchJson<AnalyticsDTO>,
    { refreshInterval: opts.refreshInterval ?? 15000 },
  );
  return { analytics: data, error, isLoading, refresh: mutate };
}
