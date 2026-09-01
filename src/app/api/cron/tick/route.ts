import { NextRequest, NextResponse } from "next/server";
import { runEngineTick } from "@/lib/engine/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Vercel Cron entry point — a once-a-minute safety net so data collection
 * doesn't fully stop if nobody has the dashboard open and the standalone
 * collector worker isn't running. Real 5-second cadence still requires
 * either the collector worker or an open dashboard tab (see README).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runEngineTick();
    return NextResponse.json({ ok: true, openMarkets: result.openMarkets, tradesOpened: result.tradesOpened });
  } catch (err) {
    console.error("[api/cron/tick] engine tick failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown" }, { status: 502 });
  }
}
