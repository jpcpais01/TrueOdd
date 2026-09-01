/**
 * Standalone always-on collector.
 *
 * Vercel's serverless functions can't hold a persistent connection or run a
 * 24/7 sub-minute loop, so this process is what actually satisfies "every
 * 5 seconds" and "persist every BRTI observation" continuously, independent
 * of whether anyone has the dashboard open. Run it anywhere that stays on —
 * a small VPS, Railway/Fly/Render, a Raspberry Pi, tmux/pm2/systemd on your
 * own machine — pointed at the same DATABASE_URL as the Vercel deployment.
 *
 * It holds one persistent, auto-reconnecting websocket to Kalshi's CF
 * Benchmarks BRTI feed (which pushes ~once per second) and ingests every
 * tick as it arrives — that alone gives full 1-second resolution for the
 * settlement-window replication with no special-casing needed. Separately,
 * on a 5-second timer, it runs one full engine cycle (market sync, Monte
 * Carlo, snapshot persistence, paper-trade evaluation) off the latest
 * cached BRTI value.
 */
import "dotenv/config";
import { openBrtiStream, type BrtiTick } from "../src/lib/kalshi/brti";
import { ingestBrtiTick } from "../src/lib/engine/brtiIngest";
import { runEngineTick } from "../src/lib/engine/tick";

const TICK_INTERVAL_MS = 5000;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

let latest: BrtiTick | null = null;
let ticksReceived = 0;

log("[collector] starting — connecting to Kalshi BRTI feed");

const stream = openBrtiStream({
  onTick: (t) => {
    latest = t;
    ticksReceived++;
    ingestBrtiTick(t).catch((err) => log("[collector] failed to persist BRTI tick:", err));
  },
  onOpen: () => log("[collector] BRTI websocket connected"),
  onClose: () => log("[collector] BRTI websocket closed — will reconnect with backoff"),
  onError: (err) => log("[collector] BRTI websocket error:", err.message),
});

let running = false;

async function tick() {
  if (running) {
    log("[collector] previous engine tick still running, skipping this cycle");
    return;
  }
  running = true;
  try {
    if (!latest) {
      log("[collector] no BRTI data yet, skipping engine tick");
      return;
    }
    const result = await runEngineTick({ latestBrti: latest });
    const openTickers = result.openMarkets;
    const traded = result.tradesOpened.length > 0 ? result.tradesOpened.join(", ") : "-";
    const brtiStr = result.brti ? result.brti.value.toFixed(2) : `ingest failed: ${result.brtiError}`;
    log(
      `[collector] tick ok | brti=${brtiStr} | open=${openTickers} | warmup=${result.volatility.warmup} | sigma5s=${result.volatility.sigma5s.toFixed(6)} | entered=${traded} | total ticks seen=${ticksReceived}`,
    );
  } catch (err) {
    log("[collector] engine tick failed:", err);
  } finally {
    running = false;
  }
}

const interval = setInterval(tick, TICK_INTERVAL_MS);

function shutdown(signal: string) {
  log(`[collector] received ${signal}, shutting down`);
  clearInterval(interval);
  stream.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
