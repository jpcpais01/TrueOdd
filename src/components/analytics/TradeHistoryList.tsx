import Panel from "@/components/ui/Panel";
import { formatCents, formatUsd, formatPct } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { TradeDTO } from "@/types/api";

export default function TradeHistoryList({ trades }: { trades: TradeDTO[] }) {
  if (trades.length === 0) {
    return (
      <Panel className="px-4 py-8 text-center text-xs text-arcade-dim">
        No paper trades yet — the model only enters when edge clears your configured threshold.
      </Panel>
    );
  }

  return (
    <Panel className="divide-y divide-white/5">
      {trades.map((t) => {
        const isYes = t.side === "YES";
        const settled = t.status === "WON" || t.status === "LOST";
        return (
          <div key={t.id} className="flex items-center justify-between px-3 py-2.5">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span
                  className={clsx(
                    "font-display text-[9px]",
                    isYes ? "text-arcade-yes" : "text-arcade-no",
                  )}
                >
                  {t.side}
                </span>
                <span className="font-mono text-[10px] text-arcade-dim">{t.ticker}</span>
              </div>
              <span className="tabular mt-0.5 font-mono text-[10px] text-arcade-dim">
                {t.contracts}× @ {formatCents(t.entryPriceCts)} · edge {formatPct(t.edge)}
              </span>
            </div>
            <div className="flex flex-col items-end">
              {settled ? (
                <span
                  className={clsx(
                    "tabular font-mono text-sm font-semibold",
                    (t.pnl ?? 0) >= 0 ? "text-arcade-yes" : "text-arcade-no",
                  )}
                >
                  {(t.pnl ?? 0) >= 0 ? "+" : ""}
                  {formatUsd(t.pnl ?? 0)}
                </span>
              ) : (
                <span className="font-display text-[8px] text-arcade-cyan">OPEN</span>
              )}
              <span className="font-mono text-[9px] text-arcade-dim">{t.status}</span>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
