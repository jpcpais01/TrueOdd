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
    <Panel glow="amber" className="mb-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="animate-blink text-arcade-amber">●</span>
        <span className="font-display text-[9px] tracking-wide text-arcade-amber">
          WARM-UP MODE
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-arcade-dim">
        Collecting BRTI history — {marketsUsed}/{marketsRequired} completed markets in the
        volatility lookback window ({sampleSize.toLocaleString()} clean 5s returns so far). The
        model will not paper-trade until enough history exists to trust the vol estimate.
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-arcade-amber transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </Panel>
  );
}
