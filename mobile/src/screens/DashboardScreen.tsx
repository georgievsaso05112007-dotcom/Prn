import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { fetchPortfolio } from '../store/portfolioSlice';
import { checkBackendHealth } from '../store/settingsSlice';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import AISignalCard from '../components/AISignalCard';
import MarketTickerRow from '../components/MarketTickerRow';
import LoadingSpinner from '../components/LoadingSpinner';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { NavigationProp } from '@react-navigation/native';
import { fetchMultipleTickers } from '../store/marketSlice';

interface Props {
  navigation: NavigationProp<any>;
}

const WATCHED_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'];

const DashboardScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useDispatch<AppDispatch>();
  const portfolio = useSelector((state: RootState) => state.portfolio.portfolio);
  const portfolioLoading = useSelector((state: RootState) => state.portfolio.loading);
  const tickers = useSelector((state: RootState) => state.market.tickers);
  const backendConnected = useSelector((state: RootState) => state.settings.backendConnected);
  const settings = useSelector((state: RootState) => state.settings.settings);

  const { signals, signalsLoading, fetchSignals } = useAIAnalysis();
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    await Promise.allSettled([
      dispatch(fetchPortfolio()),
      dispatch(
        fetchMultipleTickers({
          symbols: WATCHED_SYMBOLS,
          exchange: settings.defaultExchange,
        }),
      ),
      fetchSignals(settings.defaultExchange, 5),
      dispatch(checkBackendHealth(undefined)),
    ]);
  }, [dispatch, fetchSignals, settings.defaultExchange]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const sortedTickers = Object.values(tickers).sort(
    (a, b) => Math.abs(b.change24h) - Math.abs(a.change24h),
  );

  const gainers = sortedTickers.filter(t => t.change24h > 0).slice(0, 3);
  const losers = sortedTickers.filter(t => t.change24h < 0).slice(0, 3);

  const totalValue = portfolio?.totalValue ?? 0;
  const totalPnl = portfolio?.totalPnl ?? 0;
  const totalPnlPct = portfolio?.totalPnlPct ?? 0;
  const isPnlPositive = totalPnl >= 0;

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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>TradingAI</Text>
            <Text style={styles.tagline}>Professional Analysis Terminal</Text>
          </View>
          <View style={styles.connectionStatus}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: backendConnected ? colors.buy : colors.sell },
              ]}
            />
            <Text style={styles.statusText}>
              {backendConnected ? 'Connected' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Portfolio Summary */}
        <View style={styles.portfolioCard}>
          <Text style={styles.cardLabel}>PORTFOLIO OVERVIEW</Text>
          {portfolioLoading && !portfolio ? (
            <LoadingSpinner size="small" />
          ) : (
            <>
              <Text style={styles.totalValue}>
                ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </Text>
              <View style={styles.pnlRow}>
                <View
                  style={[
                    styles.pnlBadge,
                    { backgroundColor: (isPnlPositive ? colors.buy : colors.sell) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.pnlText,
                      { color: isPnlPositive ? colors.buy : colors.sell },
                    ]}
                  >
                    {isPnlPositive ? '+' : ''}${totalPnl.toFixed(2)} (
                    {isPnlPositive ? '+' : ''}
                    {totalPnlPct.toFixed(2)}%)
                  </Text>
                </View>
                <Text style={styles.positionsCount}>
                  {portfolio?.positions.length ?? 0} positions
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('AIAnalysis')}
          >
            <Text style={styles.actionIcon}>🤖</Text>
            <Text style={styles.actionLabel}>Analyze</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Market')}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>Market</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Strategy')}
          >
            <Text style={styles.actionIcon}>⚡</Text>
            <Text style={styles.actionLabel}>Strategy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('Portfolio')}
          >
            <Text style={styles.actionIcon}>💼</Text>
            <Text style={styles.actionLabel}>Portfolio</Text>
          </TouchableOpacity>
        </View>

        {/* AI Signals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>LATEST AI SIGNALS</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AIAnalysis')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          {signalsLoading && signals.length === 0 ? (
            <LoadingSpinner size="small" message="Loading signals..." />
          ) : signals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No signals yet</Text>
              <Text style={styles.emptySubtext}>
                Run AI analysis to generate trading signals
              </Text>
            </View>
          ) : (
            signals.slice(0, 5).map((signal, idx) => (
              <AISignalCard key={`${signal.symbol}_${idx}`} signal={signal} compact />
            ))
          )}
        </View>

        {/* Market Movers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MARKET MOVERS</Text>

          {Object.keys(tickers).length === 0 ? (
            <LoadingSpinner size="small" message="Loading market data..." />
          ) : (
            <>
              {gainers.length > 0 ? (
                <>
                  <Text style={styles.moverLabel}>TOP GAINERS</Text>
                  {gainers.map(ticker => (
                    <MarketTickerRow
                      key={ticker.symbol}
                      ticker={ticker}
                      onPress={() => {
                        navigation.navigate('Market');
                      }}
                    />
                  ))}
                </>
              ) : null}

              {losers.length > 0 ? (
                <>
                  <Text style={[styles.moverLabel, { marginTop: spacing.sm }]}>
                    TOP LOSERS
                  </Text>
                  {losers.map(ticker => (
                    <MarketTickerRow
                      key={ticker.symbol}
                      ticker={ticker}
                      onPress={() => navigation.navigate('Market')}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}
        </View>

        {/* Offline notice */}
        {!backendConnected ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>
              Backend offline — configure in Settings
            </Text>
          </View>
        ) : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  logo: {
    fontSize: typography.xxl,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: typography.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  portfolioCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: typography.xxxl,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  pnlBadge: {
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pnlText: {
    fontSize: typography.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positionsCount: {
    fontSize: typography.sm,
    color: colors.textMuted,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  seeAll: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  moverLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: typography.md,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  offlineBanner: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
  },
  offlineText: {
    color: colors.danger,
    fontSize: typography.sm,
    fontWeight: '600',
  },
});

export default DashboardScreen;
