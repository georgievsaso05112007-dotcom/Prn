import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiClient } from '../services/api';
import type { Strategy } from '../types';

interface StrategyState {
  strategies: Strategy[];
  loading: boolean;
  error: string | null;
}

const initialState: StrategyState = {
  strategies: [],
  loading: false,
  error: null,
};

export const fetchStrategies = createAsyncThunk(
  'strategy/fetchStrategies',
  async (_, { rejectWithValue }) => {
    try {
      const strategies = await apiClient.getStrategies();
      return strategies;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch strategies');
    }
  },
);

export const createStrategy = createAsyncThunk(
  'strategy/createStrategy',
  async (strategy: Omit<Strategy, 'id'>, { rejectWithValue }) => {
    try {
      const newStrategy = await apiClient.createStrategy(strategy);
      return newStrategy;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create strategy');
    }
  },
);

export const updateStrategy = createAsyncThunk(
  'strategy/updateStrategy',
  async (
    { id, data }: { id: string; data: Partial<Strategy> },
    { rejectWithValue },
  ) => {
    try {
      const updated = await apiClient.updateStrategy(id, data);
      return updated;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to update strategy');
    }
  },
);

export const deleteStrategy = createAsyncThunk(
  'strategy/deleteStrategy',
  async (id: string, { rejectWithValue }) => {
    try {
      await apiClient.deleteStrategy(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to delete strategy');
    }
  },
);

const strategySlice = createSlice({
  name: 'strategy',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchStrategies.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStrategies.fulfilled, (state, action) => {
        state.loading = false;
        state.strategies = action.payload;
      })
      .addCase(fetchStrategies.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createStrategy.fulfilled, (state, action) => {
        state.strategies.push(action.payload);
      })
      .addCase(createStrategy.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(updateStrategy.fulfilled, (state, action) => {
        const idx = state.strategies.findIndex(s => s.id === action.payload.id);
        if (idx >= 0) {
          state.strategies[idx] = action.payload;
        }
      })
      .addCase(updateStrategy.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      .addCase(deleteStrategy.fulfilled, (state, action) => {
        state.strategies = state.strategies.filter(s => s.id !== action.payload);
      })
      .addCase(deleteStrategy.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearError } = strategySlice.actions;
export default strategySlice.reducer;
