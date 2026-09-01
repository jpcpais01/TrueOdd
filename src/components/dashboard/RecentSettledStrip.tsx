import { formatPrice } from "@/lib/format";
import clsx from "@/lib/clsx";
import type { SettledMarketDTO } from "@/types/api";

export default function RecentSettledStrip({ markets }: { markets: SettledMarketDTO[] }) {
  if (markets.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="mb-1.5 px-1 text-[9px] uppercase tracking-widest text-arcade-dim">
        Recent settlements
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {markets.map((m) => (
          <div
            key={m.ticker}
            className={clsx(
              "flex min-w-[72px] flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5",
              m.settlementSide === "YES"
                ? "border-arcade-yes/25 bg-arcade-yes/5"
                : "border-arcade-no/25 bg-arcade-no/5",
            )}
          >
            <span
              className={clsx(
                "font-display text-[9px]",
                m.settlementSide === "YES" ? "text-arcade-yes" : "text-arcade-no",
              )}
            >
              {m.settlementSide ?? "?"}
            </span>
            <span className="tabular font-mono text-[10px] text-arcade-dim">
              {m.settlementAvg !== null ? `$${formatPrice(m.settlementAvg)}` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
