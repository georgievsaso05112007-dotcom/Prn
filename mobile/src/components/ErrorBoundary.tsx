import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            {__DEV__ && this.state.errorInfo ? (
              <ScrollView style={styles.stackContainer}>
                <Text style={styles.stack}>
                  {this.state.errorInfo.componentStack}
                </Text>
              </ScrollView>
            ) : null}
            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stackContainer: {
    maxHeight: 200,
    width: '100%',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  stack: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  buttonText: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
