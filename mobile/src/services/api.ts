import axios, { AxiosInstance } from 'axios';
import type {
  Exchange,
  Timeframe,
  OHLCVCandle,
  MarketTicker,
  TechnicalIndicators,
  AISignal,
  Strategy,
  Position,
  Portfolio,
  Orderbook,
  TradingPair,
} from '../types';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

class APIClient {
  private client: AxiosInstance;

  constructor(baseURL: string = DEFAULT_BACKEND_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
        console.error('[API Error]', error.message);
        return Promise.reject(error);
      },
    );
  }

  setBaseURL(url: string): void {
    this.client.defaults.baseURL = url;
  }

  // Market endpoints
  async getSymbols(exchange: Exchange): Promise<TradingPair[]> {
    const response = await this.client.get<TradingPair[]>('/api/symbols', {
      params: { exchange },
    });
    return response.data;
  }

  async getOHLCV(
    symbol: string,
    exchange: Exchange,
    timeframe: Timeframe,
    limit: number = 100,
  ): Promise<OHLCVCandle[]> {
    const response = await this.client.get<OHLCVCandle[]>('/api/ohlcv', {
      params: { symbol, exchange, timeframe, limit },
    });
    return response.data;
  }

  async getTicker(symbol: string, exchange: Exchange): Promise<MarketTicker> {
    const response = await this.client.get<MarketTicker>('/api/ticker', {
      params: { symbol, exchange },
    });
    return response.data;
  }

  async getOrderbook(symbol: string, exchange: Exchange): Promise<Orderbook> {
    const response = await this.client.get<Orderbook>('/api/orderbook', {
      params: { symbol, exchange },
    });
    return response.data;
  }

  async getMultipleTickers(
    symbols: string[],
    exchange: Exchange,
  ): Promise<MarketTicker[]> {
    const response = await this.client.get<MarketTicker[]>('/api/tickers', {
      params: { symbols: symbols.join(','), exchange },
    });
    return response.data;
  }

  // Analysis endpoints
  async getTechnicalAnalysis(
    symbol: string,
    exchange: Exchange,
    timeframe: Timeframe,
  ): Promise<TechnicalIndicators> {
    const response = await this.client.get<TechnicalIndicators>(
      '/api/analysis/technical',
      {
        params: { symbol, exchange, timeframe },
      },
    );
    return response.data;
  }

  async getAIAnalysis(
    symbol: string,
    exchange: Exchange,
    timeframe: Timeframe,
  ): Promise<AISignal> {
    const response = await this.client.post<AISignal>('/api/analysis/ai', {
      symbol,
      exchange,
      timeframe,
    });
    return response.data;
  }

  async getSignals(exchange: Exchange, limit: number = 10): Promise<AISignal[]> {
    const response = await this.client.get<AISignal[]>('/api/signals', {
      params: { exchange, limit },
    });
    return response.data;
  }

  async trainModel(symbol: string, exchange: Exchange): Promise<{ jobId: string }> {
    const response = await this.client.post<{ jobId: string }>('/api/train', {
      symbol,
      exchange,
    });
    return response.data;
  }

  async getTrainingStatus(
    jobId: string,
  ): Promise<{ status: string; progress: number; modelId?: string }> {
    const response = await this.client.get('/api/train/status', {
      params: { jobId },
    });
    return response.data;
  }

  async getModelCount(): Promise<number> {
    const response = await this.client.get<{ count: number }>('/api/models/count');
    return response.data.count;
  }

  // Strategy endpoints
  async getStrategies(): Promise<Strategy[]> {
    const response = await this.client.get<Strategy[]>('/api/strategies');
    return response.data;
  }

  async createStrategy(strategy: Omit<Strategy, 'id'>): Promise<Strategy> {
    const response = await this.client.post<Strategy>('/api/strategies', strategy);
    return response.data;
  }

  async updateStrategy(id: string, strategy: Partial<Strategy>): Promise<Strategy> {
    const response = await this.client.put<Strategy>(
      `/api/strategies/${id}`,
      strategy,
    );
    return response.data;
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.client.delete(`/api/strategies/${id}`);
  }

  // Portfolio endpoints
  async getPortfolio(): Promise<Portfolio> {
    const response = await this.client.get<Portfolio>('/api/portfolio');
    return response.data;
  }

  async addPosition(
    position: Omit<Position, 'pnl' | 'pnlPct'>,
  ): Promise<Position> {
    const response = await this.client.post<Position>(
      '/api/portfolio/positions',
      position,
    );
    return response.data;
  }

  async removePosition(symbol: string): Promise<void> {
    await this.client.delete(`/api/portfolio/positions/${symbol}`);
  }

  // Health check
  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const apiClient = new APIClient();
export default APIClient;
