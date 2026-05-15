export type Exchange = 'binance' | 'bybit' | 'yahoo' | 'oanda';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';
export type AssetType = 'crypto' | 'stock' | 'forex';

export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTicker {
  symbol: string;
  exchange: Exchange;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: { line: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  ema20: number;
  ema50: number;
  ema200: number;
  atr: number;
  stochastic: { k: number; d: number };
}

export interface AISignal {
  symbol: string;
  exchange: Exchange;
  signal: SignalType;
  confidence: number;
  probabilities: { DOWN: number; NEUTRAL: number; UP: number };
  explanation: string;
  timestamp: number;
  timeframe: Timeframe;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'TREND' | 'MOMENTUM' | 'MEAN_REVERSION' | 'AI';
  parameters: Record<string, number | string | boolean>;
  enabled: boolean;
}

export interface Position {
  symbol: string;
  exchange: Exchange;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
}

export interface Portfolio {
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  positions: Position[];
}

export interface Orderbook {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
  timestamp: number;
}

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchange: Exchange;
}

export interface AppSettings {
  backendUrl: string;
  binanceApiKey: string;
  binanceSecret: string;
  bybitApiKey: string;
  bybitSecret: string;
  oandaApiKey: string;
  oandaAccountId: string;
  anthropicApiKey: string;
  defaultExchange: Exchange;
  defaultTimeframe: Timeframe;
  theme: 'dark' | 'light';
}
