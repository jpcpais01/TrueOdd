import { Prisma } from "@prisma/client";
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
 * free. Written as a single multi-row `INSERT ... ON CONFLICT` instead of
 * one upsert per tick — up to 60 round trips to Postgres per call otherwise,
 * real latency on a stateless serverless invocation that pays for it fresh
 * every 5-second tick. Deduplicated by rounded timestamp exactly like the
 * single-tick path (both within this batch and against prior calls), so
 * overlapping windows from normal polling stay safe and idempotent.
 */
export async function ingestBrtiTicks(ticks: BrtiTick[], source: TickSource = "WS"): Promise<void> {
  if (ticks.length === 0) return;

  // Dedupe within the batch by rounded second — keep the last occurrence,
  // since Postgres rejects an ON CONFLICT batch that touches the same row twice.
  const byTimestamp = new Map<number, number>();
  for (const t of ticks) {
    const roundedMs = Math.round(t.timestamp / 1000) * 1000;
    byTimestamp.set(roundedMs, t.value);
  }

  const rows = [...byTimestamp.entries()].map(
    ([ts, value]) => Prisma.sql`(${new Date(ts)}, ${value}, ${source}::"TickSource")`,
  );

  await prisma.$executeRaw`
    INSERT INTO "BrtiTick" ("timestamp", "value", "source")
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("timestamp") DO UPDATE SET "value" = EXCLUDED."value"
  `;
}
