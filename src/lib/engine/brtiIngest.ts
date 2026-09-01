import { prisma } from "@/lib/db/prisma";
import type { BrtiTick } from "@/lib/kalshi/brti";
import type { TickSource } from "@prisma/client";

/**
 * Persists one BRTI observation, rounded to the nearest whole second. The
 * rounding is what makes "one observation per second" a meaningful,
 * de-duplicated concept — a websocket reconnect or an overlapping
 * worker/API-route tick landing on the same second updates in place rather
 * than creating a near-duplicate row.
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
