import { NextResponse } from "next/server";
import { getOpenBtc15mMarkets, kalshiFetch } from "@/lib/kalshi/client";

export const dynamic = "force-dynamic";

/**
 * Diagnostic-only: dumps the raw, untouched Kalshi responses for the
 * current open BTC 15m market's `GET /markets/{ticker}` and
 * `GET /markets/{ticker}/orderbook` calls. Only public market data (no
 * secrets), used to verify the actual field names/shapes against the
 * guesses in src/lib/kalshi/{types,client,engine/marketData}.ts — the same
 * docs.kalshi.com access this build environment doesn't have.
 */
export async function GET() {
  try {
    const open = await getOpenBtc15mMarkets();
    if (open.length === 0) {
      return NextResponse.json({ error: "No open BTC 15m markets right now." });
    }
    const ticker = open[0]!.ticker;

    const [market, orderbook] = await Promise.all([
      kalshiFetch<unknown>(`/markets/${ticker}`),
      kalshiFetch<unknown>(`/markets/${ticker}/orderbook`),
    ]);

    return NextResponse.json({
      ticker,
      marketListEntry: open[0],
      marketDetail: market,
      orderbook,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
