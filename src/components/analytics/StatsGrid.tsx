import Panel from "@/components/ui/Panel";
import { formatPct, formatUsd } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { PortfolioStatsDTO } from "@/types/api";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "yes" | "no" | "neutral";
}) {
  return (
    <Panel className="px-3 py-3">
      <div className="text-[9px] uppercase tracking-widest text-arcade-dim">{label}</div>
      <div
        className={clsx(
          "tabular mt-1 font-mono text-lg font-semibold",
          accent === "yes" && "text-arcade-yes",
          accent === "no" && "text-arcade-no",
          (!accent || accent === "neutral") && "text-arcade-text",
        )}
      >
        {value}
      </div>
    </Panel>
  );
}

export default function StatsGrid({
  stats,
  brier,
}: {
  stats: PortfolioStatsDTO;
  brier: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat
        label="Total P&L"
        value={formatUsd(stats.totalPnl)}
        accent={stats.totalPnl >= 0 ? "yes" : "no"}
      />
      <Stat
        label="ROI"
        value={formatPct(stats.roi)}
        accent={stats.roi >= 0 ? "yes" : "no"}
      />
      <Stat label="Win rate" value={`${formatPct(stats.winRate)} (${stats.wins}/${stats.totalTrades})`} />
      <Stat label="Max drawdown" value={formatUsd(-Math.abs(stats.maxDrawdown))} accent="no" />
      <Stat label="Total staked" value={formatUsd(stats.totalStaked)} />
      <Stat label="Brier score" value={brier !== null ? brier.toFixed(4) : "—"} />
    </div>
  );
}
