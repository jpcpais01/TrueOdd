import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/engine/settings";

export const dynamic = "force-dynamic";

const SettingsPatchSchema = z.object({
  lookbackMarkets: z.number().int().min(1).max(200).optional(),
  mcPaths: z.number().int().min(100).max(200_000).optional(),
  minEdge: z.number().min(0).max(1).optional(),
  paperStake: z.number().min(0.01).max(100_000).optional(),
});

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateSettings(parsed.data);
  return NextResponse.json(updated);
}
