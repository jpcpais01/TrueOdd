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
 * BRTI comes from a genuine push feed here, not polling: this process holds
 * a persistent, auto-reconnecting websocket to Kalshi's CF Benchmarks BRTI
 * channel (src/lib/kalshi/brtiStream.ts) — viable because this is a normal
 * long-running Node process, unlike a Vercel serverless function. If the
 * websocket is down or hasn't produced a fresh tick recently, each engine
 * cycle transparently falls back to a one-shot REST fetch instead (no dead
 * air either way).
 *
 * Two independent timers:
 *
 *  - Every TICK_INTERVAL_MS (default 500ms): a full engine cycle (use the
 *    latest websocket tick if fresh, else self-fetch over REST; market
 *    sync; Monte Carlo; snapshot persistence; paper-trade evaluation). The
 *    Monte Carlo step reuses a precomputed SimulationRegime (see
 *    src/lib/quant/montecarlo.ts) instead of drawing 10,000 fresh random
 *    paths every cycle — a cheap re-pricing of the same underlying random
 *    shocks against the latest price and time-remaining, which is what
 *    makes sub-second cadence practical.
 *  - Every REGIME_REFRESH_MS (default 5 minutes): recompute realized
 *    volatility from the DB and regenerate the regime from it. This is the
 *    only point where new randomness is drawn and where a changed
 *    volatility estimate actually takes effect.
 */
import "dotenv/config";
import { generateRegime, type SimulationRegime } from "../src/lib/quant/montecarlo";
import { computeRollingVolatility } from "../src/lib/engine/volatilityWindow";
import { getSettings } from "../src/lib/engine/settings";
import { runEngineTick } from "../src/lib/engine/tick";
import { openBrtiStream } from "../src/lib/kalshi/brtiStream";
import { ingestBrtiTick } from "../src/lib/engine/brtiIngest";
import type { BrtiTick } from "../src/lib/kalshi/brti";

const TICK_INTERVAL_MS = 500;
const REGIME_REFRESH_MS = 5 * 60 * 1000;
/** How old a websocket-delivered tick can be before a cycle prefers a fresh
 * REST fetch instead — covers a connection that's silently gone quiet. */
const WS_FRESHNESS_MS = 5000;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

let regime: SimulationRegime | null = null;
let latestWs: BrtiTick | null = null;
let wsTicksReceived = 0;
let wsConnected = false;

async function refreshRegime() {
  try {
    const settings = await getSettings();
    const vol = await computeRollingVolatility(settings.lookbackMarkets);
    regime = generateRegime(vol.sigma5s, settings.mcPaths);
    log(
      `[collector] regime refreshed | sigma5s=${vol.sigma5s.toFixed(6)} | paths=${settings.mcPaths} | warmup=${vol.warmup} | marketsUsed=${vol.marketsUsed.toFixed(1)}/${vol.marketsRequired}`,
    );
  } catch (err) {
    // Keep using the stale regime (if any) rather than going regime-less —
    // a slightly-stale vol estimate beats falling back to a fresh 10,000-path
    // simulation every second.
    log("[collector] regime refresh failed, keeping previous regime:", err);
  }
}

log("[collector] connecting to Kalshi BRTI websocket (per-tick REST fallback if it's down)");

const stream = openBrtiStream({
  onTick: (t) => {
    latestWs = t;
    wsTicksReceived++;
    ingestBrtiTick(t).catch((err) => log("[collector] failed to persist websocket BRTI tick:", err));
  },
  onOpen: () => {
    wsConnected = true;
    log("[collector] BRTI websocket connected — live push mode");
  },
  onClose: (info) => {
    wsConnected = false;
    log(
      `[collector] BRTI websocket closed (code=${info.code}${info.reason ? `, reason=${info.reason}` : ""}) — reconnecting; REST fallback active meanwhile`,
    );
  },
  onError: (err) => {
    log("[collector] BRTI websocket error:", err.message);
  },
});

let running = false;

async function tick() {
  if (running) {
    log("[collector] previous engine tick still running, skipping this cycle");
    return;
  }
  running = true;
  try {
    const opts: { regime?: SimulationRegime; latestBrti?: BrtiTick } = {};
    if (regime) opts.regime = regime;
    if (latestWs && Date.now() - latestWs.timestamp < WS_FRESHNESS_MS) {
      opts.latestBrti = latestWs;
    }

    const result = await runEngineTick(opts);
    const traded = result.tradesOpened.length > 0 ? result.tradesOpened.join(", ") : "-";
    const brtiStr = result.brti
      ? result.brti.value.toFixed(2)
      : `ingest failed: ${result.brtiError}`;
    const source = opts.latestBrti ? "ws" : "rest";
    log(
      `[collector] tick ok | brti=${brtiStr} (${source}) | open=${result.openMarkets} | warmup=${result.volatility.warmup} | entered=${traded} | regime=${regime ? "cached" : "none (fresh sim)"} | ws=${wsConnected ? "up" : "down"} (${wsTicksReceived} received)`,
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
  stream.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  log(`[collector] starting — ${TICK_INTERVAL_MS}ms engine cycle, regime refreshed every 5 minutes`);
  await refreshRegime();
  tickInterval = setInterval(tick, TICK_INTERVAL_MS);
  regimeInterval = setInterval(refreshRegime, REGIME_REFRESH_MS);
}

main().catch((err) => {
  log("[collector] fatal startup error:", err);
  process.exit(1);
});
