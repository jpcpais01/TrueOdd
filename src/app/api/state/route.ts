import { NextResponse } from "next/server";
import { buildStateView } from "@/lib/engine/stateView";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await buildStateView();
    return NextResponse.json(state);
  } catch (err) {
    console.error("[api/state] failed", err);
    const message = err instanceof Error ? err.message : "unknown error";
    const hint = message.includes("Can't reach database") || message.includes("P1001")
      ? "Can't reach the database. Check DATABASE_URL."
      : /relation .* does not exist|P2021|P2022/.test(message)
        ? "Database schema is missing. Migrations haven't been applied — run `npx prisma migrate deploy` against DATABASE_URL (or redeploy, since the build now runs it automatically)."
        : message;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}
