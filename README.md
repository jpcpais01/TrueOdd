# TrueOdd

A mobile-first paper-trading research dashboard for Kalshi's rolling **BTC 15-minute
Up/Down** markets (`KXBTC15M`). It runs a from-scratch Monte Carlo fair-probability
model against Kalshi's real order book — once a second when the standalone collector is
running, every 5 seconds from the dashboard/serverless path alone — and paper-buys when
the model disagrees with the market by more than a configurable edge threshold.

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
2. **BRTI collection** — the current BRTI value is read via Kalshi's CF Benchmarks REST
   passthrough (`GET /cfbenchmarks/values?id=BRTI`, signed the same way as every other
   Kalshi request) and persisted, deduplicated to one row per second
   (`src/lib/engine/brtiIngest.ts`). This runs on a 1-second poll from the standalone
   collector, and once per tick from the dashboard's heartbeat / cron. Using REST rather
   than a websocket here is deliberate — see "Why there's a separate collector process"
   below.
3. **Volatility** — realized vol is estimated as the standard deviation of
   5-second-equivalent log returns across the previous *N × 15* minutes (default 10, so
   150 minutes) of persisted BRTI tick history (`src/lib/quant/volatility.ts`,
   `src/lib/engine/volatilityWindow.ts`). Below a minimum clean-sample threshold, or with
   less than ~95% of that window actually covered, the app is in **warm-up mode**: it
   displays that plainly and does not paper-trade. On first run, that window is seeded
   instantly from public Binance BTCUSDT history (`src/lib/engine/backfill.ts`) rather
   than waiting hours for live-only Kalshi coverage to build up — see "Volatility
   backfill" below for exactly what that does and doesn't affect.
4. **Monte Carlo** — ~10,000 zero-drift GBM paths are simulated from the current BRTI
   price straight to `close_time - 60s` (a single log-normal jump is exact for a
   driftless GBM, so no need to step every intermediate 5s), then stepped
   second-by-second through the 60-second settlement window. Any window observations
   *already recorded* are treated as fixed and only the remaining unknown seconds are
   simulated — this reproduces Kalshi's actual settlement mechanism (the average of 60
   one-second BRTI observations), not just the final tick (`src/lib/quant/montecarlo.ts`).
   The standalone collector doesn't redraw all 10,000 paths on every tick: it precomputes
   a `SimulationRegime` (the random shocks) once per volatility estimate and cheaply
   re-prices it against the latest price/time-remaining every second — mathematically
   valid because a driftless GBM's future distribution depends only on the current state,
   not simulation history. The regime itself is only regenerated every 5 minutes (or when
   the volatility estimate meaningfully updates); the dashboard/serverless path has
   nowhere to cache a regime between stateless invocations, so it always runs a fresh
   simulation each time it ticks.
5. **Edge & paper trading** — `edgeYes = modelYes - yesBestAsk`, `edgeNo = modelNo -
   noBestAsk`. If either edge clears `MIN_EDGE` (default 2%), the engine paper-buys that
   side at its best ask — at most one entry per market, never on stale BRTI data or an
   incomplete order book (`src/lib/quant/edge.ts`, `src/lib/engine/tick.ts`).
6. **Persistence** — *every* model read is stored (`ModelSnapshot`), not just trades,
   specifically so the raw BRTI/strike/time-remaining/asks/probabilities/edges are
   available for later strategy research, independent of whether that tick triggered a
   trade.

## Volatility backfill (Binance)

Waiting for enough live Kalshi BRTI history to trust a volatility estimate takes real
hours (`lookbackMarkets × 15` minutes — 2.5 hours with the default of 10). Rather than
sit in warm-up that whole time, the engine checks on every tick whether the persisted
BRTI history actually covers the required window; if it doesn't yet, it fetches that much
BTCUSDT 1-second close history from Binance's public API (no credentials, no rate-limit
concerns for personal use) and seeds it into the same table, tagged with a distinct
`BACKFILL` source so it's never confused with a real Kalshi observation
(`src/lib/engine/backfill.ts`). This is a one-time effective no-op once coverage is
sufficient — later ticks just see the window is already covered and skip it.

**What this does and doesn't affect:** Binance is used *only* to seed the historical
window that feeds the realized-volatility number. It never touches anything settlement-
relevant — the live current price, the 60-second settlement-window averaging, and the
actual paper-trade decisions all come exclusively from real Kalshi BRTI, always. BTCUSDT
spot is a reasonable volatility proxy for a synthetic composite index like BRTI, but it
isn't identical to it, so treat the very first few minutes of vol estimate post-backfill
as a starting point that keeps refining itself as real Kalshi data phases in and eventually
dominates the window.

## Why there's a separate collector process

Vercel serverless functions can't hold a persistent connection or run an unattended loop
24/7 — a function only runs for the duration of a request. That's why there are two
different BRTI integrations, used by two different code paths, not one:

