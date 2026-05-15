import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { AISignal, SignalType } from '../types';
import { format } from 'date-fns';

interface Props {
  signal: AISignal;
  compact?: boolean;
}

function getSignalColor(signal: SignalType): string {
  switch (signal) {
    case 'BUY':
      return colors.buy;
    case 'SELL':
      return colors.sell;
    case 'NEUTRAL':
    default:
      return colors.neutral;
  }
}

function getSignalIcon(signal: SignalType): string {
  switch (signal) {
    case 'BUY':
      return '▲';
    case 'SELL':
      return '▼';
    case 'NEUTRAL':
    default:
      return '◆';
  }
}

interface ProbBarProps {
  label: string;
  value: number;
  color: string;
}

const ProbBar: React.FC<ProbBarProps> = ({ label, value, color }) => (
  <View style={probStyles.row}>
    <Text style={probStyles.label}>{label}</Text>
    <View style={probStyles.barBg}>
      <View style={[probStyles.barFill, { width: `${value * 100}%`, backgroundColor: color }]} />
    </View>
    <Text style={[probStyles.pct, { color }]}>{(value * 100).toFixed(1)}%</Text>
  </View>
);

const probStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    width: 60,
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    marginHorizontal: spacing.sm,
  },
  barFill: {
    height: 6,
    borderRadius: borderRadius.full,
  },
  pct: {
    width: 42,
    fontSize: typography.xs,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

const AISignalCard: React.FC<Props> = ({ signal, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const signalColor = getSignalColor(signal.signal);
  const icon = getSignalIcon(signal.signal);
  const formattedTime = format(new Date(signal.timestamp), 'MMM dd HH:mm');

  if (compact) {
    return (
      <View style={[compactStyles.container, { borderLeftColor: signalColor }]}>
        <View style={compactStyles.left}>
          <Text style={compactStyles.symbol}>{signal.symbol}</Text>
          <Text style={compactStyles.timeframe}>{signal.timeframe} · {formattedTime}</Text>
        </View>
        <View style={[compactStyles.badge, { backgroundColor: signalColor + '20' }]}>
          <Text style={[compactStyles.badgeText, { color: signalColor }]}>
            {icon} {signal.signal}
          </Text>
        </View>
        <Text style={[compactStyles.confidence, { color: signalColor }]}>
          {signal.confidence.toFixed(0)}%
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: signalColor + '40' }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.symbolInfo}>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <Text style={styles.meta}>
            {signal.exchange.toUpperCase()} · {signal.timeframe}
          </Text>
        </View>

        <View style={[styles.signalBadge, { backgroundColor: signalColor + '20', borderColor: signalColor }]}>
          <Text style={[styles.signalText, { color: signalColor }]}>
            {icon} {signal.signal}
          </Text>
        </View>
      </View>

      {/* Confidence */}
      <View style={styles.confidenceRow}>
        <Text style={styles.confidenceLabel}>CONFIDENCE</Text>
        <View style={styles.confidenceBarBg}>
          <View
            style={[
              styles.confidenceBarFill,
              {
                width: `${signal.confidence}%`,
                backgroundColor: signalColor,
              },
            ]}
          />
        </View>
        <Text style={[styles.confidenceValue, { color: signalColor }]}>
          {signal.confidence.toFixed(1)}%
        </Text>
      </View>

      {/* Probabilities */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PROBABILITY BREAKDOWN</Text>
        <ProbBar label="UP" value={signal.probabilities.UP} color={colors.buy} />
        <ProbBar label="NEUTRAL" value={signal.probabilities.NEUTRAL} color={colors.neutral} />
        <ProbBar label="DOWN" value={signal.probabilities.DOWN} color={colors.sell} />
      </View>

      {/* Explanation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI ANALYSIS</Text>
        <Text
          style={styles.explanation}
          numberOfLines={expanded ? undefined : 3}
        >
          {signal.explanation}
        </Text>
        {signal.explanation.length > 120 ? (
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.expandText}>
              {expanded ? 'Show less' : 'Show more'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Footer */}
      <Text style={styles.timestamp}>{formattedTime}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  symbolInfo: {
    flex: 1,
  },
  symbol: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signalBadge: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  signalText: {
    fontSize: typography.lg,
    fontWeight: '800',
    letterSpacing: 1,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  confidenceLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    width: 90,
  },
  confidenceBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    marginHorizontal: spacing.sm,
  },
  confidenceBarFill: {
    height: 8,
    borderRadius: borderRadius.full,
  },
  confidenceValue: {
    fontSize: typography.md,
    fontWeight: '700',
    width: 48,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  explanation: {
    fontSize: typography.md,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  expandText: {
    fontSize: typography.sm,
    color: colors.primary,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});

const compactStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
  },
  left: {
    flex: 1,
  },
  symbol: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.text,
  },
  timeframe: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  badge: {
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  badgeText: {
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  confidence: {
    fontSize: typography.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default AISignalCard;
