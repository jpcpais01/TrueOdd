import Panel from "@/components/ui/Panel";
import { formatCents, formatSignedPct } from "@/lib/format";
import clsx from "@/lib/clsx";

/**
 * Compact by design — the model probability now lives prominently on the
 * LiveChart hero, so this card's job shrinks to just the tradeable facts:
 * ask price and edge.
 */
export default function SideCard({
  side,
  askCts,
  edge,
  minEdge,
  entered,
}: {
  side: "YES" | "NO";
  askCts: number;
  edge: number;
  minEdge: number;
  entered: boolean;
}) {
  const isYes = side === "YES";
  const qualifies = edge >= minEdge;
  const accent = isYes ? "text-arcade-yes" : "text-arcade-no";

  return (
    <Panel
      glow={entered ? (isYes ? "yes" : "no") : "none"}
      className={clsx(
        "flex items-center justify-between gap-2 px-3 py-2.5",
        entered && "ring-1 ring-inset ring-white/10",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={clsx("font-display text-[10px]", accent)}>{side}</span>
        {entered && (
          <span className="rounded-full bg-arcade-violet px-1.5 py-0.5 font-display text-[6px] text-black">
            IN
          </span>
        )}
      </span>
      <span className="tabular font-mono text-sm text-arcade-text">{formatCents(askCts)}</span>
      <span
        className={clsx(
          "tabular font-mono text-[11px]",
          qualifies ? accent : edge < 0 ? "text-arcade-dim" : "text-arcade-text",
        )}
      >
        {formatSignedPct(edge)}
        {qualifies && " ★"}
      </span>
    </Panel>
  );
}
