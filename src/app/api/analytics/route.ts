import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { computeFill, computePortfolioStats, brierScore, calibrationCurve } from "@/lib/quant/pnl";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = await prisma.trade.findMany({
    orderBy: { entryTime: "desc" },
    take: 500,
    include: { market: { select: { floorStrike: true, closeTime: true } } },
  });

  const settledTrades = trades.filter((t) => t.status === "WON" || t.status === "LOST");
  const portfolioInput = settledTrades.map((t) => {
    const { cost } = computeFill({ side: t.side, entryPriceCts: t.entryPriceCts, stake: t.stake });
    return { stake: t.stake, cost, pnl: t.pnl ?? 0 };
  });
  const stats = computePortfolioStats(portfolioInput);

  // Calibration / Brier score: every non-warmup model snapshot on a
  // now-settled market, compared against that market's actual outcome —
  // not just the snapshots that triggered a trade, so it reflects the
  // model's overall accuracy rather than only its highest-conviction calls.
  const settledMarkets = await prisma.market.findMany({
    where: { status: "SETTLED", settlementSide: { not: null } },
    select: { id: true, settlementSide: true },
  });
  const sideByMarket = new Map(settledMarkets.map((m) => [m.id, m.settlementSide]));

  const snapshots =
    settledMarkets.length > 0
      ? await prisma.modelSnapshot.findMany({
          where: { marketId: { in: [...sideByMarket.keys()] }, warmup: false },
          select: { marketId: true, modelYes: true },
          orderBy: { timestamp: "desc" },
          take: 20_000,
        })
      : [];

  const predictions = snapshots.map((s) => ({
    prob: s.modelYes,
    won: sideByMarket.get(s.marketId) === "YES",
  }));

  const brier = predictions.length > 0 ? brierScore(predictions) : null;
  const calibration = predictions.length > 0 ? calibrationCurve(predictions, 10) : [];

  return NextResponse.json({
    stats,
    brier,
    calibrationSampleSize: predictions.length,
    calibration,
    trades: trades.map((t) => ({
      id: t.id,
      ticker: t.marketId,
      side: t.side,
      entryPriceCts: t.entryPriceCts,
      stake: t.stake,
      contracts: t.contracts,
      modelProb: t.modelProb,
      edge: t.edge,
      entryTime: t.entryTime,
      status: t.status,
      settlementSide: t.settlementSide,
      pnl: t.pnl,
      settledAt: t.settledAt,
      floorStrike: t.market.floorStrike,
      closeTime: t.market.closeTime,
    })),
  });
}