- **Serverless (`/api/tick`, the dashboard heartbeat, cron)** reads BRTI over plain
  signed REST (`GET /cfbenchmarks/values?id=BRTI`) — a one-shot request per invocation. A
  websocket was tried here first, but Vercel serverless functions don't reliably support
  outbound websocket upgrades from inside a request (a connection attempt there could sit
  open with no `open`/`error`/`close` event ever firing), so this path stays on REST.
- **The standalone collector** holds a genuine persistent websocket to Kalshi's CF
  Benchmarks BRTI channel (`src/lib/kalshi/brtiStream.ts`) and receives real server push,
  not polling — viable here specifically because this is a normal long-running Node
  process, not a serverless function. If that connection is ever down, each tick
  transparently falls back to the same one-shot REST fetch the serverless path uses, so
  there's no dead air either way.

So there are still three ways data gets collected, and you'll likely want more than one:

- **`npm run collector`** — a standalone Node process (`scripts/collector.ts`) that runs
  a full engine cycle **every second** off the live websocket feed (market sync, Monte
  Carlo, snapshot persistence, paper-trade evaluation), continuously, independent of
  anyone viewing the dashboard. It's cheap enough at 1-second cadence because it
  precomputes a `SimulationRegime` once and re-prices it every tick rather than
  resimulating from scratch (see "How it works" above), refreshing that regime — and only
  then drawing fresh randomness — once every 5 minutes. Run this anywhere that stays on: a
  small VPS, Railway/Fly/Render, a Raspberry Pi, `pm2`/`systemd`/`tmux` on your own
  machine — pointed at the **same** `DATABASE_URL` as your Vercel deployment. This is what
  actually builds and maintains the rolling BRTI history needed to exit warm-up mode, and
  it's the only path that gets you genuine sub-5-second, push-driven freshness — **if you
  want the dashboard to feel truly live, this is the piece to run.**
- **The dashboard itself** also drives the engine: while the main screen (`/`) is open in
  a browser, it POSTs `/api/tick` every 5 seconds as a heartbeat, so opening the app is
  enough to collect data and trade in real time even without the worker running — just at
  5-second cadence with a fresh (not cached) simulation each time, since a stateless
  serverless invocation has nowhere to keep a regime between requests.
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

### Keeping the serverless/dashboard-only path itself fast

Independent of which BRTI source is used, a single tick used to do more sequential,
avoidable work than it needed to. This was tightened directly:

- BRTI ingestion, Kalshi market sync, and the Binance-backfill check are mutually
  independent and now run concurrently (`Promise.all`) instead of one after another.
- Realized volatility is expensive to (re)compute — it scans every persisted BRTI tick in
  the lookback window, thousands of rows once warmed up — so it's now cached in the DB
  (`VolatilityCache`, `src/lib/engine/volatilityWindow.ts`) for 30 seconds instead of
  recomputed on every single tick; volatility doesn't meaningfully change second to
  second anyway.
- Bulk BRTI ingestion (`ingestBrtiTicks`) writes the whole ~60-row window in one
  `INSERT ... ON CONFLICT` statement instead of up to 60 separate round trips.
- Best-ask lookup (`getBestAsksForMarket`) fetches the market object and the order book
  concurrently instead of trying one and falling back to the other in sequence.
- `POST /api/tick` now returns the resulting dashboard state directly in its own
  response, so the client heartbeat is a single round trip per cycle instead of a tick
  call followed by a separate `GET /api/state`.

None of this makes the serverless path a substitute for the collector's genuine
websocket push — it's still bounded by the 5-second poll interval and a real Kalshi
round trip — but it meaningfully cuts how long each of those cycles actually takes.

## Getting started

### 1. Kalshi API credentials

1. Create a Kalshi account, complete identity verification if prompted (some accounts
   need this before the API Keys section appears, even for read-only use), then go to
   **kalshi.com/account/profile → API Keys** and click **Create New API Key**. Kalshi
   shows you a **Key ID** and an **RSA private key** (PEM) exactly once — copy both
   immediately (it also downloads as a `.txt` file) since Kalshi doesn't store or
   re-display the private key.
2. Market and order-book REST reads are public and don't strictly need credentials, but
   the CF Benchmarks BRTI REST passthrough (`/cfbenchmarks/values`) requires a signed
   request even for public index data — so credentials are required to run this app for
   real. That passthrough also requires the requesting account to have the CF Benchmarks
   entitlement enabled; if you get a 403 specifically on that endpoint after everything
   else works, that's likely it — check with Kalshi support/account settings.
3. Set:
   - `KALSHI_API_KEY_ID` — the key ID from step 1.
   - `KALSHI_PRIVATE_KEY` — the PEM contents. Easiest as one line with literal `\n` for
     newlines (see `.env.example`), or set `KALSHI_PRIVATE_KEY_BASE64` with the whole
     PEM file base64-encoded instead.

