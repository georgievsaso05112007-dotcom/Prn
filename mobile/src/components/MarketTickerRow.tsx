import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { MarketTicker } from '../types';

interface Props {
  ticker: MarketTicker;
  onPress?: () => void;
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatVolume(volume: number): string {
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
  return volume.toFixed(2);
}

const MarketTickerRow: React.FC<Props> = ({ ticker, onPress }) => {
  const isPositive = ticker.change24h >= 0;
  const changeColor = isPositive ? colors.buy : colors.sell;
  const changePrefix = isPositive ? '+' : '';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        <Text style={styles.symbol}>{ticker.symbol}</Text>
        <Text style={styles.exchange}>{ticker.exchange.toUpperCase()}</Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.price}>${formatPrice(ticker.price)}</Text>
        <Text style={styles.volume}>Vol: {formatVolume(ticker.volume24h)}</Text>
      </View>

      <View style={styles.right}>
        <View style={[styles.changeBadge, { backgroundColor: changeColor + '20' }]}>
          <Text style={[styles.changeText, { color: changeColor }]}>
            {changePrefix}{ticker.change24h.toFixed(2)}%
          </Text>
        </View>
        <Text style={styles.highLow}>
          H: {formatPrice(ticker.high24h)} / L: {formatPrice(ticker.low24h)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
  },
  symbol: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.text,
  },
  exchange: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  center: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: typography.md,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  volume: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  right: {
    flex: 1,
    alignItems: 'flex-end',
  },
  changeBadge: {
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  changeText: {
    fontSize: typography.sm,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  highLow: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
});

export default MarketTickerRow;
