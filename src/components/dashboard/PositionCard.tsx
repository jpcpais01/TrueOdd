import Panel from "@/components/ui/Panel";
import { formatCents, formatUsd } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { PositionDTO } from "@/types/api";

export default function PositionCard({ position }: { position: PositionDTO }) {
  const isYes = position.side === "YES";

  return (
    <Panel glow={isYes ? "yes" : "no"} className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-[9px] tracking-wide text-arcade-violet">
          PAPER POSITION
        </span>
        <span
          className={clsx(
            "font-display text-[8px]",
            position.status === "OPEN" ? "text-arcade-cyan" : "text-arcade-dim",
          )}
        >
          {position.status}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx("font-display text-sm", isYes ? "text-arcade-yes" : "text-arcade-no")}>
            {position.side}
          </span>
          <span className="tabular font-mono text-xs text-arcade-dim">
            {position.contracts}× @ {formatCents(position.entryPriceCts)}
          </span>
        </div>
        {position.pnl !== null ? (
          <span
            className={clsx(
              "tabular font-mono text-base font-semibold",
              position.pnl >= 0 ? "text-arcade-yes" : "text-arcade-no",
            )}
          >
            {position.pnl >= 0 ? "+" : ""}
            {formatUsd(position.pnl)}
          </span>
        ) : (
          <span className="tabular font-mono text-xs text-arcade-dim">
            {formatUsd(position.stake)} staked
          </span>
        )}
      </div>
    </Panel>
  );
}
