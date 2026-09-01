export type Side = "YES" | "NO";
export type TradeStatus = "OPEN" | "WON" | "LOST" | "VOID";

export interface MarketSnapshotDTO {
  timestamp: string;
  brti: number;
  yesAsk: number;
  noAsk: number;
  modelYes: number;
  modelNo: number;
  edgeYes: number;
  edgeNo: number;
  observedSecs: number;
}

export interface PositionDTO {
  side: Side;
  entryPriceCts: number;
  stake: number;
  contracts: number;
  status: TradeStatus;
  pnl: number | null;
  entryTime: string;
}

export interface MarketStateDTO {
  ticker: string;
  floorStrike: number;
  openTime: string;
  closeTime: string;
  timeRemainingMs: number;
  snapshot: MarketSnapshotDTO | null;
  position: PositionDTO | null;
}

export interface SettledMarketDTO {
  ticker: string;
  floorStrike: number;
  settlementAvg: number | null;
  settlementSide: Side | null;
  closeTime: string;
}

export interface StrategySettingsDTO {
  lookbackMarkets: number;
  mcPaths: number;
  minEdge: number;
  paperStake: number;
}

export interface AppStateDTO {
  now: string;
  settings: StrategySettingsDTO;
  warmup: boolean;
  volatility: {
    sigma5s: number;
    sampleSize: number;
    marketsUsed: number;
    marketsRequired: number;
  };
  brti: { value: number; timestamp: string } | null;
  markets: MarketStateDTO[];
  recentSettled: SettledMarketDTO[];
}

export interface TradeDTO {
  id: string;
  ticker: string;
  side: Side;
  entryPriceCts: number;
  stake: number;
  contracts: number;
  modelProb: number;
  edge: number;
  entryTime: string;
  status: TradeStatus;
  settlementSide: Side | null;
  pnl: number | null;
  settledAt: string | null;
  floorStrike: number;
  closeTime: string;
}

export interface PortfolioStatsDTO {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalStaked: number;
  roi: number;
  maxDrawdown: number;
}

export interface CalibrationBucketDTO {
  bucketStart: number;
  bucketEnd: number;
  predictedMean: number;
  observedFrequency: number;
  count: number;
}

export interface AnalyticsDTO {
  stats: PortfolioStatsDTO;
  brier: number | null;
  calibrationSampleSize: number;
  calibration: CalibrationBucketDTO[];
  trades: TradeDTO[];
}
