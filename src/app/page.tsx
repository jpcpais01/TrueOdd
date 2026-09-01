"use client";

import { useAppState } from "@/hooks/useAppState";
import { useNow } from "@/hooks/useNow";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import WarmupBanner from "@/components/dashboard/WarmupBanner";
import LiveChart from "@/components/dashboard/LiveChart";
import SideCard from "@/components/dashboard/SideCard";
import PositionCard from "@/components/dashboard/PositionCard";
import RecentSettledStrip from "@/components/dashboard/RecentSettledStrip";
import EmptyState from "@/components/dashboard/EmptyState";
import Panel from "@/components/ui/Panel";

export default function DashboardPage() {
  const { state, error, tickError } = useAppState({ heartbeat: true });
  const now = useNow(1000);

  const primary = state?.markets[0] ?? null;
  const latestPoint =
    primary?.snapshot && state?.brti
      ? { timestamp: new Date(primary.snapshot.timestamp).getTime(), brti: state.brti.value }
      : null;
  const points = usePriceHistory(primary?.ticker ?? null, latestPoint);

  if (error && !state) {
    return (
      <EmptyState
        message={error instanceof Error ? error.message : "Can't reach the engine yet. Retrying…"}
      />
    );
  }

  if (!state) {
    return (
      <div className="animate-pulse space-y-2.5">
        <Panel className="h-72" />
        <div className="grid grid-cols-2 gap-2">
          <Panel className="h-12" />
          <Panel className="h-12" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {tickError && (
        <Panel glow="no" className="mb-2.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-arcade-no">✕</span>
            <span className="font-display text-[8px] tracking-wide text-arcade-no">
              BRTI FEED ERROR
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-arcade-dim">{tickError}</p>
        </Panel>
      )}

      {state.warmup && (
        <WarmupBanner
          marketsUsed={state.volatility.marketsUsed}
          marketsRequired={state.volatility.marketsRequired}
          sampleSize={state.volatility.sampleSize}
        />
      )}

      {!primary ? (
        <EmptyState message="No BTC 15-minute market is open right now. A fresh window opens every 15 minutes — check back shortly." />
      ) : (
        <div className="space-y-2.5">
          <LiveChart
            ticker={primary.ticker}
            points={points}
            strike={primary.floorStrike}
            brti={state.brti?.value ?? null}
            closeTimeMs={new Date(primary.closeTime).getTime()}
            nowMs={now}
            observedSecs={primary.snapshot?.observedSecs ?? 0}
            modelYes={primary.snapshot?.modelYes ?? null}
            modelNo={primary.snapshot?.modelNo ?? null}
          />

          {primary.snapshot && (
            <div className="grid grid-cols-2 gap-2">
              <SideCard
                side="YES"
                askCts={primary.snapshot.yesAsk}
                edge={primary.snapshot.edgeYes}
                minEdge={state.settings.minEdge}
                entered={primary.position?.side === "YES"}
              />
              <SideCard
                side="NO"
                askCts={primary.snapshot.noAsk}
                edge={primary.snapshot.edgeNo}
                minEdge={state.settings.minEdge}
                entered={primary.position?.side === "NO"}
              />
            </div>
          )}

          {primary.position && <PositionCard position={primary.position} />}

          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-arcade-panel2/50 px-3 py-1.5 text-[9px] text-arcade-dim">
            <span>
              σ<sub>5s</sub>{" "}
              <span className="tabular font-mono text-arcade-text">
                {(state.volatility.sigma5s * 100).toFixed(4)}%
              </span>
            </span>
            <span>
              min edge{" "}
              <span className="tabular font-mono text-arcade-text">
                {(state.settings.minEdge * 100).toFixed(1)}%
              </span>
            </span>
            <span>
              stake{" "}
              <span className="tabular font-mono text-arcade-text">
                ${state.settings.paperStake}
              </span>
            </span>
          </div>
        </div>
      )}

      <RecentSettledStrip markets={state.recentSettled} />
    </div>
  );
}
