import { useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import {
  fetchTicker,
  fetchOHLCV,
  fetchMultipleTickers,
  updateTicker,
  setSelectedSymbol,
  setSelectedExchange,
  setSelectedTimeframe,
} from '../store/marketSlice';
import { wsService } from '../services/websocket';
import type { Exchange, Timeframe } from '../types';

export function useMarketData(autoRefreshMs?: number) {
  const dispatch = useDispatch<AppDispatch>();
  const { tickers, ohlcv, selectedSymbol, selectedExchange, selectedTimeframe, loading, ohlcvLoading, error } =
    useSelector((state: RootState) => state.market);
  const settings = useSelector((state: RootState) => state.settings.settings);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentOhlcvKey = `${selectedSymbol}_${selectedTimeframe}`;
  const currentCandles = ohlcv[currentOhlcvKey] ?? [];
  const currentTicker = tickers[selectedSymbol] ?? null;

  const refresh = useCallback(() => {
    dispatch(fetchTicker({ symbol: selectedSymbol, exchange: selectedExchange }));
    dispatch(
      fetchOHLCV({
        symbol: selectedSymbol,
        exchange: selectedExchange,
        timeframe: selectedTimeframe,
      }),
    );
  }, [dispatch, selectedSymbol, selectedExchange, selectedTimeframe]);

  const selectSymbol = useCallback(
    (symbol: string) => {
      dispatch(setSelectedSymbol(symbol));
    },
    [dispatch],
  );

  const selectExchange = useCallback(
    (exchange: Exchange) => {
      dispatch(setSelectedExchange(exchange));
    },
    [dispatch],
  );

  const selectTimeframe = useCallback(
    (timeframe: Timeframe) => {
      dispatch(setSelectedTimeframe(timeframe));
    },
    [dispatch],
  );

  const refreshMultiple = useCallback(
    (symbols: string[], exchange: Exchange) => {
      dispatch(fetchMultipleTickers({ symbols, exchange }));
    },
    [dispatch],
  );

  // Auto-refresh on mount and when selection changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Interval refresh
  useEffect(() => {
    if (!autoRefreshMs) return;

    intervalRef.current = setInterval(() => {
      refresh();
    }, autoRefreshMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh, autoRefreshMs]);

  // WebSocket subscription for real-time ticker updates
  useEffect(() => {
    const wsUrl = settings.backendUrl.replace(/^http/, 'ws') + '/ws/market';

    const unsubscribe = wsService.subscribe(selectedSymbol, ticker => {
      dispatch(updateTicker(ticker));
    });

    if (!wsService.isConnected) {
      wsService.connect(wsUrl);
    }

    return () => {
      unsubscribe();
    };
  }, [selectedSymbol, settings.backendUrl, dispatch]);

  return {
    tickers,
    currentTicker,
    currentCandles,
    selectedSymbol,
    selectedExchange,
    selectedTimeframe,
    loading,
    ohlcvLoading,
    error,
    refresh,
    selectSymbol,
    selectExchange,
    selectTimeframe,
    refreshMultiple,
  };
}
