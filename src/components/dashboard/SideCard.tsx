import Panel from "@/components/ui/Panel";
import { formatCents, formatPct, formatSignedPct } from "@/lib/format";
import clsx from "@/lib/clsx";

export default function SideCard({
  side,
  askCts,
  modelProb,
  edge,
  minEdge,
  entered,
}: {
  side: "YES" | "NO";
  askCts: number;
  modelProb: number;
  edge: number;
  minEdge: number;
  entered: boolean;
}) {
  const isYes = side === "YES";
  const qualifies = edge >= minEdge;
  const accent = isYes ? "text-arcade-yes" : "text-arcade-no";
  const barColor = isYes ? "bg-arcade-yes" : "bg-arcade-no";

  return (
    <Panel
      glow={entered ? (isYes ? "yes" : "no") : "none"}
      className={clsx("relative px-3 py-3", entered && "ring-1 ring-inset ring-white/10")}
    >
      {entered && (
        <span className="absolute -top-2 right-2 rounded-full bg-arcade-violet px-2 py-0.5 font-display text-[7px] text-black">
          ENTERED
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className={clsx("font-display text-[11px]", accent)}>{side}</span>
        <span className="tabular font-mono text-sm text-arcade-text">
          {formatCents(askCts)}
        </span>
      </div>

      <div className="mt-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] uppercase tracking-widest text-arcade-dim">Model</span>
          <span className="tabular font-mono text-lg text-arcade-text">
            {formatPct(modelProb)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className={clsx("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${Math.min(100, modelProb * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-arcade-dim">Edge</span>
        <span
          className={clsx(
            "tabular font-mono text-xs",
            qualifies ? accent : edge < 0 ? "text-arcade-dim" : "text-arcade-text",
          )}
        >
          {formatSignedPct(edge)}
          {qualifies && " ★"}
        </span>
      </div>
    </Panel>
  );
}
