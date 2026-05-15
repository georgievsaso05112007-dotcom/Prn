import React from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { colors, typography, spacing } from '../theme';

interface Props {
  size?: 'small' | 'large';
  message?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<Props> = ({
  size = 'large',
  message,
  fullScreen = false,
}) => {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size={size} color={colors.primary} />
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    padding: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.md,
    textAlign: 'center',
  },
});

export default LoadingSpinner;
