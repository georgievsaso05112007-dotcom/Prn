import { configureStore } from '@reduxjs/toolkit';
import marketReducer from './marketSlice';
import portfolioReducer from './portfolioSlice';
import strategyReducer from './strategySlice';
import settingsReducer from './settingsSlice';

export const store = configureStore({
  reducer: {
    market: marketReducer,
    portfolio: portfolioReducer,
    strategy: strategyReducer,
    settings: settingsReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these for async storage callbacks
        ignoredActions: ['settings/loadSettings/fulfilled'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
