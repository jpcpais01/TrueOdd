import { prisma } from "@/lib/db/prisma";
import { estimateVolatility } from "@/lib/quant/volatility";
import type { VolatilityResult } from "@/lib/quant/types";

export interface RollingVolatility extends VolatilityResult {
  marketsUsed: number;
  marketsRequired: number;
}

/**
 * Recomputes realized volatility from 5-second BRTI log returns across the
 * previous `lookbackMarkets` *completed* 15-minute markets. Persisting every
 * BRTI observation (via ingestBrtiTick) is what makes this rolling window
 * update automatically as new markets settle — no separate backfill step.
 */
export async function computeRollingVolatility(
  lookbackMarkets: number,
  now: Date = new Date(),
): Promise<RollingVolatility> {
  const completed = await prisma.market.findMany({
    where: { status: "SETTLED", closeTime: { lte: now } },
    orderBy: { closeTime: "desc" },
    take: lookbackMarkets,
  });

  if (completed.length === 0) {
    return { sigma5s: 0, sampleSize: 0, warmup: true, marketsUsed: 0, marketsRequired: lookbackMarkets };
  }

  const oldest = completed[completed.length - 1]!;
  const newest = completed[0]!;

  const ticks = await prisma.brtiTick.findMany({
    where: { timestamp: { gte: oldest.openTime, lte: newest.closeTime } },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true, value: true },
  });

  const result = estimateVolatility(
    ticks.map((t) => ({ timestamp: t.timestamp.getTime(), value: t.value })),
  );

  return {
    ...result,
    warmup: result.warmup || completed.length < lookbackMarkets,
    marketsUsed: completed.length,
    marketsRequired: lookbackMarkets,
  };
}
