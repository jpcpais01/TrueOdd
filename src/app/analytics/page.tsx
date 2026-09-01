"use client";

import { useAnalytics } from "@/hooks/useAppState";
import StatsGrid from "@/components/analytics/StatsGrid";
import CalibrationChart from "@/components/analytics/CalibrationChart";
import PnlCurveChart from "@/components/analytics/PnlCurveChart";
import TradeHistoryList from "@/components/analytics/TradeHistoryList";
import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/dashboard/EmptyState";

export default function AnalyticsPage() {
  const { analytics, error } = useAnalytics();

  if (error && !analytics) {
    return <EmptyState message="Can't reach the engine yet. Retrying…" />;
  }

  if (!analytics) {
    return (
      <div className="animate-pulse space-y-3">
        <Panel className="h-24" />
        <Panel className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 font-display text-xs text-arcade-text">PERFORMANCE</h1>
        <StatsGrid stats={analytics.stats} brier={analytics.brier} />
      </div>

      <PnlCurveChart trades={analytics.trades} />
      <CalibrationChart
        calibration={analytics.calibration}
        sampleSize={analytics.calibrationSampleSize}
      />

      <div>
        <h2 className="mb-2 font-display text-xs text-arcade-text">TRADE HISTORY</h2>
        <TradeHistoryList trades={analytics.trades} />
      </div>
    </div>
  );
}
