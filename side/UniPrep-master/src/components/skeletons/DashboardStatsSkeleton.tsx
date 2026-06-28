import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius, shadows } from '../../constants/theme';

export const DashboardStatsSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <LoadingSkeleton width={56} height={56} borderRadius={28} />
        <View style={styles.headerCopy}>
          <LoadingSkeleton width={110} height={14} />
          <LoadingSkeleton width={74} height={24} style={styles.headerName} />
        </View>
        <View style={styles.headerActions}>
          <LoadingSkeleton width={44} height={44} borderRadius={22} />
          <LoadingSkeleton width={44} height={44} borderRadius={22} />
        </View>
      </View>

      <View style={[styles.todayCard, { backgroundColor: colors.surface }, shadows.sm]}>
        <View style={styles.todayHeader}>
          <View style={styles.todayCopy}>
            <LoadingSkeleton width={62} height={14} />
            <LoadingSkeleton width="76%" height={28} style={styles.todayTitle} />
            <LoadingSkeleton width="52%" height={22} style={styles.todayTitle} />
          </View>
          <LoadingSkeleton width={96} height={28} borderRadius={14} />
        </View>
        <View style={styles.actionRow}>
          <LoadingSkeleton width={48} height={48} borderRadius={12} />
          <View style={styles.actionCopy}>
            <LoadingSkeleton width="58%" height={18} />
            <LoadingSkeleton width="86%" height={14} style={styles.actionLine} />
            <LoadingSkeleton width="70%" height={14} style={styles.actionLine} />
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <LoadingSkeleton width={170} height={26} />
        <LoadingSkeleton width="70%" height={16} style={styles.sectionSubtitle} />
      </View>

      <View style={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.statCard, { backgroundColor: colors.surface }, shadows.sm]}
          >
            <View style={styles.statHeader}>
              <LoadingSkeleton width="58%" height={16} />
              <LoadingSkeleton width={24} height={24} borderRadius={12} />
            </View>
            <LoadingSkeleton width="48%" height={30} style={styles.statValue} />
            <LoadingSkeleton width="38%" height={12} />
          </View>
        ))}
      </View>

      <View style={[styles.listCard, { backgroundColor: colors.surface }, shadows.sm]}>
        <View style={styles.cardHeader}>
          <LoadingSkeleton width="42%" height={22} />
          <LoadingSkeleton width={74} height={18} />
        </View>
        <View style={styles.compactItem}>
          <LoadingSkeleton width="48%" height={16} />
          <LoadingSkeleton width="70%" height={14} style={styles.actionLine} />
        </View>
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.surface }, shadows.sm]}>
        <LoadingSkeleton width="56%" height={22} style={styles.chartTitle} />
        <LoadingSkeleton width="100%" height={180} borderRadius={borderRadius.md} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerName: {
    marginTop: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  todayCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  todayHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  todayCopy: {
    flex: 1,
  },
  todayTitle: {
    marginTop: spacing.xs,
  },
  actionRow: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCopy: {
    flex: 1,
  },
  actionLine: {
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  statHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statValue: {
    marginTop: spacing.xs,
  },
  chartCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  chartTitle: {
    marginBottom: spacing.md,
  },
  listCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  compactItem: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
});
