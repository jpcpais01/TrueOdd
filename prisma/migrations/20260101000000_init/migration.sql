-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'CLOSED', 'SETTLED');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "TickSource" AS ENUM ('WS', 'BACKFILL');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'VOID');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "seriesTicker" TEXT NOT NULL,
    "eventTicker" TEXT NOT NULL,
    "floorStrike" DOUBLE PRECISION NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "settlementAvg" DOUBLE PRECISION,
    "settlementSide" "Side",
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrtiTick" (
    "id" BIGSERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "TickSource" NOT NULL DEFAULT 'WS',

    CONSTRAINT "BrtiTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "marketId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "brti" DOUBLE PRECISION NOT NULL,
    "strike" DOUBLE PRECISION NOT NULL,
    "timeRemainingMs" INTEGER NOT NULL,
    "yesAsk" INTEGER NOT NULL,
    "noAsk" INTEGER NOT NULL,
    "modelYes" DOUBLE PRECISION NOT NULL,
    "modelNo" DOUBLE PRECISION NOT NULL,
    "edgeYes" DOUBLE PRECISION NOT NULL,
    "edgeNo" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "simPaths" INTEGER NOT NULL,
    "warmup" BOOLEAN NOT NULL DEFAULT false,
    "observedSecs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "entryPriceCts" INTEGER NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "contracts" INTEGER NOT NULL,
    "modelProb" DOUBLE PRECISION NOT NULL,
    "edge" DOUBLE PRECISION NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "settlementSide" "Side",
    "pnl" DOUBLE PRECISION,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lookbackMarkets" INTEGER NOT NULL DEFAULT 10,
    "mcPaths" INTEGER NOT NULL DEFAULT 10000,
    "minEdge" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "paperStake" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Market_status_idx" ON "Market"("status");

-- CreateIndex
CREATE INDEX "Market_closeTime_idx" ON "Market"("closeTime");

-- CreateIndex
CREATE UNIQUE INDEX "BrtiTick_timestamp_key" ON "BrtiTick"("timestamp");

-- CreateIndex
CREATE INDEX "BrtiTick_timestamp_idx" ON "BrtiTick"("timestamp");

-- CreateIndex
CREATE INDEX "ModelSnapshot_marketId_timestamp_idx" ON "ModelSnapshot"("marketId", "timestamp");

-- CreateIndex
CREATE INDEX "ModelSnapshot_timestamp_idx" ON "ModelSnapshot"("timestamp");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_marketId_key" ON "Trade"("marketId");

-- AddForeignKey
ALTER TABLE "ModelSnapshot" ADD CONSTRAINT "ModelSnapshot_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
