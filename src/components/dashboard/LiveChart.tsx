"use client";

import { ResponsiveContainer, ComposedChart, Area, ReferenceLine, YAxis, XAxis, Tooltip } from "recharts";
import Panel from "@/components/ui/Panel";
import { formatCountdown, formatPrice } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { PricePoint } from "@/hooks/usePriceHistory";

const YES_COLOR = "#00ffa3";
const NO_COLOR = "#ff3d6e";
const STRIKE_COLOR = "#a78bfa";

export default function LiveChart({
  ticker,
  points,
  strike,
  brti,
  closeTimeMs,
  nowMs,
  observedSecs,
  modelYes,
  modelNo,
}: {
  ticker: string;
  points: PricePoint[];
  strike: number;
  brti: number | null;
  closeTimeMs: number;
  nowMs: number;
  observedSecs: number;
  modelYes: number | null;
  modelNo: number | null;
}) {
  const remainingMs = closeTimeMs - nowMs;
  const inSettlement = remainingMs <= 60_000 && remainingMs > -5000;
  const above = brti !== null && brti > strike;
  const accent = above ? YES_COLOR : NO_COLOR;

  const values = points.map((p) => p.brti);
  const lo = Math.min(strike, ...(values.length ? values : [strike]));
  const hi = Math.max(strike, ...(values.length ? values : [strike]));
  const pad = Math.max((hi - lo) * 0.2, Math.max(strike * 0.0002, 3));
  const domain: [number, number] = [lo - pad, hi + pad];

  const diff = brti !== null ? brti - strike : null;

  return (
    <Panel
      glow={inSettlement ? "amber" : above ? "yes" : "no"}
      className="overflow-hidden !rounded-3xl"
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="font-mono text-[10px] tracking-wide text-arcade-dim">{ticker}</span>
        {inSettlement ? (
          <span className="flex items-center gap-1 rounded-full bg-arcade-amber/15 px-2 py-0.5 font-display text-[8px] text-arcade-amber">
            <span className="animate-blink">⚡</span> SETTLING {observedSecs}/60
          </span>
        ) : (
          <span className="tabular font-display text-[11px] text-arcade-cyan">
            {formatCountdown(remainingMs)}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2.5 px-4">
        <span className="tabular font-mono text-4xl font-bold leading-none text-arcade-text">
          {brti !== null ? `$${formatPrice(brti)}` : "—"}
        </span>
        {diff !== null && (
          <span
            className={clsx(
              "tabular font-mono text-sm font-medium",
              above ? "text-arcade-yes" : "text-arcade-no",
            )}
          >
            {above ? "▲" : "▼"} ${formatPrice(Math.abs(diff))}
          </span>
        )}
      </div>

      <div className="relative mt-3 h-48 w-full sm:h-64">
        {points.length < 2 ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-arcade-dim">
            <span className="animate-blink">●</span> gathering live price data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="livePriceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={domain} hide />
              <ReferenceLine
                y={strike}
                stroke={STRIKE_COLOR}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `PTB $${formatPrice(strike)}`,
                  position: "insideBottomLeft",
                  fill: STRIKE_COLOR,
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              />
              <Tooltip
                contentStyle={{
                  background: "#161829",
                  border: "1px solid #2a2d45",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelFormatter={() => ""}
                formatter={(value: number) => [`$${formatPrice(value)}`, "BRTI"]}
              />
              <Area
                type="monotone"
                dataKey="brti"
                stroke={accent}
                strokeWidth={2.5}
                fill="url(#livePriceFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, fill: accent, stroke: "#0a0b14", strokeWidth: 1.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5">
        <div className="px-2 py-2.5 text-center">
          <div className="text-[8px] uppercase tracking-widest text-arcade-dim">Price to beat</div>
          <div className="tabular mt-0.5 font-mono text-sm text-arcade-text">
            ${formatPrice(strike)}
          </div>
        </div>
        <div className="px-2 py-2.5 text-center">
          <div className="text-[8px] uppercase tracking-widest text-arcade-dim">Model YES</div>
          <div className="tabular mt-0.5 font-mono text-sm text-arcade-yes">
            {modelYes !== null ? `${Math.round(modelYes * 100)}%` : "—"}
          </div>
        </div>
        <div className="px-2 py-2.5 text-center">
          <div className="text-[8px] uppercase tracking-widest text-arcade-dim">Model NO</div>
          <div className="tabular mt-0.5 font-mono text-sm text-arcade-no">
            {modelNo !== null ? `${Math.round(modelNo * 100)}%` : "—"}
          </div>
        </div>
      </div>
    </Panel>
  );
}
