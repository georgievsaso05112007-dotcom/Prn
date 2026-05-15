import React, { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { store } from './src/store';
import type { AppDispatch } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { loadSettings, checkBackendHealth } from './src/store/settingsSlice';
import { colors } from './src/theme';

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const initialize = async () => {
      // Load persisted settings from AsyncStorage
      await dispatch(loadSettings());
      // Check backend connectivity on startup
      await dispatch(checkBackendHealth(undefined));
    };

    initialize();
  }, [dispatch]);

  return <>{children}</>;
}

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <GestureHandlerRootView style={styles.root}>
          <SafeAreaProvider>
            <AppInitializer>
              <AppNavigator />
            </AppInitializer>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </Provider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
