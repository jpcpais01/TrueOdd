import { getBestAsks, getMarket } from "@/lib/kalshi/client";
import type { BestAsks } from "@/lib/kalshi/types";

/**
 * Prefers the best-ask fields on the market object itself (one call); falls
 * back to deriving them from the orderbook's resting bids if the market
 * object doesn't carry them or the request fails.
 */
export async function getBestAsksForMarket(ticker: string): Promise<BestAsks> {
  try {
    const market = await getMarket(ticker);
    if (typeof market.yes_ask === "number" && typeof market.no_ask === "number") {
      return { yesAskCts: market.yes_ask, noAskCts: market.no_ask };
    }
  } catch {
    // fall through to orderbook
  }

  try {
    return await getBestAsks(ticker);
  } catch {
    return { yesAskCts: null, noAskCts: null };
  }
}
