/**
 * Standalone always-on collector.
 *
 * Vercel's serverless functions can't hold a persistent connection or run a
 * 24/7 sub-minute loop, so this process is what actually satisfies
 * "persist every BRTI observation" continuously, independent of whether
 * anyone has the dashboard open. Run it anywhere that stays on — a small
 * VPS, Railway/Fly/Render, a Raspberry Pi, tmux/pm2/systemd on your own
 * machine — pointed at the same DATABASE_URL as the Vercel deployment.
 *
 * Two independent timers:
 *
 *  - Every second: a full engine cycle (BRTI fetch/ingest, market sync,
 *    Monte Carlo, snapshot persistence, paper-trade evaluation). The Monte
 *    Carlo step reuses a precomputed SimulationRegime (see
 *    src/lib/quant/montecarlo.ts) instead of drawing 10,000 fresh random
 *    paths every second — it's a cheap re-pricing of the same underlying
 *    random shocks against the latest price and time-remaining, which is
 *    what makes 1-second cadence practical.
 *  - Every REGIME_REFRESH_MS (default 5 minutes): recompute realized
 *    volatility from the DB and regenerate the regime from it. This is the
 *    only point where new randomness is drawn and where a changed
 *    volatility estimate actually takes effect.
 *
 * Kalshi rate limits comfortably support 1 req/s for a personal, single-
 * account, 1-2-open-market deployment (Basic tier: 20 reads/sec).
 */
import "dotenv/config";
import { generateRegime, type SimulationRegime } from "../src/lib/quant/montecarlo";
import { computeRollingVolatility } from "../src/lib/engine/volatilityWindow";
import { getSettings } from "../src/lib/engine/settings";
import { runEngineTick } from "../src/lib/engine/tick";

const TICK_INTERVAL_MS = 1000;
const REGIME_REFRESH_MS = 5 * 60 * 1000;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

let regime: SimulationRegime | null = null;

async function refreshRegime() {
  try {
    const settings = await getSettings();
    const vol = await computeRollingVolatility(settings.lookbackMarkets);
    regime = generateRegime(vol.sigma5s, settings.mcPaths);
    log(
      `[collector] regime refreshed | sigma5s=${vol.sigma5s.toFixed(6)} | paths=${settings.mcPaths} | warmup=${vol.warmup} | marketsUsed=${vol.marketsUsed}/${vol.marketsRequired}`,
    );
  } catch (err) {
    // Keep using the stale regime (if any) rather than going regime-less —
    // a slightly-stale vol estimate beats falling back to a fresh 10,000-path
    // simulation every second.
    log("[collector] regime refresh failed, keeping previous regime:", err);
  }
}

let running = false;

async function tick() {
  if (running) {
    log("[collector] previous engine tick still running, skipping this cycle");
    return;
  }
  running = true;
  try {
    const result = await runEngineTick(regime ? { regime } : {});
    const traded = result.tradesOpened.length > 0 ? result.tradesOpened.join(", ") : "-";
    const brtiStr = result.brti
      ? result.brti.value.toFixed(2)
      : `ingest failed: ${result.brtiError}`;
    log(
      `[collector] tick ok | brti=${brtiStr} | open=${result.openMarkets} | warmup=${result.volatility.warmup} | entered=${traded} | regime=${regime ? "cached" : "none (fresh sim)"}`,
    );
  } catch (err) {
    log("[collector] engine tick failed:", err);
  } finally {
    running = false;
  }
}

let tickInterval: ReturnType<typeof setInterval> | null = null;
let regimeInterval: ReturnType<typeof setInterval> | null = null;

function shutdown(signal: string) {
  log(`[collector] received ${signal}, shutting down`);
  if (tickInterval) clearInterval(tickInterval);
  if (regimeInterval) clearInterval(regimeInterval);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  log("[collector] starting — 1s engine cycle, regime refreshed every 5 minutes");
  await refreshRegime();
  tickInterval = setInterval(tick, TICK_INTERVAL_MS);
  regimeInterval = setInterval(refreshRegime, REGIME_REFRESH_MS);
}

main().catch((err) => {
  log("[collector] fatal startup error:", err);
  process.exit(1);
});
