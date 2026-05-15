import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../services/api';
import type { Portfolio, Position, Exchange } from '../types';

interface PortfolioState {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
}

const initialState: PortfolioState = {
  portfolio: null,
  loading: false,
  error: null,
};

export const fetchPortfolio = createAsyncThunk(
  'portfolio/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      const portfolio = await apiClient.getPortfolio();
      return portfolio;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch portfolio');
    }
  },
);

export const addPosition = createAsyncThunk(
  'portfolio/addPosition',
  async (
    position: Omit<Position, 'pnl' | 'pnlPct'>,
    { rejectWithValue },
  ) => {
    try {
      const newPosition = await apiClient.addPosition(position);
      return newPosition;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to add position');
    }
  },
);

export const removePosition = createAsyncThunk(
  'portfolio/removePosition',
  async (symbol: string, { rejectWithValue }) => {
    try {
      await apiClient.removePosition(symbol);
      return symbol;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to remove position');
    }
  },
);

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setLocalPosition(state, action: PayloadAction<Position>) {
      if (!state.portfolio) {
        state.portfolio = {
          totalValue: 0,
          totalPnl: 0,
          totalPnlPct: 0,
          positions: [],
        };
      }
      const idx = state.portfolio.positions.findIndex(
        p => p.symbol === action.payload.symbol,
      );
      if (idx >= 0) {
        state.portfolio.positions[idx] = action.payload;
      } else {
        state.portfolio.positions.push(action.payload);
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchPortfolio.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.loading = false;
        state.portfolio = action.payload;
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        // Keep existing portfolio data if fetch fails
      })
      .addCase(addPosition.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addPosition.fulfilled, (state, action) => {
        state.loading = false;
        if (!state.portfolio) {
          state.portfolio = {
            totalValue: 0,
            totalPnl: 0,
            totalPnlPct: 0,
            positions: [],
          };
        }
        const idx = state.portfolio.positions.findIndex(
          p => p.symbol === action.payload.symbol,
        );
        if (idx >= 0) {
          state.portfolio.positions[idx] = action.payload;
        } else {
          state.portfolio.positions.push(action.payload);
        }
      })
      .addCase(addPosition.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(removePosition.fulfilled, (state, action) => {
        if (state.portfolio) {
          state.portfolio.positions = state.portfolio.positions.filter(
            p => p.symbol !== action.payload,
          );
        }
      })
      .addCase(removePosition.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setLocalPosition } = portfolioSlice.actions;
export default portfolioSlice.reducer;
