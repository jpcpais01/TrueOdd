import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runEngineTick } from "@/lib/engine/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIN_TICK_INTERVAL_MS = 2000;

/**
 * Runs one engine cycle (ingest BRTI, sync markets, model + trade). Called
 * by the dashboard's client-side heartbeat while it's open, by the
 * standalone collector worker, and as a fallback by Vercel Cron. Cheaply
 * throttled so several browser tabs firing at once don't hammer Kalshi.
 */
export async function POST() {
  const last = await prisma.modelSnapshot.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  if (last && Date.now() - last.timestamp.getTime() < MIN_TICK_INTERVAL_MS) {
    return NextResponse.json({ skipped: true, reason: "throttled" });
  }

  try {
    const result = await runEngineTick();
    return NextResponse.json({
      skipped: false,
      now: result.now,
      brti: result.brti,
      volatility: result.volatility,
      openMarkets: result.openMarkets,
      tradesOpened: result.tradesOpened,
    });
  } catch (err) {
    console.error("[api/tick] engine tick failed", err);
    return NextResponse.json(
      { skipped: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 502 },
    );
  }
}
