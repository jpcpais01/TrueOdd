import { getBestAsks, getMarket } from "@/lib/kalshi/client";
import type { BestAsks } from "@/lib/kalshi/types";

/**
 * Prefers the best-ask fields on the market object itself; falls back to
 * deriving them from the orderbook's resting bids if the market object
 * doesn't carry them. Both calls run concurrently rather than the
 * market-detail request needing to fail first, since latency (this runs
 * on every tick) matters more here than shaving one request off Kalshi's
 * generously-limited API.
 */
export async function getBestAsksForMarket(ticker: string): Promise<BestAsks> {
  const [marketResult, orderbookResult] = await Promise.allSettled([
    getMarket(ticker),
    getBestAsks(ticker),
  ]);

  if (marketResult.status === "fulfilled") {
    const m = marketResult.value;
    if (typeof m.yes_ask === "number" && typeof m.no_ask === "number") {
      return { yesAskCts: m.yes_ask, noAskCts: m.no_ask };
    }
  }

  if (orderbookResult.status === "fulfilled") {
    return orderbookResult.value;
  }

  return { yesAskCts: null, noAskCts: null };
}
