import { prisma } from "@/lib/db/prisma";
import { computeRollingVolatility } from "./volatilityWindow";
import { getSettings } from "./settings";

/**
 * Assembles the full dashboard state payload. Shared by GET /api/state and
 * POST /api/tick — the tick route returns this directly in its own
 * response so the client heartbeat doesn't need a second round trip just
 * to read back what the tick it just ran wrote.
 */
export async function buildStateView() {
  const now = new Date();
  const settings = await getSettings();

  const [openMarkets, latestBrti, volatility, recentSettled] = await Promise.all([
    prisma.market.findMany({ where: { status: "OPEN" }, orderBy: { closeTime: "asc" } }),
    prisma.brtiTick.findFirst({ orderBy: { timestamp: "desc" } }),
    computeRollingVolatility(settings.lookbackMarkets, now),
    prisma.market.findMany({
      where: { status: "SETTLED" },
      orderBy: { closeTime: "desc" },
      take: 8,
    }),
  ]);

  const markets = await Promise.all(
    openMarkets.map(async (m) => {
      const [latestSnapshot, trade] = await Promise.all([
        prisma.modelSnapshot.findFirst({
          where: { marketId: m.id },
          orderBy: { timestamp: "desc" },
        }),
        prisma.trade.findUnique({ where: { marketId: m.id } }),
      ]);

      return {
        ticker: m.id,
        floorStrike: m.floorStrike,
        openTime: m.openTime,
        closeTime: m.closeTime,
        timeRemainingMs: m.closeTime.getTime() - now.getTime(),
        snapshot: latestSnapshot
          ? {
              timestamp: latestSnapshot.timestamp,
              brti: latestSnapshot.brti,
              yesAsk: latestSnapshot.yesAsk,
              noAsk: latestSnapshot.noAsk,
              modelYes: latestSnapshot.modelYes,
              modelNo: latestSnapshot.modelNo,
              edgeYes: latestSnapshot.edgeYes,
              edgeNo: latestSnapshot.edgeNo,
              observedSecs: latestSnapshot.observedSecs,
            }
          : null,
        position: trade
          ? {
              side: trade.side,
              entryPriceCts: trade.entryPriceCts,
              stake: trade.stake,
              contracts: trade.contracts,
              status: trade.status,
              pnl: trade.pnl,
              entryTime: trade.entryTime,
            }
          : null,
      };
    }),
  );

  return {
    now,
    settings,
    warmup: volatility.warmup,
    volatility: {
      sigma5s: volatility.sigma5s,
      sampleSize: volatility.sampleSize,
      marketsUsed: volatility.marketsUsed,
      marketsRequired: volatility.marketsRequired,
    },
    brti: latestBrti ? { value: latestBrti.value, timestamp: latestBrti.timestamp } : null,
    markets,
    recentSettled: recentSettled.map((m) => ({
      ticker: m.id,
      floorStrike: m.floorStrike,
      settlementAvg: m.settlementAvg,
      settlementSide: m.settlementSide,
      closeTime: m.closeTime,
    })),
  };
}
