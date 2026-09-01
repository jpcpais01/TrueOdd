import type { Side } from "./types";

export interface PaperEntry {
  side: Side;
  entryPriceCts: number; // best ask paid, in cents (1-99)
  stake: number; // dollars risked
}

export interface PaperFill {
  contracts: number;
  cost: number; // dollars actually spent (<= stake, due to integer contracts)
}

/**
 * Kalshi contracts are integer-priced in cents and trade in whole-contract
 * lots, so a fixed dollar stake buys floor(stake / price) contracts. The
 * unused remainder simply isn't deployed (paper trading — no partial fills).
 */
export function computeFill({ entryPriceCts, stake }: PaperEntry): PaperFill {
  const priceDollars = entryPriceCts / 100;
  const contracts = Math.floor(stake / priceDollars);
  return { contracts, cost: contracts * priceDollars };
}

/**
 * Settles a paper position. Kalshi contracts pay exactly $1 on a win and $0
 * on a loss; pnl is measured against the dollars actually deployed (cost),
 * not the nominal stake.
 */
export function settleTrade(entry: PaperEntry, settlementSide: Side): number {
  const { contracts, cost } = computeFill(entry);
  if (contracts === 0) return 0;
  return entry.side === settlementSide ? contracts * 1 - cost : -cost;
}

export interface TradeRecord {
  stake: number;
  cost: number;
  pnl: number;
}

export interface PortfolioStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalStaked: number;
  roi: number; // totalPnl / totalStaked
  maxDrawdown: number; // dollars, peak-to-trough on cumulative pnl curve
}

export function computePortfolioStats(trades: TradeRecord[]): PortfolioStats {
  let cumPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let totalStaked = 0;

  for (const t of trades) {
    cumPnl += t.pnl;
    totalStaked += t.cost;
    if (t.pnl > 0) wins++;
    if (cumPnl > peak) peak = cumPnl;
    const drawdown = peak - cumPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const totalTrades = trades.length;
  return {
    totalTrades,
    wins,
    losses: totalTrades - wins,
    winRate: totalTrades > 0 ? wins / totalTrades : 0,
    totalPnl: cumPnl,
    totalStaked,
    roi: totalStaked > 0 ? cumPnl / totalStaked : 0,
    maxDrawdown,
  };
}

/** Brier score: mean squared error between predicted probability and the
 * binary outcome (1 if the predicted side won). Lower is better; 0 is
 * perfect, 0.25 is what an uninformative coin-flip predictor scores. */
export function brierScore(predictions: { prob: number; won: boolean }[]): number {
  if (predictions.length === 0) return NaN;
  const sumSq = predictions.reduce((s, { prob, won }) => {
    const outcome = won ? 1 : 0;
    return s + (prob - outcome) ** 2;
  }, 0);
  return sumSq / predictions.length;
}

export interface CalibrationBucket {
  bucketStart: number;
  bucketEnd: number;
  predictedMean: number;
  observedFrequency: number;
  count: number;
}

/** Buckets predicted probabilities into deciles (or `buckets` bins) and
 * compares mean predicted probability against observed win frequency —
 * the standard reliability-diagram calibration check. */
export function calibrationCurve(
  predictions: { prob: number; won: boolean }[],
  buckets = 10,
): CalibrationBucket[] {
  const bins: { prob: number; won: boolean }[][] = Array.from({ length: buckets }, () => []);
  for (const p of predictions) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(p.prob * buckets)));
    bins[idx]!.push(p);
  }

  return bins.map((bucket, i) => {
    const count = bucket.length;
    const predictedMean = count > 0 ? bucket.reduce((s, b) => s + b.prob, 0) / count : 0;
    const observedFrequency =
      count > 0 ? bucket.filter((b) => b.won).length / count : 0;
    return {
      bucketStart: i / buckets,
      bucketEnd: (i + 1) / buckets,
      predictedMean,
      observedFrequency,
      count,
    };
  });
}
