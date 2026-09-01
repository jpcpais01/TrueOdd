"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import Panel from "@/components/ui/Panel";
import type { TradeDTO } from "@/types/api";

export default function PnlCurveChart({ trades }: { trades: TradeDTO[] }) {
  const settled = trades
    .filter((t) => t.status === "WON" || t.status === "LOST")
    .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

  let cum = 0;
  const series = settled.map((t, i) => {
    cum += t.pnl ?? 0;
    return { i: i + 1, pnl: cum };
  });

  return (
    <Panel className="px-3 py-3">
      <div className="mb-2 text-[9px] uppercase tracking-widest text-arcade-dim">
        Cumulative P&L
      </div>
      {series.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-xs text-arcade-dim">
          Need at least 2 settled trades
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ffa3" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#00ffa3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" stroke="#8a8dad" fontSize={10} tickLine={false} />
            <YAxis stroke="#8a8dad" fontSize={10} tickLine={false} width={40} />
            <ReferenceLine y={0} stroke="#2a2d45" />
            <Tooltip
              contentStyle={{
                background: "#161829",
                border: "1px solid #2a2d45",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "cum. P&L"]}
              labelFormatter={(label: number) => `trade #${label}`}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="#00ffa3"
              strokeWidth={2}
              fill="url(#pnlFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
