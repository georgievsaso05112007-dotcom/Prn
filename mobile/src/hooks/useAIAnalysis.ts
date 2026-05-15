import { useState, useCallback } from 'react';
import { apiClient } from '../services/api';
import type { AISignal, Exchange, Timeframe } from '../types';

interface AIAnalysisState {
  signal: AISignal | null;
  signals: AISignal[];
  modelCount: number;
  loading: boolean;
  signalsLoading: boolean;
  trainingStatus: {
    jobId: string | null;
    status: string;
    progress: number;
  };
  error: string | null;
}

export function useAIAnalysis() {
  const [state, setState] = useState<AIAnalysisState>({
    signal: null,
    signals: [],
    modelCount: 0,
    loading: false,
    signalsLoading: false,
    trainingStatus: {
      jobId: null,
      status: '',
      progress: 0,
    },
    error: null,
  });

  const runAnalysis = useCallback(
    async (symbol: string, exchange: Exchange, timeframe: Timeframe) => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const signal = await apiClient.getAIAnalysis(symbol, exchange, timeframe);
        setState(prev => ({ ...prev, loading: false, signal }));
        return signal;
      } catch (error: any) {
        const message = error.message || 'AI analysis failed';
        setState(prev => ({ ...prev, loading: false, error: message }));
        return null;
      }
    },
    [],
  );

  const fetchSignals = useCallback(
    async (exchange: Exchange, limit: number = 10) => {
      setState(prev => ({ ...prev, signalsLoading: true }));
      try {
        const signals = await apiClient.getSignals(exchange, limit);
        setState(prev => ({ ...prev, signalsLoading: false, signals }));
        return signals;
      } catch (error: any) {
        setState(prev => ({
          ...prev,
          signalsLoading: false,
          error: error.message || 'Failed to fetch signals',
        }));
        return [];
      }
    },
    [],
  );

  const fetchModelCount = useCallback(async () => {
    try {
      const count = await apiClient.getModelCount();
      setState(prev => ({ ...prev, modelCount: count }));
      return count;
    } catch {
      return 0;
    }
  }, []);

  const startTraining = useCallback(
    async (symbol: string, exchange: Exchange) => {
      setState(prev => ({
        ...prev,
        trainingStatus: { jobId: null, status: 'starting', progress: 0 },
      }));
      try {
        const { jobId } = await apiClient.trainModel(symbol, exchange);
        setState(prev => ({
          ...prev,
          trainingStatus: { jobId, status: 'training', progress: 0 },
        }));

        // Poll for training status
        const pollInterval = setInterval(async () => {
          try {
            const status = await apiClient.getTrainingStatus(jobId);
            setState(prev => ({
              ...prev,
              trainingStatus: {
                jobId,
                status: status.status,
                progress: status.progress,
              },
            }));

            if (status.status === 'completed' || status.status === 'failed') {
              clearInterval(pollInterval);
              if (status.status === 'completed') {
                await fetchModelCount();
              }
            }
          } catch {
            clearInterval(pollInterval);
            setState(prev => ({
              ...prev,
              trainingStatus: {
                ...prev.trainingStatus,
                status: 'error',
              },
            }));
          }
        }, 3000);

        return jobId;
      } catch (error: any) {
        setState(prev => ({
          ...prev,
          trainingStatus: { jobId: null, status: 'failed', progress: 0 },
          error: error.message || 'Training failed to start',
        }));
        return null;
      }
    },
    [fetchModelCount],
  );

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    runAnalysis,
    fetchSignals,
    fetchModelCount,
    startTraining,
    clearError,
  };
}
