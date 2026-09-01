# TrueOdd

A mobile-first paper-trading research dashboard for Kalshi's rolling **BTC 15-minute
Up/Down** markets (`KXBTC15M`). It runs a from-scratch Monte Carlo fair-probability
model against Kalshi's real order book every 5 seconds, and paper-buys when the model
disagrees with the market by more than a configurable edge threshold.

**This app never places a real order.** Every trade is simulated (`Trade` rows in the
database); there is no order-submission code path anywhere in this repo.

## The hypothesis

Retail/noise-driven pricing in short-duration Kalshi markets *may* occasionally diverge
from a statistically estimated fair probability. TrueOdd exists to test that objectively
by logging every model read against what actually happens — not to assume it's true. See
the Analytics screen (Brier score + calibration curve) for whether the model is even any
good before reading anything into the P&L.

## How it works

1. **Market detection** — every engine tick lists Kalshi's currently open `KXBTC15M`
   markets and upserts them (`src/lib/engine/marketTracker.ts`). New windows are picked
   up automatically; a market Kalshi stops listing as open is settled — using Kalshi's
   own reported result when available, cross-checked against our own recomputation from
   persisted BRTI ticks.
2. **BRTI collection** — a persistent websocket subscription to Kalshi's CF Benchmarks
   BRTI value feed (which pushes ~once/second) is ingested continuously and persisted,
   deduplicated to one row per second (`src/lib/engine/brtiIngest.ts`). This is what
   makes the volatility rolling window and the settlement-window replication both work
   without any special-cased sampling-rate switching.
3. **Volatility** — every tick, realized vol is re-estimated as the standard deviation
   of 5-second-equivalent log returns across the previous *N* (default 10) **completed**
   markets, using the full persisted BRTI history spanning them
   (`src/lib/quant/volatility.ts`, `src/lib/engine/volatilityWindow.ts`). Below a minimum
   clean-sample threshold, or with fewer than *N* completed markets on record, the app
   is in **warm-up mode**: it displays that plainly and does not paper-trade.
4. **Monte Carlo** — ~10,000 zero-drift GBM paths are simulated from the current BRTI
   price straight to `close_time - 60s` (a single log-normal jump is exact for a
   driftless GBM, so no need to step every intermediate 5s), then stepped
   second-by-second through the 60-second settlement window. Any window observations
   *already recorded* are treated as fixed and only the remaining unknown seconds are
   simulated — this reproduces Kalshi's actual settlement mechanism (the average of 60
   one-second BRTI observations), not just the final tick (`src/lib/quant/montecarlo.ts`).
5. **Edge & paper trading** — `edgeYes = modelYes - yesBestAsk`, `edgeNo = modelNo -
   noBestAsk`. If either edge clears `MIN_EDGE` (default 2%), the engine paper-buys that
   side at its best ask — at most one entry per market, never on stale BRTI data or an
   incomplete order book (`src/lib/quant/edge.ts`, `src/lib/engine/tick.ts`).
6. **Persistence** — *every* 5-second model read is stored (`ModelSnapshot`), not just
   trades, specifically so the raw BRTI/strike/time-remaining/asks/probabilities/edges
   are available for later strategy research, independent of whether that tick triggered
   a trade.

## Why there's a separate collector process

Vercel serverless functions can't hold a persistent websocket or run an unattended loop
24/7 at 5-second cadence. So there are two ways data gets collected, and you'll likely
want both:

- **`npm run collector`** — a standalone Node process (`scripts/collector.ts`) that holds
  the persistent BRTI websocket and runs the 5-second engine loop continuously,
  independent of anyone viewing the dashboard. Run this anywhere that stays on: a small
  VPS, Railway/Fly/Render, a Raspberry Pi, `pm2`/`systemd`/`tmux` on your own machine —
  pointed at the **same** `DATABASE_URL` as your Vercel deployment. This is what actually
  builds and maintains the rolling BRTI history needed to exit warm-up mode.
- **The dashboard itself** also drives the engine: while the main screen (`/`) is open in
  a browser, it POSTs `/api/tick` every 5 seconds as a heartbeat, so opening the app is
  enough to collect data and trade in real time even without the worker running.
- **Vercel Cron** is *optional* and off by default (no `vercel.json` crons block, so the
  project imports cleanly on the free Hobby plan). `/api/cron/tick` exists and works —
  it's just not wired to a schedule out of the box, because Hobby only allows daily cron,
  which isn't useful at 5s cadence anyway. If you're on a **Pro** plan, add a `vercel.json`
  with:
  ```json
  {
    "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }]
  }
  ```
  as a once-a-minute safety net so collection doesn't fully stop if neither of the above
  is active. The worker process is the reliable option regardless of plan.

All paths call the exact same idempotent tick logic (`runEngineTick`), so there's no
double-counting: BRTI ingestion dedupes to one row per second, and trades are guarded by
a unique constraint (max one entry per market).

## Getting started

### 1. Kalshi API credentials

1. Create a Kalshi account and, under **Settings → API Keys**, generate an API key pair.
   Kalshi gives you a key ID and downloads an RSA private key (PEM).
2. Market and order-book REST reads are public and don't strictly need credentials, but
   the CF Benchmarks BRTI websocket requires a signed handshake even for public index
   data — so credentials are required to run this app for real.
3. Set:
   - `KALSHI_API_KEY_ID` — the key ID from step 1.
   - `KALSHI_PRIVATE_KEY` — the PEM contents. Easiest as one line with literal `\n` for
     newlines (see `.env.example`), or set `KALSHI_PRIVATE_KEY_BASE64` with the whole
     PEM file base64-encoded instead.

