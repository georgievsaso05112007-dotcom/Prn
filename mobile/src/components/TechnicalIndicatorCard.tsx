import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';

type IndicatorStatus = 'overbought' | 'oversold' | 'bullish' | 'bearish' | 'neutral';

interface Props {
  name: string;
  value: string | number;
  status?: IndicatorStatus;
  subValue?: string;
  compact?: boolean;
}

function getStatusColor(status?: IndicatorStatus): string {
  switch (status) {
    case 'overbought':
    case 'bearish':
      return colors.sell;
    case 'oversold':
    case 'bullish':
      return colors.buy;
    case 'neutral':
    default:
      return colors.neutral;
  }
}

function getStatusLabel(status?: IndicatorStatus): string {
  switch (status) {
    case 'overbought':
      return 'Overbought';
    case 'oversold':
      return 'Oversold';
    case 'bullish':
      return 'Bullish';
    case 'bearish':
      return 'Bearish';
    case 'neutral':
    default:
      return 'Neutral';
  }
}

const TechnicalIndicatorCard: React.FC<Props> = ({
  name,
  value,
  status,
  subValue,
  compact = false,
}) => {
  const statusColor = getStatusColor(status);
  const statusLabel = getStatusLabel(status);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Text style={styles.compactName}>{name}</Text>
        <Text style={[styles.compactValue, { color: statusColor }]}>
          {typeof value === 'number' ? value.toFixed(2) : value}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        {status ? (
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.value, { color: statusColor }]}>
        {typeof value === 'number' ? value.toFixed(4) : value}
      </Text>

      {subValue ? (
        <Text style={styles.subValue}>{subValue}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: borderRadius.full,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  statusText: {
    fontSize: typography.xs,
    fontWeight: '700',
  },
  value: {
    fontSize: typography.xl,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  subValue: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Compact styles
  compactContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 70,
  },
  compactName: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  compactValue: {
    fontSize: typography.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default TechnicalIndicatorCard;
