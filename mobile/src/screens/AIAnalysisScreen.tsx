import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import AISignalCard from '../components/AISignalCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Exchange, Timeframe } from '../types';

const EXCHANGES: Exchange[] = ['binance', 'bybit', 'yahoo', 'oanda'];
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const AIAnalysisScreen: React.FC = () => {
  const settings = useSelector((state: RootState) => state.settings.settings);

  const [symbol, setSymbol] = useState('BTC/USDT');
  const [selectedExchange, setSelectedExchange] = useState<Exchange>(
    settings.defaultExchange,
  );
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(
    settings.defaultTimeframe,
  );

  const [trainModalVisible, setTrainModalVisible] = useState(false);
  const [trainSymbol, setTrainSymbol] = useState('');

  const {
    signal,
    signals,
    modelCount,
    loading,
    signalsLoading,
    trainingStatus,
    error,
    runAnalysis,
    fetchSignals,
    fetchModelCount,
    startTraining,
    clearError,
  } = useAIAnalysis();

  useEffect(() => {
    fetchModelCount();
    fetchSignals(selectedExchange, 10);
  }, [fetchModelCount, fetchSignals, selectedExchange]);

  const handleRunAnalysis = useCallback(async () => {
    if (!symbol.trim()) {
      Alert.alert('Error', 'Please enter a symbol');
      return;
    }
    clearError();
    await runAnalysis(symbol.trim().toUpperCase(), selectedExchange, selectedTimeframe);
  }, [symbol, selectedExchange, selectedTimeframe, runAnalysis, clearError]);

  const handleStartTraining = useCallback(async () => {
    const sym = trainSymbol.trim().toUpperCase();
    if (!sym) {
      Alert.alert('Error', 'Please enter a symbol');
      return;
    }
    setTrainModalVisible(false);
    await startTraining(sym, selectedExchange);
  }, [trainSymbol, selectedExchange, startTraining]);

  const isTraining =
    trainingStatus.status === 'training' || trainingStatus.status === 'starting';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AI Analysis</Text>
          <Text style={styles.subtitle}>Neural network trading signals</Text>
        </View>

        {/* Configuration */}
        <View style={styles.configCard}>
          <Text style={styles.configLabel}>SYMBOL</Text>
          <TextInput
            style={styles.symbolInput}
            value={symbol}
            onChangeText={setSymbol}
            placeholder="e.g. BTC/USDT"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
          />

          <Text style={styles.configLabel}>EXCHANGE</Text>
          <View style={styles.chipsRow}>
            {EXCHANGES.map(ex => (
              <TouchableOpacity
                key={ex}
                style={[
                  styles.chip,
                  selectedExchange === ex && styles.chipActive,
                ]}
                onPress={() => setSelectedExchange(ex)}
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
          </View>

          <Text style={styles.configLabel}>TIMEFRAME</Text>
          <View style={styles.timeframeRow}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity
                key={tf}
                style={[
                  styles.tfBtn,
                  selectedTimeframe === tf && styles.tfBtnActive,
                ]}
                onPress={() => setSelectedTimeframe(tf)}
              >
                <Text
                  style={[
                    styles.tfText,
                    selectedTimeframe === tf && styles.tfTextActive,
                  ]}
                >
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.analyzeBtn, loading && styles.analyzeBtnDisabled]}
            onPress={handleRunAnalysis}
            disabled={loading}
          >
            {loading ? (
              <LoadingSpinner size="small" />
            ) : (
              <Text style={styles.analyzeBtnText}>Run AI Analysis</Text>
            )}
          </TouchableOpacity>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* Current Signal */}
        {signal ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CURRENT SIGNAL</Text>
            <AISignalCard signal={signal} />
          </View>
        ) : null}

        {/* Model Status */}
        <View style={styles.modelCard}>
          <View style={styles.modelHeader}>
            <View>
              <Text style={styles.modelTitle}>ML Models</Text>
              <Text style={styles.modelCount}>
                {modelCount} model{modelCount !== 1 ? 's' : ''} trained
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.trainBtn, isTraining && styles.trainBtnDisabled]}
              onPress={() => setTrainModalVisible(true)}
              disabled={isTraining}
            >
              <Text style={styles.trainBtnText}>
                {isTraining ? 'Training...' : 'Train New'}
              </Text>
            </TouchableOpacity>
          </View>

          {isTraining ? (
            <View style={styles.trainingProgress}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {trainingStatus.status === 'starting'
                    ? 'Initializing...'
                    : 'Training in progress...'}
                </Text>
                <Text style={styles.progressPct}>
                  {trainingStatus.progress.toFixed(0)}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${trainingStatus.progress}%` },
                  ]}
                />
              </View>
            </View>
          ) : trainingStatus.status === 'completed' ? (
            <View style={styles.trainingComplete}>
              <Text style={styles.trainingCompleteText}>
                Training complete! Model is ready.
              </Text>
            </View>
          ) : trainingStatus.status === 'failed' || trainingStatus.status === 'error' ? (
            <View style={styles.trainingFailed}>
              <Text style={styles.trainingFailedText}>Training failed</Text>
            </View>
          ) : null}
        </View>

        {/* Signal History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SIGNAL HISTORY</Text>

          {signalsLoading ? (
            <LoadingSpinner size="small" message="Loading signals..." />
          ) : signals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No signal history yet</Text>
              <Text style={styles.emptySubtext}>
                Run an analysis to generate your first signal
              </Text>
            </View>
          ) : (
            signals.map((sig, idx) => (
              <AISignalCard
                key={`${sig.symbol}_${sig.timestamp}_${idx}`}
                signal={sig}
                compact
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Train Modal */}
      <Modal
        visible={trainModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTrainModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Train New Model</Text>
            <Text style={styles.modalSubtitle}>
              Train an ML model for a specific symbol on {selectedExchange.toUpperCase()}
            </Text>

            <Text style={styles.inputLabel}>Symbol</Text>
            <TextInput
              style={styles.modalInput}
              value={trainSymbol}
              onChangeText={setTrainSymbol}
              placeholder="e.g. BTC/USDT"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setTrainModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.startTrainBtn}
                onPress={handleStartTraining}
              >
                <Text style={styles.startTrainText}>Start Training</Text>
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
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  configCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  configLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  symbolInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.lg,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceLight,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
  timeframeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  tfBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  tfBtnActive: {
    backgroundColor: colors.primary,
  },
  tfText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  tfTextActive: {
    color: colors.text,
  },
  analyzeBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  analyzeBtnDisabled: {
    opacity: 0.6,
  },
  analyzeBtnText: {
    color: colors.text,
    fontSize: typography.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  errorBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  modelCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelTitle: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.text,
  },
  modelCount: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  trainBtn: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  trainBtnDisabled: {
    opacity: 0.5,
  },
  trainBtnText: {
    color: colors.primary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  trainingProgress: {
    marginTop: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  progressPct: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
  },
  progressFill: {
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  trainingComplete: {
    marginTop: spacing.sm,
    backgroundColor: colors.buy + '20',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  trainingCompleteText: {
    color: colors.buy,
    fontSize: typography.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  trainingFailed: {
    marginTop: spacing.sm,
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  trainingFailedText: {
    color: colors.danger,
    fontSize: typography.sm,
    fontWeight: '600',
    textAlign: 'center',
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.lg,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  startTrainBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  startTrainText: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: '700',
  },
});

export default AIAnalysisScreen;
