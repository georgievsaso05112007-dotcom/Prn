import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings } from '../types';

const KEYS = {
  SETTINGS: '@tradingai/settings',
  SIGNAL_HISTORY: '@tradingai/signal_history',
  WATCHED_SYMBOLS: '@tradingai/watched_symbols',
} as const;

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

class StorageService {
  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (error) {
      console.error('[Storage] Failed to get settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('[Storage] Failed to save settings:', error);
      throw error;
    }
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await this.saveSettings(updated);
    return updated;
  }

  async getWatchedSymbols(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.WATCHED_SYMBOLS);
      if (!raw) return ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'];
      return JSON.parse(raw) as string[];
    } catch {
      return ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'];
    }
  }

  async saveWatchedSymbols(symbols: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.WATCHED_SYMBOLS, JSON.stringify(symbols));
    } catch (error) {
      console.error('[Storage] Failed to save watched symbols:', error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(KEYS));
    } catch (error) {
      console.error('[Storage] Failed to clear storage:', error);
    }
  }
}

export const storage = new StorageService();
export { DEFAULT_SETTINGS };
export default StorageService;
