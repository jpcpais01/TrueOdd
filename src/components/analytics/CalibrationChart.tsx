"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Panel from "@/components/ui/Panel";
import type { CalibrationBucketDTO } from "@/types/api";

const REFERENCE = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export default function CalibrationChart({
  calibration,
  sampleSize,
}: {
  calibration: CalibrationBucketDTO[];
  sampleSize: number;
}) {
  const points = calibration
    .filter((b) => b.count > 0)
    .map((b) => ({ x: b.predictedMean, y: b.observedFrequency, count: b.count }));

  return (
    <Panel className="px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-arcade-dim">
          Probability calibration
        </span>
        <span className="tabular font-mono text-[10px] text-arcade-dim">
          n={sampleSize.toLocaleString()}
        </span>
      </div>
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-xs text-arcade-dim">
          Not enough settled markets yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#2a2d45" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              stroke="#8a8dad"
              fontSize={10}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              stroke="#8a8dad"
              fontSize={10}
            />
            <Tooltip
              contentStyle={{
                background: "#161829",
                border: "1px solid #2a2d45",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => [
                `${(value * 100).toFixed(1)}%`,
                name === "y" ? "observed" : name,
              ]}
              labelFormatter={() => ""}
            />
            <Line
              data={REFERENCE}
              dataKey="y"
              stroke="#2a2d45"
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
            <Scatter data={points} fill="#3df2ff" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p className="mt-1 text-[10px] leading-relaxed text-arcade-dim">
        Points on the dashed diagonal mean the model&apos;s stated probability matched the
        observed win frequency — above it means underconfident, below means overconfident.
      </p>
    </Panel>
  );
}
