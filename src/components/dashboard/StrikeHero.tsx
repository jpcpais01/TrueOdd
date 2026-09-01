import Panel from "@/components/ui/Panel";
import { formatCountdown, formatPrice } from "@/lib/format";
import clsx from "@/lib/clsx";

export default function StrikeHero({
  ticker,
  floorStrike,
  brti,
  closeTimeMs,
  nowMs,
  observedSecs,
}: {
  ticker: string;
  floorStrike: number;
  brti: number | null;
  closeTimeMs: number;
  nowMs: number;
  observedSecs: number;
}) {
  const remainingMs = closeTimeMs - nowMs;
  const inSettlement = remainingMs <= 60_000 && remainingMs > -5000;
  const diff = brti !== null ? brti - floorStrike : null;
  const above = diff !== null && diff > 0;

  return (
    <Panel
      glow={inSettlement ? "amber" : above ? "yes" : "no"}
      className="relative overflow-hidden px-4 py-4"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-arcade-dim">{ticker}</span>
        {inSettlement ? (
          <span className="flex items-center gap-1 rounded-full bg-arcade-amber/15 px-2 py-0.5 font-display text-[8px] text-arcade-amber">
            <span className="animate-blink">⚡</span> SETTLING {observedSecs}/60
          </span>
        ) : (
          <span className="rounded-full bg-white/5 px-2 py-0.5 font-display text-[8px] text-arcade-dim">
            LIVE
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-arcade-dim">
            Price to beat
          </div>
          <div className="tabular font-mono text-2xl font-semibold text-arcade-text">
            ${formatPrice(floorStrike)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-arcade-dim">Countdown</div>
          <div
            className={clsx(
              "tabular font-display text-2xl",
              inSettlement ? "text-arcade-amber animate-pulseGlow rounded" : "text-arcade-cyan",
            )}
          >
            {formatCountdown(remainingMs)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-black/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-arcade-dim">BRTI</span>
          <span className="tabular font-mono text-lg text-arcade-text">
            {brti !== null ? `$${formatPrice(brti)}` : "—"}
          </span>
        </div>
        {diff !== null && (
          <span
            className={clsx(
              "tabular font-mono text-sm",
              above ? "text-arcade-yes" : "text-arcade-no",
            )}
          >
            {above ? "▲" : "▼"} {formatPrice(Math.abs(diff))}
          </span>
        )}
      </div>
    </Panel>
  );
}
