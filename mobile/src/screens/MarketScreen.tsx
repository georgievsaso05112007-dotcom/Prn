import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { useMarketData } from '../hooks/useMarketData';
import { apiClient } from '../services/api';
import CandlestickChart from '../components/CandlestickChart';
import TechnicalIndicatorCard from '../components/TechnicalIndicatorCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Exchange, Timeframe, TechnicalIndicators } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const EXCHANGES: Exchange[] = ['binance', 'bybit', 'yahoo', 'oanda'];
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

function getRsiStatus(rsi: number): 'overbought' | 'oversold' | 'neutral' {
  if (rsi >= 70) return 'overbought';
  if (rsi <= 30) return 'oversold';
  return 'neutral';
}

function getMacdStatus(
  macd: TechnicalIndicators['macd'],
): 'bullish' | 'bearish' | 'neutral' {
  if (macd.histogram > 0 && macd.line > macd.signal) return 'bullish';
  if (macd.histogram < 0 && macd.line < macd.signal) return 'bearish';
  return 'neutral';
}

const MarketScreen: React.FC = () => {
  const {
    currentCandles,
    currentTicker,
    selectedSymbol,
    selectedExchange,
    selectedTimeframe,
    ohlcvLoading,
    refresh,
    selectSymbol,
    selectExchange,
    selectTimeframe,
  } = useMarketData();

  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [indicators, setIndicators] = useState<TechnicalIndicators | null>(null);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);
  const [indicatorsError, setIndicatorsError] = useState<string | null>(null);

  const loadIndicators = useCallback(async () => {
    setIndicatorsLoading(true);
    setIndicatorsError(null);
    try {
      const data = await apiClient.getTechnicalAnalysis(
        selectedSymbol,
        selectedExchange,
        selectedTimeframe,
      );
      setIndicators(data);
    } catch (err: any) {
      setIndicatorsError(err.message || 'Failed to load indicators');
    } finally {
      setIndicatorsLoading(false);
    }
  }, [selectedSymbol, selectedExchange, selectedTimeframe]);

  useEffect(() => {
    loadIndicators();
  }, [loadIndicators]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([refresh(), loadIndicators()]);
    setRefreshing(false);
  }, [refresh, loadIndicators]);

  const handleSearch = useCallback(() => {
    const sym = searchText.trim().toUpperCase();
    if (sym) {
      selectSymbol(sym);
      setSearchText('');
    }
  }, [searchText, selectSymbol]);

  const chartWidth = SCREEN_WIDTH - spacing.md * 2;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search symbol (e.g. ETH/USDT)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
            <Text style={styles.searchBtnText}>Go</Text>
          </TouchableOpacity>
        </View>

        {/* Exchange Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
        >
          {EXCHANGES.map(ex => (
            <TouchableOpacity
              key={ex}
              style={[
                styles.chip,
                selectedExchange === ex && styles.chipActive,
              ]}
              onPress={() => selectExchange(ex)}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedExchange === ex && styles.chipTextActive,
                ]}
              >
                {ex.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Timeframe Selector */}
        <View style={styles.timeframeRow}>
          {TIMEFRAMES.map(tf => (
            <TouchableOpacity
              key={tf}
              style={[
                styles.timeframeBtn,
                selectedTimeframe === tf && styles.timeframeBtnActive,
              ]}
              onPress={() => selectTimeframe(tf)}
            >
              <Text
                style={[
                  styles.timeframeBtnText,
                  selectedTimeframe === tf && styles.timeframeBtnTextActive,
                ]}
              >
                {tf}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ticker Info */}
        {currentTicker ? (
          <View style={styles.tickerInfo}>
            <View>
              <Text style={styles.symbol}>{currentTicker.symbol}</Text>
              <Text style={styles.exchange}>{currentTicker.exchange.toUpperCase()}</Text>
            </View>
            <View style={styles.tickerRight}>
              <Text style={styles.price}>
                ${currentTicker.price >= 1
                  ? currentTicker.price.toFixed(2)
                  : currentTicker.price.toFixed(6)}
              </Text>
              <Text
                style={[
                  styles.change,
                  {
                    color:
                      currentTicker.change24h >= 0 ? colors.buy : colors.sell,
                  },
                ]}
              >
                {currentTicker.change24h >= 0 ? '+' : ''}
                {currentTicker.change24h.toFixed(2)}%
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.tickerPlaceholder}>
            <Text style={styles.selectedSymbolText}>{selectedSymbol}</Text>
            <Text style={styles.exchangeText}>{selectedExchange.toUpperCase()}</Text>
          </View>
        )}

        {/* Chart */}
        <View style={styles.chartContainer}>
          {ohlcvLoading && currentCandles.length === 0 ? (
            <LoadingSpinner
              size="large"
              message="Loading chart..."
            />
          ) : (
            <CandlestickChart
              candles={currentCandles}
              width={chartWidth}
              height={300}
              showVolume
            />
          )}
        </View>

        {/* Technical Indicators */}
        <View style={styles.indicatorsSection}>
          <Text style={styles.sectionTitle}>TECHNICAL INDICATORS</Text>

          {indicatorsLoading ? (
            <LoadingSpinner size="small" message="Calculating indicators..." />
          ) : indicatorsError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{indicatorsError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadIndicators}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : indicators ? (
            <>
              {/* RSI */}
              <TechnicalIndicatorCard
                name="RSI (14)"
                value={indicators.rsi}
                status={getRsiStatus(indicators.rsi)}
                subValue={`Overbought >70 | Oversold <30`}
              />

              {/* MACD */}
              <TechnicalIndicatorCard
                name="MACD"
                value={`Line: ${indicators.macd.line.toFixed(4)}`}
                status={getMacdStatus(indicators.macd)}
                subValue={`Signal: ${indicators.macd.signal.toFixed(4)} | Hist: ${indicators.macd.histogram.toFixed(4)}`}
              />

              {/* Bollinger Bands */}
              <TechnicalIndicatorCard
                name="Bollinger Bands"
                value={`Mid: ${indicators.bollingerBands.middle.toFixed(2)}`}
                subValue={`Upper: ${indicators.bollingerBands.upper.toFixed(2)} | Lower: ${indicators.bollingerBands.lower.toFixed(2)}`}
              />

              {/* EMAs */}
              <View style={styles.emaRow}>
                <TechnicalIndicatorCard
                  name="EMA 20"
                  value={indicators.ema20.toFixed(2)}
                  compact
                />
                <TechnicalIndicatorCard
                  name="EMA 50"
                  value={indicators.ema50.toFixed(2)}
                  compact
                />
                <TechnicalIndicatorCard
                  name="EMA 200"
                  value={indicators.ema200.toFixed(2)}
                  compact
                />
              </View>

              {/* ATR and Stochastic */}
              <View style={styles.emaRow}>
                <TechnicalIndicatorCard
                  name="ATR"
                  value={indicators.atr.toFixed(4)}
                  compact
                />
                <TechnicalIndicatorCard
                  name="STOCH K"
                  value={indicators.stochastic.k.toFixed(2)}
                  compact
                />
                <TechnicalIndicatorCard
                  name="STOCH D"
                  value={indicators.stochastic.d.toFixed(2)}
                  compact
                />
              </View>
            </>
          ) : (
            <View style={styles.emptyIndicators}>
              <Text style={styles.emptyText}>
                No indicator data — backend may be offline
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  searchRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: typography.md,
  },
  chipsContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: colors.text,
  },
  timeframeRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeframeBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  timeframeBtnActive: {
    backgroundColor: colors.primary,
  },
  timeframeBtnText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  timeframeBtnTextActive: {
    color: colors.text,
  },
  tickerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tickerPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedSymbolText: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
  },
  exchangeText: {
    fontSize: typography.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  symbol: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
  },
  exchange: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  tickerRight: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize: typography.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  chartContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 200,
    justifyContent: 'center',
  },
  indicatorsSection: {
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  emaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  errorContainer: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    color: colors.text,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  emptyIndicators: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.sm,
    textAlign: 'center',
  },
});

export default MarketScreen;
