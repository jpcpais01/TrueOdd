-- CreateTable
CREATE TABLE "VolatilityCache" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lookbackMarkets" INTEGER NOT NULL,
    "sigma5s" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "warmup" BOOLEAN NOT NULL,
    "marketsUsed" DOUBLE PRECISION NOT NULL,
    "marketsRequired" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolatilityCache_pkey" PRIMARY KEY ("id")
);

