import { prisma } from "@/lib/db/prisma";
import { DEFAULT_SETTINGS } from "./constants";

export interface StrategySettings {
  lookbackMarkets: number;
  mcPaths: number;
  minEdge: number;
  paperStake: number;
}

/** Reads the singleton settings row, creating it with defaults on first use. */
export async function getSettings(): Promise<StrategySettings> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, ...DEFAULT_SETTINGS },
    update: {},
  });
  return {
    lookbackMarkets: row.lookbackMarkets,
    mcPaths: row.mcPaths,
    minEdge: row.minEdge,
    paperStake: row.paperStake,
  };
}

export async function updateSettings(
  partial: Partial<StrategySettings>,
): Promise<StrategySettings> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, ...DEFAULT_SETTINGS, ...partial },
    update: partial,
  });
  return {
    lookbackMarkets: row.lookbackMarkets,
    mcPaths: row.mcPaths,
    minEdge: row.minEdge,
    paperStake: row.paperStake,
  };
}
