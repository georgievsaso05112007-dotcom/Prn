import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../services/api';
import type { MarketTicker, OHLCVCandle, Exchange, Timeframe } from '../types';

interface MarketState {
  tickers: Record<string, MarketTicker>;
  ohlcv: Record<string, OHLCVCandle[]>;
  selectedSymbol: string;
  selectedExchange: Exchange;
  selectedTimeframe: Timeframe;
  loading: boolean;
  ohlcvLoading: boolean;
  error: string | null;
}

const initialState: MarketState = {
  tickers: {},
  ohlcv: {},
  selectedSymbol: 'BTC/USDT',
  selectedExchange: 'binance',
  selectedTimeframe: '1h',
  loading: false,
  ohlcvLoading: false,
  error: null,
};

export const fetchTicker = createAsyncThunk(
  'market/fetchTicker',
  async (
    { symbol, exchange }: { symbol: string; exchange: Exchange },
    { rejectWithValue },
  ) => {
    try {
      const ticker = await apiClient.getTicker(symbol, exchange);
      return ticker;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch ticker');
    }
  },
);

export const fetchOHLCV = createAsyncThunk(
  'market/fetchOHLCV',
  async (
    {
      symbol,
      exchange,
      timeframe,
      limit = 100,
    }: { symbol: string; exchange: Exchange; timeframe: Timeframe; limit?: number },
    { rejectWithValue },
  ) => {
    try {
      const candles = await apiClient.getOHLCV(symbol, exchange, timeframe, limit);
      return { symbol, timeframe, candles };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch OHLCV');
    }
  },
);

export const fetchMultipleTickers = createAsyncThunk(
  'market/fetchMultipleTickers',
  async (
    { symbols, exchange }: { symbols: string[]; exchange: Exchange },
    { rejectWithValue },
  ) => {
    try {
      const tickers = await apiClient.getMultipleTickers(symbols, exchange);
      return tickers;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch tickers');
    }
  },
);

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setSelectedSymbol(state, action: PayloadAction<string>) {
      state.selectedSymbol = action.payload;
    },
    setSelectedExchange(state, action: PayloadAction<Exchange>) {
      state.selectedExchange = action.payload;
    },
    setSelectedTimeframe(state, action: PayloadAction<Timeframe>) {
      state.selectedTimeframe = action.payload;
    },
    updateTicker(state, action: PayloadAction<MarketTicker>) {
      const { symbol } = action.payload;
      state.tickers[symbol] = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      // fetchTicker
      .addCase(fetchTicker.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTicker.fulfilled, (state, action) => {
        state.loading = false;
        state.tickers[action.payload.symbol] = action.payload;
      })
      .addCase(fetchTicker.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // fetchOHLCV
      .addCase(fetchOHLCV.pending, state => {
        state.ohlcvLoading = true;
      })
      .addCase(fetchOHLCV.fulfilled, (state, action) => {
        state.ohlcvLoading = false;
        const key = `${action.payload.symbol}_${action.payload.timeframe}`;
        state.ohlcv[key] = action.payload.candles;
      })
      .addCase(fetchOHLCV.rejected, (state, action) => {
        state.ohlcvLoading = false;
        state.error = action.payload as string;
      })
      // fetchMultipleTickers
      .addCase(fetchMultipleTickers.pending, state => {
        state.loading = true;
      })
      .addCase(fetchMultipleTickers.fulfilled, (state, action) => {
        state.loading = false;
        action.payload.forEach(ticker => {
          state.tickers[ticker.symbol] = ticker;
        });
      })
      .addCase(fetchMultipleTickers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setSelectedSymbol,
  setSelectedExchange,
  setSelectedTimeframe,
  updateTicker,
  clearError,
} = marketSlice.actions;

export default marketSlice.reducer;
