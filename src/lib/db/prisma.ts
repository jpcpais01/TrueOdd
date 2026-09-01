import { PrismaClient } from "@prisma/client";

/**
 * Forces `pgbouncer=true` onto the runtime (pooled) connection string.
 * Without it, Prisma uses server-side prepared statements, which a
 * PgBouncer-style pooler (Neon's included) can hand off across different
 * physical connections — after any migration that changes a column's type,
 * a connection can serve a query using a plan it cached before the change,
 * failing with "cached plan must not change result type" (Postgres error
 * 0A000) until that specific connection happens to get recycled. Disabling
 * prepared statements (simple query protocol) sidesteps the whole class of
 * failure rather than waiting it out — this makes it automatic instead of
 * requiring a manual DATABASE_URL edit after every schema change.
 */
function withPgBouncerFlag(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) {
      parsed.searchParams.set("pgbouncer", "true");
    }
    return parsed.toString();
  } catch {
    return url; // malformed URL — let Prisma's own validation surface the real error
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url: withPgBouncerFlag(process.env.DATABASE_URL) },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
