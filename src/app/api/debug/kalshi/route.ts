import { NextResponse } from "next/server";
import { getOpenBtc15mMarkets, kalshiFetch } from "@/lib/kalshi/client";
import { fetchBrtiOnce } from "@/lib/kalshi/brti";

export const dynamic = "force-dynamic";

/**
 * Diagnostic-only: dumps the raw, untouched Kalshi responses for the
 * current open BTC 15m market's `GET /markets/{ticker}` and
 * `GET /markets/{ticker}/orderbook` calls, plus a fresh BRTI read — all
 * fetched in the same instant this route runs. Only public market data
 * (no secrets).
 *
 * Includes `checkedAt` alongside each source's own freshness fields
 * (`marketDetail.market.updated_time`, `brti.timestamp`) specifically so a
 * genuine Kalshi-side staleness (their order book/market object updating
 * less often than BRTI does) is distinguishable from a bug in our own
 * fetch pipeline: hit this endpoint twice a few seconds apart and compare
 * how much `updated_time` moves against how much `checkedAt` moves. If
 * `updated_time` barely advances while `checkedAt` does, that's Kalshi's
 * own update cadence, not something wrong on our end.
 */
export async function GET() {
  try {
    const open = await getOpenBtc15mMarkets();
    if (open.length === 0) {
      return NextResponse.json({ error: "No open BTC 15m markets right now.", checkedAt: new Date().toISOString() });
    }
    const ticker = open[0]!.ticker;

    const [market, orderbook, brti] = await Promise.all([
      kalshiFetch<unknown>(`/markets/${ticker}`),
      kalshiFetch<unknown>(`/markets/${ticker}/orderbook`),
      fetchBrtiOnce().catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
    ]);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      ticker,
      marketListEntry: open[0],
      marketDetail: market,
      orderbook,
      brti,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), checkedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}
