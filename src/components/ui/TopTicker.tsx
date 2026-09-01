"use client";

import { useAppState } from "@/hooks/useAppState";
import { formatPrice, timeAgo } from "@/lib/format";
import clsx from "@/lib/clsx";

export default function TopTicker() {
  const { state, error } = useAppState();

  const live = !!state?.brti && !error;
  const stale =
    !!state?.brti && Date.now() - new Date(state.brti.timestamp).getTime() > 15_000;

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
              <span className="ml-1.5 text-[10px] text-arcade-dim">
                {stale ? `stale · ${timeAgo(state.brti.timestamp)}` : "BRTI"}
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
