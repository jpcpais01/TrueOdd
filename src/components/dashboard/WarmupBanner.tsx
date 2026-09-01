import Panel from "@/components/ui/Panel";

export default function WarmupBanner({
  marketsUsed,
  marketsRequired,
  sampleSize,
}: {
  marketsUsed: number;
  marketsRequired: number;
  sampleSize: number;
}) {
  const pct = Math.min(100, Math.round((marketsUsed / Math.max(1, marketsRequired)) * 100));

  return (
    <Panel glow="amber" className="mb-2.5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="animate-blink text-arcade-amber">●</span>
          <span className="font-display text-[8px] tracking-wide text-arcade-amber">WARM-UP</span>
        </span>
        <span className="tabular font-mono text-[10px] text-arcade-dim">
          {marketsUsed.toFixed(1)}/{marketsRequired} · {sampleSize.toLocaleString()} returns
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-arcade-amber transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Panel>
  );
}
