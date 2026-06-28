import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius, shadows } from '../../constants/theme';

export const BookingCardSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, shadows.md]}>
      {/* Header with avatar and name */}
      <View style={styles.header}>
        <LoadingSkeleton width={56} height={56} borderRadius={28} />
        <View style={styles.headerInfo}>
          <LoadingSkeleton width="70%" height={18} />
          <LoadingSkeleton width="50%" height={14} style={{ marginTop: spacing.xs }} />
        </View>
        <LoadingSkeleton width={80} height={28} borderRadius={borderRadius.full} />
      </View>

      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <LoadingSkeleton width={24} height={24} borderRadius={12} />
          <LoadingSkeleton width="60%" height={16} />
        </View>
        <View style={styles.detailRow}>
          <LoadingSkeleton width={24} height={24} borderRadius={12} />
          <LoadingSkeleton width="50%" height={16} />
        </View>
        <View style={styles.detailRow}>
          <LoadingSkeleton width={24} height={24} borderRadius={12} />
          <LoadingSkeleton width="40%" height={16} />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <LoadingSkeleton width="48%" height={40} borderRadius={borderRadius.md} />
        <LoadingSkeleton width="48%" height={40} borderRadius={borderRadius.md} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  details: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