> **A note on API schema assumptions:** this build environment could not reach
> `docs.kalshi.com` / `docs.cfbenchmarks.com` to verify exact field names byte-for-byte
> (egress was blocked), so the REST integration (`src/lib/kalshi/`) was built from
> Kalshi's publicly documented conventions (RSA-PSS request signing, the
> `/markets`/`/orderbook`/`/cfbenchmarks/values` REST shapes) with defensive,
> multi-field-name parsing on the BRTI response (`parseCfBenchmarksValues` in
> `src/lib/kalshi/brti.ts`). If Kalshi's live payload differs from the field names tried
> there, the "BRTI FEED ERROR" banner on the dashboard shows the actual response it
> received — adjust the candidate field list in that function to match.

### 2. Database

Recommended: [Neon](https://neon.tech), added via Vercel's Storage tab ("Add
Integration" → Neon). ("Vercel Postgres" as a separate product was retired in
December 2024 and folded into this same Neon integration, so this *is* the first-party
path, not a third-party workaround.)

The schema migration is already committed (`prisma/migrations/`), and `npm run build`
applies it automatically (`prisma migrate deploy`) — so once the env vars below point at
an empty Postgres database, everything else — tables, indexes, the singleton settings
row — sets itself up on first build/deploy. There's no manual migration step to run.

Two connection-string env vars are needed, not one — but on Vercel this is genuinely
zero extra work, because the Neon integration creates **both automatically**:

- `DATABASE_URL` — the **pooled** connection, used by the app at runtime
  (serverless-safe: many short-lived connections).
- `DATABASE_URL_UNPOOLED` — the **direct** connection, used only by
  `prisma migrate deploy` during the build. Migrations use a session-level advisory lock
  that a pooled/PgBouncer connection breaks (fails with `P1002: timed out trying to
  acquire a postgres advisory lock`) — this is exactly why a second, direct connection
  is required, and the integration sets it up without you touching anything.

```bash
# copy the example and fill in DATABASE_URL + DATABASE_URL_UNPOOLED + Kalshi credentials
cp .env.example .env
```

### 3. Install and run locally

```bash
npm install
npm run build && npm run dev   # build applies the schema, then starts the dashboard at http://localhost:3000
npm run collector              # in a second terminal — the always-on data collector
```

Leave the collector running. Thanks to the Binance backfill (see above), warm-up mode
should clear within the first couple of ticks rather than taking hours — if it's still
showing warm-up after a minute or two, check the collector's logs for a
`[backfill]` error.

### 4. Tests

```bash
npm test          # vitest — volatility, Monte Carlo, settlement averaging, edge, P&L
npm run typecheck
```

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add a Postgres database via Vercel's Storage tab ("Add Integration" → Neon), with
   Production + Preview checked and no custom env var prefix. This sets **both**
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically — nothing to copy-paste.
3. Set the remaining environment variables (Settings → Environment Variables):
   `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY` (or `KALSHI_PRIVATE_KEY_BASE64`), and
   optionally `CRON_SECRET`.
4. Deploy. The build applies the database schema automatically (see above) — no manual
   migration step, no `vercel.json` required, so this works on the Hobby plan out of the
   box. (Optional, Pro plan only: add a `vercel.json` with a per-minute cron for
   `/api/cron/tick` as a safety net — see above.)
5. **Run the collector somewhere that stays on**, pointed at the same `DATABASE_URL` —
   this is the piece Vercel itself cannot host. A $5-6/month VPS or a free-tier
   Railway/Fly worker is enough; it only needs Node and outbound network access.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string — **pooled**, used at runtime. Auto-set by the Neon integration. |
| `DATABASE_URL_UNPOOLED` | yes | Postgres connection string — **direct**, used only by `prisma migrate deploy` during the build. Auto-set by the Neon integration. |
| `KALSHI_API_KEY_ID` | yes | Kalshi API key ID. |
| `KALSHI_PRIVATE_KEY` | yes* | PEM private key, `\n`-escaped on one line. |
| `KALSHI_PRIVATE_KEY_BASE64` | yes* | Alternative to the above — base64 of the PEM file. |
| `KALSHI_API_BASE` | no | Default `https://api.elections.kalshi.com/trade-api/v2`. |
| `KALSHI_WS_URL` | no | Default `wss://api.elections.kalshi.com/trade-api/ws/v2`. Only used by the collector. |
| `KALSHI_BTC_SERIES_TICKER` | no | Default `KXBTC15M`. |
| `BINANCE_SYMBOL` | no | Default `BTCUSDT`. Volatility backfill only — see above. |
| `CRON_SECRET` | no | If set, required as a Bearer token on `/api/cron/tick`. |

\* one of `KALSHI_PRIVATE_KEY` / `KALSHI_PRIVATE_KEY_BASE64` is required.

## Project structure

```
src/
  lib/
    quant/       pure, unit-tested math: volatility, Monte Carlo, settlement
                 averaging, edge, paper P&L/calibration — no I/O, no DB
    kalshi/      REST client, RSA-PSS request signing, BRTI over REST (brti.ts,
                 serverless) and over websocket (brtiStream.ts, collector-only)
    binance/     public BTCUSDT klines — volatility backfill only, see above
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
