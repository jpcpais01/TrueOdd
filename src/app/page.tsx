"use client";

import { useAppState } from "@/hooks/useAppState";
import { useNow } from "@/hooks/useNow";
import WarmupBanner from "@/components/dashboard/WarmupBanner";
import StrikeHero from "@/components/dashboard/StrikeHero";
import SideCard from "@/components/dashboard/SideCard";
import PositionCard from "@/components/dashboard/PositionCard";
import RecentSettledStrip from "@/components/dashboard/RecentSettledStrip";
import EmptyState from "@/components/dashboard/EmptyState";
import Panel from "@/components/ui/Panel";

export default function DashboardPage() {
  const { state, error } = useAppState({ heartbeat: true });
  const now = useNow(1000);

  if (error && !state) {
    return <EmptyState message="Can't reach the engine yet. Retrying…" />;
  }

  if (!state) {
    return (
      <div className="animate-pulse space-y-3">
        <Panel className="h-40" />
        <div className="grid grid-cols-2 gap-3">
          <Panel className="h-32" />
          <Panel className="h-32" />
        </div>
      </div>
    );
  }

  const primary = state.markets[0] ?? null;

  return (
    <div>
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
        <div className="space-y-3">
          <StrikeHero
            ticker={primary.ticker}
            floorStrike={primary.floorStrike}
            brti={state.brti?.value ?? null}
            closeTimeMs={new Date(primary.closeTime).getTime()}
            nowMs={now}
            observedSecs={primary.snapshot?.observedSecs ?? 0}
          />

          {primary.snapshot ? (
            <div className="grid grid-cols-2 gap-3">
              <SideCard
                side="YES"
                askCts={primary.snapshot.yesAsk}
                modelProb={primary.snapshot.modelYes}
                edge={primary.snapshot.edgeYes}
                minEdge={state.settings.minEdge}
                entered={primary.position?.side === "YES"}
              />
              <SideCard
                side="NO"
                askCts={primary.snapshot.noAsk}
                modelProb={primary.snapshot.modelNo}
                edge={primary.snapshot.edgeNo}
                minEdge={state.settings.minEdge}
                entered={primary.position?.side === "NO"}
              />
            </div>
          ) : (
            <EmptyState message="Model is warming up its first read on this market…" />
          )}

          {primary.position && <PositionCard position={primary.position} />}

          <Panel className="px-4 py-2.5">
            <div className="flex items-center justify-between text-[10px] text-arcade-dim">
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
          </Panel>
        </div>
      )}

      <RecentSettledStrip markets={state.recentSettled} />
    </div>
  );
}
