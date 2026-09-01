import { prisma } from "@/lib/db/prisma";
import { fetchBinanceHistory } from "@/lib/binance/klines";
import { ingestBrtiTicks } from "./brtiIngest";

/**
 * Seeds the volatility lookback window from Binance BTCUSDT history the
 * first time there isn't enough real Kalshi BRTI history to cover it,
 * instead of leaving the app in warm-up mode for hours while it accumulates
 * live-only. Self-limiting: once real (or backfilled) coverage reaches the
 * required window, the coverage check short-circuits and this becomes a
 * single cheap query per tick — no flag or one-time-run bookkeeping needed.
 * Rows are tagged TickSource "BACKFILL", never "WS", so they're always
 * distinguishable from genuine Kalshi observations; nothing settlement-
 * relevant (live price, settlement-window averaging, trade decisions) ever
 * reads Binance data — only the realized-volatility estimate does.
 */
export async function ensureVolatilityHistoryBackfilled(
  requiredMs: number,
  now: Date = new Date(),
): Promise<void> {
  const earliest = await prisma.brtiTick.findFirst({
    orderBy: { timestamp: "asc" },
    select: { timestamp: true },
  });
  const coverageMs = earliest ? now.getTime() - earliest.timestamp.getTime() : 0;
  if (coverageMs >= requiredMs * 0.95) return; // already covered, nothing to do

  const minutesNeeded = Math.ceil(requiredMs / 60_000);
  try {
    const history = await fetchBinanceHistory(minutesNeeded);
    if (history.length > 0) {
      await ingestBrtiTicks(history, "BACKFILL");
      console.log(
        `[backfill] seeded ${history.length} Binance BTCUSDT ticks (~${minutesNeeded}min) into the volatility lookback window`,
      );
    } else {
      console.warn(
        "[backfill] Binance returned no usable history this attempt (network issue, geofencing, or symbol/interval rejected) — will retry next tick",
      );
    }
  } catch (err) {
    console.error("[backfill] Binance backfill failed, will retry on a later tick:", err);
  }
}
