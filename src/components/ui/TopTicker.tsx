"use client";

import { useAppState } from "@/hooks/useAppState";
import { useNow } from "@/hooks/useNow";
import { formatPrice } from "@/lib/format";
import clsx from "@/lib/clsx";

export default function TopTicker() {
  // Always mounted (root layout), so this is what keeps data flowing when
  // the user is on /analytics or /settings and the dashboard page (which
  // also runs the heartbeat) isn't mounted. Shares its SWR cache key with
  // the dashboard's own heartbeat when both are mounted, so it's one
  // deduped poll cycle, not two.
  const { state, error } = useAppState({ heartbeat: true });
  const now = useNow(1000);

  const brtiAgeSec = state?.brti
    ? Math.max(0, Math.round((now - new Date(state.brti.timestamp).getTime()) / 1000))
    : null;

  const live = !!state?.brti && !error;
  const stale = brtiAgeSec !== null && brtiAgeSec > 15;

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-arcade-bg/90 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] text-arcade-yes drop-shadow-[0_0_6px_rgba(0,255,163,0.6)]">
            TRUE<span className="text-arcade-cyan">ODD</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              live && !stale ? "bg-arcade-yes animate-pulse" : "bg-arcade-no",
            )}
          />
          {state?.brti ? (
            <span className="tabular font-mono text-sm text-arcade-text">
              ${formatPrice(state.brti.value)}
              <span
                className={clsx("ml-1.5 text-[10px]", stale ? "text-arcade-no" : "text-arcade-dim")}
              >
                {brtiAgeSec}s ago
              </span>
            </span>
          ) : (
            <span className="font-mono text-xs text-arcade-dim">connecting…</span>
          )}
        </div>
      </div>
    </header>
  );
}
