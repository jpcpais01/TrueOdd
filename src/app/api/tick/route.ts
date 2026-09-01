import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runEngineTick } from "@/lib/engine/tick";
import { buildStateView } from "@/lib/engine/stateView";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIN_TICK_INTERVAL_MS = 400;

/**
 * Runs one engine cycle (ingest BRTI, sync markets, model + trade) and
 * returns the resulting dashboard state in the same response — the client
 * heartbeat used to follow this with a separate GET /api/state, doubling
 * its round-trip latency for no reason, since this route already has
 * everything needed to build that view after the tick completes.
 *
 * Called by the dashboard's client-side heartbeat while it's open, by the
 * standalone collector worker, and as a fallback by Vercel Cron. Cheaply
 * throttled so several browser tabs firing at once don't hammer Kalshi —
 * a throttled response still returns fresh state, just without running
 * another tick.
 */
export async function POST() {
  try {
    const last = await prisma.modelSnapshot.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    if (last && Date.now() - last.timestamp.getTime() < MIN_TICK_INTERVAL_MS) {
      const state = await buildStateView();
      return NextResponse.json({ skipped: true, reason: "throttled", state });
    }

    const result = await runEngineTick();
    const state = await buildStateView();
    return NextResponse.json({
      skipped: false,
      now: result.now,
      brti: result.brti,
      brtiError: result.brtiError,
      volatility: result.volatility,
      openMarkets: result.openMarkets,
      tradesOpened: result.tradesOpened,
      state,
    });
  } catch (err) {
    console.error("[api/tick] engine tick failed", err);
    // Still try to hand back the freshest available state (e.g. a BRTI tick
    // that already landed before the failure) rather than forcing the
    // client to fall back to a separate, slower GET /api/state round trip.
    let state: Awaited<ReturnType<typeof buildStateView>> | undefined;
    try {
      state = await buildStateView();
    } catch {
      // DB is genuinely unreachable — nothing to hand back.
    }
    return NextResponse.json(
      { skipped: false, error: err instanceof Error ? err.message : "unknown error", state },
      { status: 502 },
    );
  }
}
