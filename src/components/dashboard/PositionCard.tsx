import Panel from "@/components/ui/Panel";
import { formatCents, formatUsd } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { PositionDTO } from "@/types/api";

export default function PositionCard({ position }: { position: PositionDTO }) {
  const isYes = position.side === "YES";

  return (
    <Panel glow={isYes ? "yes" : "no"} className="px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="font-display text-[8px] tracking-wide text-arcade-violet">POSITION</span>
          <span className={clsx("font-display text-[10px]", isYes ? "text-arcade-yes" : "text-arcade-no")}>
            {position.side}
          </span>
          <span className="tabular font-mono text-[10px] text-arcade-dim">
            {position.contracts}× @ {formatCents(position.entryPriceCts)}
          </span>
        </span>
        {position.pnl !== null ? (
          <span
            className={clsx(
              "tabular font-mono text-sm font-semibold",
              position.pnl >= 0 ? "text-arcade-yes" : "text-arcade-no",
            )}
          >
            {position.pnl >= 0 ? "+" : ""}
            {formatUsd(position.pnl)}
          </span>
        ) : (
          <span className="tabular font-mono text-[10px] text-arcade-dim">
            {formatUsd(position.stake)} staked
          </span>
        )}
      </div>
    </Panel>
  );
}