> **A note on API schema assumptions:** this build environment could not reach
> `docs.kalshi.com` / `docs.cfbenchmarks.com` to verify exact field names byte-for-byte
> (egress was blocked), so the REST/WebSocket integration (`src/lib/kalshi/`) was built
> from Kalshi's publicly documented conventions (RSA-PSS request signing, the
> `/markets`/`/orderbook` REST shape, the `cfbenchmarks_value` channel) with defensive,
> multi-field-name parsing on the BRTI message (`parseBrtiMessage` in
> `src/lib/kalshi/brti.ts`). If Kalshi's live payload differs from the field names tried
> there, the code logs a one-time console warning with the raw message — adjust the
> candidate field list in that function to match.

### 2. Database

Any Postgres works. Recommended: [Neon](https://neon.tech) (what Vercel Postgres uses
under the hood) or Vercel Postgres directly — both give you a serverless-friendly pooled
connection string.

```bash
# copy the example and fill in DATABASE_URL + Kalshi credentials
cp .env.example .env

# apply the schema
npx prisma migrate dev --name init
```

For a fresh production database, use `npx prisma migrate deploy` instead (see below).

### 3. Install and run locally

```bash
npm install
npm run dev            # dashboard at http://localhost:3000
npm run collector       # in a second terminal — the always-on data collector
```

Leave the collector running. On first run you'll see the **warm-up** banner until enough
BRTI history and completed markets accumulate (roughly `lookbackMarkets × 15` minutes,
10 × 15 = ~2.5 hours with defaults) — this is expected and by design; the app refuses to
trade on an unreliable volatility estimate.

### 4. Tests

```bash
npm test          # vitest — volatility, Monte Carlo, settlement averaging, edge, P&L
npm run typecheck
```

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set environment variables in the Vercel project (Settings → Environment Variables):
   `DATABASE_URL`, `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY` (or
   `KALSHI_PRIVATE_KEY_BASE64`), and optionally `CRON_SECRET`.
3. Run migrations against the production database before or during your first deploy:
   ```bash
   DATABASE_URL="<production url>" npx prisma migrate deploy
   ```
   (Or wire this into a Vercel build step / `postinstall` if you prefer — not done by
   default so a build never accidentally migrates a database you didn't intend.)
4. Deploy — no `vercel.json` is required, so this works on the Hobby plan out of the box.
   (Optional, Pro plan only: add a `vercel.json` with a per-minute cron for
   `/api/cron/tick` as a safety net — see above.)
5. **Run the collector somewhere that stays on**, pointed at the same `DATABASE_URL` —
   this is the piece Vercel itself cannot host. A $5-6/month VPS or a free-tier
   Railway/Fly worker is enough; it only needs Node and outbound network access.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (pooled, for serverless). |
| `KALSHI_API_KEY_ID` | yes | Kalshi API key ID. |
| `KALSHI_PRIVATE_KEY` | yes* | PEM private key, `\n`-escaped on one line. |
| `KALSHI_PRIVATE_KEY_BASE64` | yes* | Alternative to the above — base64 of the PEM file. |
| `KALSHI_API_BASE` | no | Default `https://api.elections.kalshi.com/trade-api/v2`. |
| `KALSHI_WS_URL` | no | Default `wss://api.elections.kalshi.com/trade-api/ws/v2`. |
| `KALSHI_BTC_SERIES_TICKER` | no | Default `KXBTC15M`. |
| `CRON_SECRET` | no | If set, required as a Bearer token on `/api/cron/tick`. |

\* one of `KALSHI_PRIVATE_KEY` / `KALSHI_PRIVATE_KEY_BASE64` is required.

## Project structure

```
src/
  lib/
    quant/       pure, unit-tested math: volatility, Monte Carlo, settlement
                 averaging, edge, paper P&L/calibration — no I/O, no DB
    kalshi/      REST client, RSA-PSS request signing, BRTI websocket client
    engine/      orchestration: market tracking/settlement, volatility window,
                 the 5s tick pipeline, settings
    db/          Prisma client singleton
  app/
    page.tsx           dashboard
    analytics/page.tsx analytics screen
    settings/page.tsx  settings screen
    api/               route handlers (tick, cron/tick, state, analytics, settings)
  components/    UI, split by screen
scripts/collector.ts   standalone always-on data collector (see above)
prisma/schema.prisma   Market, BrtiTick, ModelSnapshot, Trade, Settings
tests/                 vitest — one file per quant module
```

## Settings

Exposed on the Settings screen and persisted to the DB (`Settings` singleton row):

- **Lookback markets** — how many completed 15m markets feed the volatility estimate
  (default 10).
- **Monte Carlo paths** — simulated paths per 5s update (default 10,000).
- **Minimum edge** — required `model − ask` gap to paper-enter (default 2%).
- **Paper stake** — dollars risked per entry (default $10; buys `floor(stake / ask)`
  whole contracts, matching Kalshi's integer-cent, whole-contract pricing).

## Data-quality guarantees

- **Never trades on stale data**: a BRTI observation older than 15s blocks trading (but
  the model snapshot is still recorded, for research completeness).
- **Never trades on future information**: the Monte Carlo model only ever treats
  settlement-window observations as fixed if their timestamp is already in the past
  relative to the tick being processed; everything after "now" is simulated, never read
  from the database.
- **Duplicate-safe**: markets are keyed by ticker (upsert), BRTI ticks are keyed by
  rounded-to-the-second timestamp (upsert), and trades are constrained to one per market
  at the database level — overlapping ticks from the dashboard heartbeat, the collector,
  and cron can never double-book.
- **Market-transition safe**: a market is only settled once Kalshi stops listing it as
  open *and* its close time has actually passed, avoiding a race where a brief API lag
  is mistaken for closure.
