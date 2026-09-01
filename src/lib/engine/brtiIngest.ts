import { prisma } from "@/lib/db/prisma";
import type { BrtiTick } from "@/lib/kalshi/brti";
import type { TickSource } from "@prisma/client";

/**
 * Persists one BRTI observation, rounded to the nearest whole second. The
 * rounding is what makes "one observation per second" a meaningful,
 * de-duplicated concept — a retried poll or an overlapping worker/API-route
 * tick landing on the same second updates in place rather than creating a
 * near-duplicate row.
 */
export async function ingestBrtiTick(tick: BrtiTick, source: TickSource = "WS"): Promise<void> {
  const roundedMs = Math.round(tick.timestamp / 1000) * 1000;
  const timestamp = new Date(roundedMs);
  await prisma.brtiTick.upsert({
    where: { timestamp },
    create: { timestamp, value: tick.value, source },
    update: { value: tick.value },
  });
}

/**
 * Bulk variant — CF Benchmarks' REST passthrough returns a trailing window
 * of ~60 one-second observations per request, not just the latest point, so
 * every poll can backfill a full minute of 1-second-resolution history for
 * free. Upserts are deduplicated by rounded timestamp exactly like the
 * single-tick path, so calling this repeatedly with overlapping windows
 * (as normal polling does) is safe and idempotent.
 */
export async function ingestBrtiTicks(ticks: BrtiTick[], source: TickSource = "WS"): Promise<void> {
  await Promise.all(ticks.map((t) => ingestBrtiTick(t, source)));
}
