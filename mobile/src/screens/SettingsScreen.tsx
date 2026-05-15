import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Switch,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { saveSettings, checkBackendHealth } from '../store/settingsSlice';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { AppSettings, Exchange, Timeframe } from '../types';

const EXCHANGES: Exchange[] = ['binance', 'bybit', 'yahoo', 'oanda'];
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const APP_VERSION = '1.0.0';

interface SecretField {
  key: keyof AppSettings;
  label: string;
  placeholder: string;
  visible: boolean;
}

const SettingsScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { settings, loading, backendConnected } = useSelector(
    (state: RootState) => state.settings,
  );

  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [testingConnection, setTestingConnection] = useState(false);
  const [secretVisibility, setSecretVisibility] = useState<
    Record<string, boolean>
  >({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const updateField = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const toggleVisibility = useCallback((key: string) => {
    setSecretVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true);
    const result = await dispatch(checkBackendHealth(form.backendUrl));
    setTestingConnection(false);

    const connected = (result.payload as { healthy: boolean } | undefined)?.healthy;
    Alert.alert(
      'Connection Test',
      connected
        ? `Successfully connected to ${form.backendUrl}`
        : `Failed to connect to ${form.backendUrl}`,
    );
  }, [dispatch, form.backendUrl]);

  const handleSave = useCallback(async () => {
    const result = await dispatch(saveSettings(form));
    if (saveSettings.fulfilled.match(result)) {
      setSaved(true);
      Alert.alert('Saved', 'Settings saved successfully');
    } else {
      Alert.alert('Error', 'Failed to save settings');
    }
  }, [dispatch, form]);

  const renderSecretInput = (
    key: keyof AppSettings,
    label: string,
    placeholder: string,
  ) => {
    const isVisible = secretVisibility[key] ?? false;
    return (
      <View key={key} style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.secretRow}>
          <TextInput
            style={[styles.input, styles.secretInput]}
            value={form[key] as string}
            onChangeText={v => updateField(key, v as any)}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!isVisible}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => toggleVisibility(key)}
          >
            <Text style={styles.eyeIcon}>{isVisible ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Backend Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>BACKEND</Text>
            <View style={styles.connectionBadge}>
              <View
                style={[
                  styles.connDot,
                  { backgroundColor: backendConnected ? colors.buy : colors.sell },
                ]}
              />
              <Text
                style={[
                  styles.connText,
                  { color: backendConnected ? colors.buy : colors.sell },
                ]}
              >
                {backendConnected ? 'Connected' : 'Offline'}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>BACKEND URL</Text>
          <TextInput
            style={styles.input}
            value={form.backendUrl}
            onChangeText={v => updateField('backendUrl', v)}
            placeholder="http://localhost:8000"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <TouchableOpacity
            style={[styles.testBtn, testingConnection && styles.btnDisabled]}
            onPress={handleTestConnection}
            disabled={testingConnection}
          >
            <Text style={styles.testBtnText}>
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Defaults Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DEFAULTS</Text>

          <Text style={styles.fieldLabel}>DEFAULT EXCHANGE</Text>
          <View style={styles.chipRow}>
            {EXCHANGES.map(ex => (
              <TouchableOpacity
                key={ex}
                style={[
                  styles.chip,
                  form.defaultExchange === ex && styles.chipActive,
                ]}
                onPress={() => updateField('defaultExchange', ex)}
              >
                <Text
                  style={[
                    styles.chipText,
                    form.defaultExchange === ex && styles.chipTextActive,
                  ]}
                >
                  {ex.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>DEFAULT TIMEFRAME</Text>
          <View style={styles.tfRow}>
            {TIMEFRAMES.map(tf => (
              <TouchableOpacity
                key={tf}
                style={[
                  styles.tfBtn,
                  form.defaultTimeframe === tf && styles.tfBtnActive,
                ]}
                onPress={() => updateField('defaultTimeframe', tf)}
              >
                <Text
                  style={[
                    styles.tfText,
                    form.defaultTimeframe === tf && styles.tfTextActive,
                  ]}
                >
                  {tf}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Binance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BINANCE</Text>
          {renderSecretInput('binanceApiKey', 'API KEY', 'Binance API key')}
          {renderSecretInput('binanceSecret', 'SECRET', 'Binance secret key')}
        </View>

        {/* Bybit Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BYBIT</Text>
          {renderSecretInput('bybitApiKey', 'API KEY', 'Bybit API key')}
          {renderSecretInput('bybitSecret', 'SECRET', 'Bybit secret key')}
        </View>

        {/* OANDA Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OANDA</Text>
          {renderSecretInput('oandaApiKey', 'API KEY', 'OANDA API key')}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ACCOUNT ID</Text>
            <TextInput
              style={styles.input}
              value={form.oandaAccountId}
              onChangeText={v => updateField('oandaAccountId', v)}
              placeholder="OANDA account ID"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* AI/LLM Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI / LLM</Text>
          {renderSecretInput(
            'anthropicApiKey',
            'ANTHROPIC API KEY',
            'sk-ant-...',
          )}
          <Text style={styles.helperText}>
            Required for Claude-powered AI analysis and explanations
          </Text>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.btnDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveBtnText}>
            {loading ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </Text>
        </TouchableOpacity>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>TradingAI</Text>
          <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
          <Text style={styles.appBuild}>
            Professional AI-Powered Trading Terminal
          </Text>
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
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  connText: {
    fontSize: typography.xs,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.xs,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.8,
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
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secretInput: {
    flex: 1,
    marginRight: spacing.xs,
  },
  eyeBtn: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyeIcon: {
    fontSize: typography.md,
  },
  testBtn: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  testBtnText: {
    color: colors.primary,
    fontSize: typography.md,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
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
  tfRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
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
  helperText: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.text,
    fontSize: typography.lg,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  appName: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: typography.md,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  appBuild: {
    fontSize: typography.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default SettingsScreen;
