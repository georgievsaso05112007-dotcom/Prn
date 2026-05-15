import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../theme';
import type { Strategy } from '../types';

interface Props {
  strategy: Strategy;
  onEdit?: (strategy: Strategy) => void;
  onDelete?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
}

function getTypeColor(type: Strategy['type']): string {
  switch (type) {
    case 'TREND':
      return colors.primary;
    case 'MOMENTUM':
      return colors.buy;
    case 'MEAN_REVERSION':
      return colors.warning;
    case 'AI':
      return '#8B5CF6'; // Purple for AI
    default:
      return colors.textSecondary;
  }
}

function getTypeLabel(type: Strategy['type']): string {
  switch (type) {
    case 'TREND':
      return 'TREND';
    case 'MOMENTUM':
      return 'MOMENTUM';
    case 'MEAN_REVERSION':
      return 'MEAN REV';
    case 'AI':
      return 'AI';
    default:
      return type;
  }
}

const StrategyCard: React.FC<Props> = ({
  strategy,
  onEdit,
  onDelete,
  onToggle,
}) => {
  const typeColor = getTypeColor(strategy.type);

  return (
    <View style={[styles.container, !strategy.enabled && styles.disabled]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{strategy.name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '20', borderColor: typeColor }]}>
            <Text style={[styles.typeText, { color: typeColor }]}>
              {getTypeLabel(strategy.type)}
            </Text>
          </View>
        </View>

        <Switch
          value={strategy.enabled}
          onValueChange={val => onToggle?.(strategy.id, val)}
          trackColor={{ false: colors.border, true: colors.primary + '60' }}
          thumbColor={strategy.enabled ? colors.primary : colors.textMuted}
          ios_backgroundColor={colors.border}
        />
      </View>

      {strategy.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {strategy.description}
        </Text>
      ) : null}

      {Object.keys(strategy.parameters).length > 0 ? (
        <View style={styles.params}>
          {Object.entries(strategy.parameters)
            .slice(0, 4)
            .map(([key, val]) => (
              <View key={key} style={styles.param}>
                <Text style={styles.paramKey}>{key}</Text>
                <Text style={styles.paramValue}>{String(val)}</Text>
              </View>
            ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => onEdit?.(strategy)}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete?.(strategy.id)}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
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
  disabled: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginRight: spacing.sm,
  },
  name: {
    fontSize: typography.lg,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
    marginBottom: 4,
  },
  typeBadge: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginBottom: 4,
  },
  typeText: {
    fontSize: typography.xs,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  params: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  param: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
    marginBottom: 4,
  },
  paramKey: {
    fontSize: typography.xs,
    color: colors.textMuted,
    marginRight: 4,
  },
  paramValue: {
    fontSize: typography.xs,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  editButton: {
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editText: {
    color: colors.primary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: colors.danger + '20',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: {
    color: colors.danger,
    fontSize: typography.sm,
    fontWeight: '600',
  },
});

export default StrategyCard;
