import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { storage } from '../services/storage';
import { apiClient } from '../services/api';
import type { AppSettings } from '../types';

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  backendConnected: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  backendUrl: 'http://localhost:8000',
  binanceApiKey: '',
  binanceSecret: '',
  bybitApiKey: '',
  bybitSecret: '',
  oandaApiKey: '',
  oandaAccountId: '',
  anthropicApiKey: '',
  defaultExchange: 'binance',
  defaultTimeframe: '1h',
  theme: 'dark',
};

const initialState: SettingsState = {
  settings: DEFAULT_SETTINGS,
  loading: false,
  error: null,
  backendConnected: false,
};

export const loadSettings = createAsyncThunk(
  'settings/loadSettings',
  async (_, { rejectWithValue }) => {
    try {
      const settings = await storage.getSettings();
      return settings;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to load settings');
    }
  },
);

export const saveSettings = createAsyncThunk(
  'settings/saveSettings',
  async (settings: AppSettings, { rejectWithValue }) => {
    try {
      await storage.saveSettings(settings);
      apiClient.setBaseURL(settings.backendUrl);
      return settings;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to save settings');
    }
  },
);

export const checkBackendHealth = createAsyncThunk(
  'settings/checkBackendHealth',
  async (url: string | undefined, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { settings: SettingsState };
      const targetUrl = url ?? state.settings.settings.backendUrl;
      const healthy = await apiClient.checkHealth();
      return { healthy, url: targetUrl };
    } catch (error: any) {
      return rejectWithValue(false);
    }
  },
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    updateSettingsField<K extends keyof AppSettings>(
      state: SettingsState,
      action: PayloadAction<{ key: K; value: AppSettings[K] }>,
    ) {
      (state.settings as AppSettings)[action.payload.key] = action.payload.value;
    },
    setBackendConnected(state, action: PayloadAction<boolean>) {
      state.backendConnected = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadSettings.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
        apiClient.setBaseURL(action.payload.backendUrl);
      })
      .addCase(loadSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(saveSettings.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
      })
      .addCase(saveSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(checkBackendHealth.fulfilled, (state, action) => {
        state.backendConnected = action.payload.healthy;
      })
      .addCase(checkBackendHealth.rejected, state => {
        state.backendConnected = false;
      });
  },
});

export const { updateSettingsField, setBackendConnected, clearError } =
  settingsSlice.actions;
export default settingsSlice.reducer;
