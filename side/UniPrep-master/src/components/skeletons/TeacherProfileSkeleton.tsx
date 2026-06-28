import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius, shadows } from '../../constants/theme';

export const TeacherProfileSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.container}>
      {/* Header Section */}
      <View style={[styles.header, { backgroundColor: colors.surface }, shadows.md]}>
        <LoadingSkeleton width={100} height={100} borderRadius={50} />
        <LoadingSkeleton width="60%" height={24} style={styles.nameGap} />
        <LoadingSkeleton width="40%" height={16} />
        <View style={styles.ratingRow}>
          <LoadingSkeleton width={80} height={20} />
          <LoadingSkeleton width={100} height={20} />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <LoadingSkeleton width="48%" height={48} borderRadius={borderRadius.lg} />
        <LoadingSkeleton width="48%" height={48} borderRadius={borderRadius.lg} />
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View 
            key={i} 
            style={[styles.statCard, { backgroundColor: colors.surface }, shadows.sm]}
          >
            <LoadingSkeleton width={40} height={40} borderRadius={20} />
            <LoadingSkeleton width="70%" height={20} style={styles.statGap} />
            <LoadingSkeleton width="50%" height={14} />
          </View>
        ))}
      </View>

      {/* About Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }, shadows.sm]}>
        <LoadingSkeleton width="30%" height={20} style={styles.sectionTitle} />
        <LoadingSkeleton width="100%" height={16} />
        <LoadingSkeleton width="90%" height={16} style={styles.lineGap} />
        <LoadingSkeleton width="95%" height={16} style={styles.lineGap} />
      </View>

      {/* Specializations */}
      <View style={[styles.section, { backgroundColor: colors.surface }, shadows.sm]}>
        <LoadingSkeleton width="40%" height={20} style={styles.sectionTitle} />
        <View style={styles.chipsRow}>
          <LoadingSkeleton width={80} height={32} borderRadius={borderRadius.full} />
          <LoadingSkeleton width={100} height={32} borderRadius={borderRadius.full} />
          <LoadingSkeleton width={90} height={32} borderRadius={borderRadius.full} />
        </View>
      </View>

      {/* Reviews Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }, shadows.sm]}>
        <LoadingSkeleton width="35%" height={20} style={styles.sectionTitle} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.reviewItem}>
            <View style={styles.reviewHeader}>
              <LoadingSkeleton width={40} height={40} borderRadius={20} />
              <View style={styles.reviewInfo}>
                <LoadingSkeleton width={120} height={16} />
                <LoadingSkeleton width={80} height={14} style={{ marginTop: spacing.xs }} />
              </View>
            </View>
            <LoadingSkeleton width="100%" height={14} style={{ marginTop: spacing.sm }} />
            <LoadingSkeleton width="80%" height={14} style={{ marginTop: spacing.xs }} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  nameGap: {
    marginTop: spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  statGap: {
    marginTop: spacing.sm,
  },
  section: {
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  lineGap: {
    marginTop: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reviewItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  reviewHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reviewInfo: {
    flex: 1,
  },
});
