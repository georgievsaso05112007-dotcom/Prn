import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Switch,
  StyleSheet,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import {
  fetchStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
} from '../store/strategySlice';
import StrategyCard from '../components/StrategyCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Strategy } from '../types';

type StrategyType = Strategy['type'];
const STRATEGY_TYPES: StrategyType[] = ['TREND', 'MOMENTUM', 'MEAN_REVERSION', 'AI'];

interface EditForm {
  name: string;
  description: string;
  type: StrategyType;
  enabled: boolean;
  paramKey: string;
  paramValue: string;
  parameters: Record<string, number | string | boolean>;
}

const DEFAULT_FORM: EditForm = {
  name: '',
  description: '',
  type: 'TREND',
  enabled: true,
  paramKey: '',
  paramValue: '',
  parameters: {},
};

const StrategyScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { strategies, loading, error } = useSelector(
    (state: RootState) => state.strategy,
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [form, setForm] = useState<EditForm>(DEFAULT_FORM);

  useEffect(() => {
    dispatch(fetchStrategies());
  }, [dispatch]);

  const openAdd = useCallback(() => {
    setEditingStrategy(null);
    setForm(DEFAULT_FORM);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((strategy: Strategy) => {
    setEditingStrategy(strategy);
    setForm({
      name: strategy.name,
      description: strategy.description,
      type: strategy.type,
      enabled: strategy.enabled,
      paramKey: '',
      paramValue: '',
      parameters: { ...strategy.parameters },
    });
    setModalVisible(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        'Delete Strategy',
        'Are you sure you want to delete this strategy?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => dispatch(deleteStrategy(id)),
          },
        ],
      );
    },
    [dispatch],
  );

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      dispatch(updateStrategy({ id, data: { enabled } }));
    },
    [dispatch],
  );

  const handleAddParam = useCallback(() => {
    const key = form.paramKey.trim();
    const val = form.paramValue.trim();
    if (!key || !val) return;

    const parsedVal = isNaN(Number(val))
      ? val === 'true' ? true : val === 'false' ? false : val
      : Number(val);

    setForm(prev => ({
      ...prev,
      parameters: { ...prev.parameters, [key]: parsedVal },
      paramKey: '',
      paramValue: '',
    }));
  }, [form.paramKey, form.paramValue]);

  const handleRemoveParam = useCallback((key: string) => {
    setForm(prev => {
      const updated = { ...prev.parameters };
      delete updated[key];
      return { ...prev, parameters: updated };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Strategy name is required');
      return;
    }

    const strategyData = {
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      enabled: form.enabled,
      parameters: form.parameters,
    };

    if (editingStrategy) {
      await dispatch(updateStrategy({ id: editingStrategy.id, data: strategyData }));
    } else {
      await dispatch(createStrategy(strategyData));
    }

    setModalVisible(false);
  }, [form, editingStrategy, dispatch]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Strategies</Text>
          <Text style={styles.subtitle}>
            {strategies.length} strategy{strategies.length !== 1 ? 'ies' : 'y'}{' '}
            configured
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && strategies.length === 0 ? (
          <LoadingSpinner size="large" message="Loading strategies..." />
        ) : strategies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚡</Text>
            <Text style={styles.emptyTitle}>No Strategies Yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first trading strategy to get started
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd}>
              <Text style={styles.emptyAddText}>Add Strategy</Text>
            </TouchableOpacity>
          </View>
        ) : (
          strategies.map(strategy => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Add/Edit Modal */}
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
              <Text style={styles.modalTitle}>
                {editingStrategy ? 'Edit Strategy' : 'New Strategy'}
              </Text>

              {/* Name */}
              <Text style={styles.fieldLabel}>NAME *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={v => setForm(prev => ({ ...prev, name: v }))}
                placeholder="Strategy name"
                placeholderTextColor={colors.textMuted}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={v => setForm(prev => ({ ...prev, description: v }))}
                placeholder="Describe your strategy..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />

              {/* Type */}
              <Text style={styles.fieldLabel}>TYPE</Text>
              <View style={styles.typeRow}>
                {STRATEGY_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      form.type === t && styles.typeChipActive,
                    ]}
                    onPress={() => setForm(prev => ({ ...prev, type: t }))}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        form.type === t && styles.typeChipTextActive,
                      ]}
                    >
                      {t === 'MEAN_REVERSION' ? 'MEAN REV' : t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Enabled */}
              <View style={styles.enableRow}>
                <Text style={styles.enableLabel}>ENABLED</Text>
                <Switch
                  value={form.enabled}
                  onValueChange={v => setForm(prev => ({ ...prev, enabled: v }))}
                  trackColor={{ false: colors.border, true: colors.primary + '60' }}
                  thumbColor={form.enabled ? colors.primary : colors.textMuted}
                />
              </View>

              {/* Parameters */}
              <Text style={styles.fieldLabel}>PARAMETERS</Text>

              {Object.entries(form.parameters).length > 0 ? (
                <View style={styles.paramsContainer}>
                  {Object.entries(form.parameters).map(([key, val]) => (
                    <View key={key} style={styles.paramRow}>
                      <Text style={styles.paramKey}>{key}</Text>
                      <Text style={styles.paramVal}>{String(val)}</Text>
                      <TouchableOpacity onPress={() => handleRemoveParam(key)}>
                        <Text style={styles.removeParam}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.addParamRow}>
                <TextInput
                  style={[styles.input, styles.paramKeyInput]}
                  value={form.paramKey}
                  onChangeText={v => setForm(prev => ({ ...prev, paramKey: v }))}
                  placeholder="Key"
                  placeholderTextColor={colors.textMuted}
                />
                <TextInput
                  style={[styles.input, styles.paramValueInput]}
                  value={form.paramValue}
                  onChangeText={v => setForm(prev => ({ ...prev, paramValue: v }))}
                  placeholder="Value"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={styles.addParamBtn} onPress={handleAddParam}>
                  <Text style={styles.addParamText}>Add</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>
                  {editingStrategy ? 'Update' : 'Create'}
                </Text>
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
    maxHeight: '90%',
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
    marginBottom: spacing.xs,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  typeChip: {
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceLight,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  typeChipTextActive: {
    color: colors.text,
  },
  enableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  enableLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  paramsContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  paramKey: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  paramVal: {
    flex: 1,
    fontSize: typography.sm,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  removeParam: {
    color: colors.textMuted,
    fontSize: typography.sm,
    paddingHorizontal: spacing.xs,
  },
  addParamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  paramKeyInput: {
    flex: 1,
    marginRight: spacing.xs,
    marginBottom: 0,
  },
  paramValueInput: {
    flex: 1,
    marginRight: spacing.xs,
    marginBottom: 0,
  },
  addParamBtn: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addParamText: {
    color: colors.text,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  saveText: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: '700',
  },
});

export default StrategyScreen;
