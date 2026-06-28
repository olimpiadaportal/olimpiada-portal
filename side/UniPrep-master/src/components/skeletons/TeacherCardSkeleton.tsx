import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius, shadows } from '../../constants/theme';

export const TeacherCardSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, shadows.sm]}>
      <View style={styles.header}>
        <LoadingSkeleton width={64} height={64} borderRadius={32} />
        <View style={styles.headerContent}>
          <LoadingSkeleton width="72%" height={20} />
          <LoadingSkeleton width={96} height={24} borderRadius={12} />
        </View>
      </View>

      <View style={styles.chipRow}>
        <LoadingSkeleton width={92} height={26} borderRadius={13} />
        <LoadingSkeleton width={112} height={26} borderRadius={13} />
        <LoadingSkeleton width={68} height={26} borderRadius={13} />
      </View>

      <View style={styles.detailStack}>
        <LoadingSkeleton width="68%" height={16} />
        <LoadingSkeleton width="54%" height={16} />
        <LoadingSkeleton width="78%" height={16} />
      </View>

      <View style={styles.footer}>
        <View style={styles.priceBlock}>
          <LoadingSkeleton width={72} height={12} />
          <LoadingSkeleton width={84} height={24} />
        </View>
        <LoadingSkeleton width={116} height={44} borderRadius={8} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerContent: {
    flex: 1,
    gap: spacing.xs,
    marginLeft: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  detailStack: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  priceBlock: {
    gap: spacing.xs,
  },
});
