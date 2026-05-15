import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  RefreshControl,
  StyleSheet,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import {
  fetchPortfolio,
  addPosition,
  removePosition,
} from '../store/portfolioSlice';
import PortfolioCard from '../components/PortfolioCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Exchange } from '../types';

const EXCHANGES: Exchange[] = ['binance', 'bybit', 'yahoo', 'oanda'];

interface AddPositionForm {
  symbol: string;
  exchange: Exchange;
  size: string;
  entryPrice: string;
  currentPrice: string;
}

const DEFAULT_FORM: AddPositionForm = {
  symbol: '',
  exchange: 'binance',
  size: '',
  entryPrice: '',
  currentPrice: '',
};

const PortfolioScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { portfolio, loading, error } = useSelector(
    (state: RootState) => state.portfolio,
  );

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<AddPositionForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchPortfolio());
  }, [dispatch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchPortfolio());
    setRefreshing(false);
  }, [dispatch]);

  const handleRemove = useCallback(
    (symbol: string) => {
      Alert.alert(
        'Remove Position',
        `Remove ${symbol} from your portfolio?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => dispatch(removePosition(symbol)),
          },
        ],
      );
    },
    [dispatch],
  );

  const validateForm = useCallback((): boolean => {
    if (!form.symbol.trim()) {
      setFormError('Symbol is required');
      return false;
    }
    const size = parseFloat(form.size);
    if (isNaN(size) || size <= 0) {
      setFormError('Size must be a positive number');
      return false;
    }
    const entry = parseFloat(form.entryPrice);
    if (isNaN(entry) || entry <= 0) {
      setFormError('Entry price must be a positive number');
      return false;
    }
    const current = parseFloat(form.currentPrice);
    if (isNaN(current) || current <= 0) {
      setFormError('Current price must be a positive number');
      return false;
    }
    return true;
  }, [form]);

  const handleAddPosition = useCallback(async () => {
    setFormError(null);
    if (!validateForm()) return;

    const entryPrice = parseFloat(form.entryPrice);
    const currentPrice = parseFloat(form.currentPrice);
    const size = parseFloat(form.size);
    const pnl = (currentPrice - entryPrice) * size;
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;

    await dispatch(
      addPosition({
        symbol: form.symbol.trim().toUpperCase(),
        exchange: form.exchange,
        size,
        entryPrice,
        currentPrice,
        pnl,
        pnlPct,
      }),
    );

    setModalVisible(false);
    setForm(DEFAULT_FORM);
    dispatch(fetchPortfolio());
  }, [form, validateForm, dispatch]);

  const positions = portfolio?.positions ?? [];
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
        <View style={styles.header}>
          <Text style={styles.title}>Portfolio</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
            <Text style={styles.refreshText}>↻</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TOTAL VALUE</Text>
          <Text style={styles.totalValue}>
            ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </Text>

          <View style={styles.pnlRow}>
            <View
              style={[
                styles.pnlBadge,
                {
                  backgroundColor:
                    (isPnlPositive ? colors.buy : colors.sell) + '20',
                },
              ]}
            >
              <Text
                style={[
                  styles.pnlText,
                  { color: isPnlPositive ? colors.buy : colors.sell },
                ]}
              >
                {isPnlPositive ? '+' : ''}${totalPnl.toFixed(2)}
              </Text>
            </View>
            <Text
              style={[
                styles.pnlPct,
                { color: isPnlPositive ? colors.buy : colors.sell },
              ]}
            >
              {isPnlPositive ? '+' : ''}
              {totalPnlPct.toFixed(2)}%
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Positions</Text>
              <Text style={styles.statValue}>{positions.length}</Text>
            </View>
            <View style={[styles.stat, styles.statBorder]}>
              <Text style={styles.statLabel}>Winners</Text>
              <Text style={[styles.statValue, { color: colors.buy }]}>
                {positions.filter(p => p.pnl >= 0).length}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Losers</Text>
              <Text style={[styles.statValue, { color: colors.sell }]}>
                {positions.filter(p => p.pnl < 0).length}
              </Text>
            </View>
          </View>
        </View>

        {/* Positions */}
        <Text style={styles.sectionTitle}>OPEN POSITIONS</Text>

        {loading && positions.length === 0 ? (
          <LoadingSpinner size="large" message="Loading portfolio..." />
        ) : positions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💼</Text>
            <Text style={styles.emptyTitle}>No Open Positions</Text>
            <Text style={styles.emptySubtext}>
              Add your first position to start tracking P&L
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.emptyAddText}>Add Position</Text>
            </TouchableOpacity>
          </View>
        ) : (
          positions.map((position, idx) => (
            <PortfolioCard
              key={`${position.symbol}_${idx}`}
              position={position}
              onRemove={handleRemove}
            />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Add Position Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Add Position</Text>

              <Text style={styles.fieldLabel}>SYMBOL</Text>
              <TextInput
                style={styles.input}
                value={form.symbol}
                onChangeText={v => setForm(prev => ({ ...prev, symbol: v }))}
                placeholder="e.g. BTC/USDT"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />

              <Text style={styles.fieldLabel}>EXCHANGE</Text>
              <View style={styles.exchangeRow}>
                {EXCHANGES.map(ex => (
                  <TouchableOpacity
                    key={ex}
                    style={[
                      styles.exChip,
                      form.exchange === ex && styles.exChipActive,
                    ]}
                    onPress={() => setForm(prev => ({ ...prev, exchange: ex }))}
                  >
                    <Text
                      style={[
                        styles.exChipText,
                        form.exchange === ex && styles.exChipTextActive,
                      ]}
                    >
                      {ex.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>SIZE</Text>
              <TextInput
                style={styles.input}
                value={form.size}
                onChangeText={v => setForm(prev => ({ ...prev, size: v }))}
                placeholder="e.g. 0.5"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>ENTRY PRICE</Text>
              <TextInput
                style={styles.input}
                value={form.entryPrice}
                onChangeText={v => setForm(prev => ({ ...prev, entryPrice: v }))}
                placeholder="e.g. 45000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>CURRENT PRICE</Text>
              <TextInput
                style={styles.input}
                value={form.currentPrice}
                onChangeText={v => setForm(prev => ({ ...prev, currentPrice: v }))}
                placeholder="e.g. 48000"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />

              {formError ? (
                <View style={styles.formError}>
                  <Text style={styles.formErrorText}>{formError}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  setForm(DEFAULT_FORM);
                  setFormError(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleAddPosition}
              >
                <Text style={styles.addText}>Add Position</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    padding: spacing.md,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  refreshBtn: {
    padding: spacing.sm,
  },
  refreshText: {
    fontSize: typography.xl,
    color: colors.primary,
  },
  errorBanner: {
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  totalValue: {
    fontSize: typography.xxxl,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pnlBadge: {
    borderRadius: borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
  },
  pnlText: {
    fontSize: typography.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pnlPct: {
    fontSize: typography.md,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.text,
  },
  sectionTitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyAddText: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 28,
    color: colors.text,
    fontWeight: '300',
    lineHeight: 34,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000090',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exchangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  exChip: {
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceLight,
  },
  exChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  exChipText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  exChipTextActive: {
    color: colors.text,
  },
  formError: {
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  formErrorText: {
    color: colors.danger,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.md,
    fontWeight: '600',
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  addText: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: '700',
  },
});

export default PortfolioScreen;
