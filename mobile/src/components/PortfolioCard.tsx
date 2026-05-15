import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Position } from '../types';

interface Props {
  position: Position;
  onRemove?: (symbol: string) => void;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

const PortfolioCard: React.FC<Props> = ({ position, onRemove }) => {
  const isPnlPositive = position.pnl >= 0;
  const pnlColor = isPnlPositive ? colors.buy : colors.sell;
  const pnlPrefix = isPnlPositive ? '+' : '';

  const totalValue = position.currentPrice * position.size;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.symbolContainer}>
          <Text style={styles.symbol}>{position.symbol}</Text>
          <Text style={styles.exchange}>{position.exchange.toUpperCase()}</Text>
        </View>
        {onRemove ? (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemove(position.symbol)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>ENTRY</Text>
          <Text style={styles.priceValue}>${formatPrice(position.entryPrice)}</Text>
        </View>
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>→</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>CURRENT</Text>
          <Text style={styles.priceValue}>${formatPrice(position.currentPrice)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.sizeContainer}>
          <Text style={styles.sizeLabel}>SIZE</Text>
          <Text style={styles.sizeValue}>{position.size}</Text>
          <Text style={styles.totalValue}>${formatPrice(totalValue)}</Text>
        </View>

        <View style={styles.pnlContainer}>
          <Text style={[styles.pnlAmount, { color: pnlColor }]}>
            {pnlPrefix}${Math.abs(position.pnl).toFixed(2)}
          </Text>
          <View style={[styles.pnlBadge, { backgroundColor: pnlColor + '20' }]}>
            <Text style={[styles.pnlPct, { color: pnlColor }]}>
              {pnlPrefix}{position.pnlPct.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  symbolContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symbol: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  exchange: {
    fontSize: typography.xs,
    color: colors.textMuted,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    letterSpacing: 0.5,
  },
  removeButton: {
    padding: spacing.xs,
  },
  removeText: {
    color: colors.textMuted,
    fontSize: typography.md,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: typography.md,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  arrow: {
    paddingHorizontal: spacing.sm,
  },
  arrowText: {
    color: colors.textMuted,
    fontSize: typography.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sizeLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  sizeValue: {
    fontSize: typography.md,
    color: colors.text,
    fontWeight: '600',
    marginRight: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  totalValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pnlContainer: {
    alignItems: 'flex-end',
  },
  pnlAmount: {
    fontSize: typography.lg,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pnlBadge: {
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    marginTop: 2,
  },
  pnlPct: {
    fontSize: typography.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

export default PortfolioCard;
