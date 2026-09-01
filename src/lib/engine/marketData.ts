import { getBestAsks, getMarket } from "@/lib/kalshi/client";
import { dollarsToCents, type BestAsks } from "@/lib/kalshi/types";

/**
 * Prefers the best-ask fields on the market object itself (`yes_ask_dollars`
 * / `no_ask_dollars` — confirmed via /api/debug/kalshi); falls back to
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
    const yesAskCts = dollarsToCents(marketResult.value.yes_ask_dollars);
    const noAskCts = dollarsToCents(marketResult.value.no_ask_dollars);
    if (yesAskCts !== null && noAskCts !== null) {
      return { yesAskCts, noAskCts };
    }
  }

  if (orderbookResult.status === "fulfilled") {
    return orderbookResult.value;
  }

  return { yesAskCts: null, noAskCts: null };
}
