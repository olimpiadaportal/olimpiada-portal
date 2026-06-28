import React, { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { translateSubject } from '../utils/subjectTranslation';
import { TeacherWithDetails } from '../types/teacher';
import { spacing, borderRadius, shadows, typography } from '../constants/theme';
import { ScaleButton } from './animated/ScaleButton';

interface TeacherCardProps {
  teacher: TeacherWithDetails;
  onPress: (teacherId: string) => void;
  getCityDisplayName?: (englishName: string) => string;
  headerAction?: React.ReactNode;
}

const TeacherCardComponent: React.FC<TeacherCardProps> = ({
  teacher,
  onPress,
  getCityDisplayName = (name) => name,
  headerAction,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const statusColor =
    teacher.availability_status === 'available'
      ? '#22C55E'
      : teacher.availability_status === 'offline'
        ? '#EF4444'
        : '#F59E0B';

  const statusLabel =
    teacher.availability_status === 'available'
      ? t('teachers.available')
      : teacher.availability_status === 'offline'
        ? t('teachers.offline')
        : t('teachers.busy');

  const sessionMethodLabel = teacher.can_do_in_person
    ? `${t('teachers.inPerson')} + ${t('teachers.online')}`
    : t('teachers.online');

  return (
    <View style={[styles.teacherCard, { backgroundColor: colors.surface }, shadows.sm]}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrapper}>
          <Image
            source={
              teacher.avatar_url
                ? { uri: teacher.avatar_url }
                : require('../../assets/defaultavatar.png')
            }
            style={styles.avatar}
          />
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.teacherName, { color: colors.text }]}
              numberOfLines={1}
            >
              {teacher.full_name}
            </Text>
            {teacher.is_verified && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            )}
            {headerAction && (
              <View style={styles.headerAction}>
                {headerAction}
              </View>
            )}
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}55` },
            ]}
          >
            <View style={[styles.statusBadgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusBadgeText, { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.specializationsContainer}>
        {teacher.specializations.slice(0, 3).map((subject) => (
          <View
            key={subject}
            style={[styles.specializationChip, { backgroundColor: `${colors.primary}12` }]}
          >
            <Text style={[styles.specializationText, { color: colors.primary }]} numberOfLines={1}>
              {translateSubject(subject, t)}
            </Text>
          </View>
        ))}
        {teacher.specializations.length > 3 && (
          <View style={[styles.moreChip, { backgroundColor: colors.background }]}>
            <Text style={[styles.moreText, { color: colors.textSecondary }]}>
              +{teacher.specializations.length - 3}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Ionicons name="star" size={15} color="#F59E0B" />
          <Text style={[styles.infoText, { color: colors.text }]} numberOfLines={1}>
            {teacher.rating.toFixed(1)} ({teacher.total_reviews})
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]} numberOfLines={1}>
            {getCityDisplayName(teacher.city)}
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Ionicons
            name={teacher.can_do_in_person ? 'people-outline' : 'videocam-outline'}
            size={15}
            color={colors.textSecondary}
          />
          <Text style={[styles.infoText, { color: colors.textSecondary }]} numberOfLines={1}>
            {sessionMethodLabel}
          </Text>
        </View>
      </View>

      {teacher.is_same_city && (
        <View style={[styles.sameCityBadge, { backgroundColor: `${colors.primary}10` }]}>
          <Ionicons name="navigate-outline" size={14} color={colors.primary} />
          <Text style={[styles.sameCityText, { color: colors.primary }]} numberOfLines={1}>
            {t('teachers.sameCity')}
          </Text>
        </View>
      )}

      <View style={styles.subscriptionStatsRow}>
        <View style={[styles.subscriptionStatPill, { backgroundColor: `${colors.primary}10` }]}>
          <Ionicons name="people-outline" size={14} color={colors.primary} />
          <Text style={[styles.subscriptionStatText, { color: colors.primary }]} numberOfLines={1}>
            {t('teachers.currentStudentsShort', {
              count: teacher.current_students ?? teacher.total_students ?? 0,
            })}
          </Text>
        </View>
        <View style={[styles.subscriptionStatPill, { backgroundColor: colors.background }]}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.subscriptionStatText, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('teachers.totalStudentsShort', { count: teacher.total_students || 0 })}
          </Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
        <View style={styles.priceContainer}>
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>
            {t('teachers.hourlyRate')}
          </Text>
          <Text style={[styles.priceValue, { color: colors.primary }]}>
            {teacher.hourly_rate} AZN
          </Text>
        </View>

        <ScaleButton
          style={[styles.viewProfileButton, { backgroundColor: colors.primary }]}
          onPress={() => onPress(teacher.id)}
          scaleValue={0.97}
          accessibilityLabel={`View ${teacher.full_name}'s profile`}
          accessibilityRole="button"
          accessibilityHint={`Opens profile for ${teacher.full_name}, rated ${teacher.rating.toFixed(1)} stars`}
        >
          <Text style={styles.viewProfileText} numberOfLines={1}>
            {t('teachers.viewProfile')}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </ScaleButton>
      </View>
    </View>
  );
};

export const TeacherCard = memo(TeacherCardComponent, (prevProps, nextProps) => {
  const prevTeacher = prevProps.teacher;
  const nextTeacher = nextProps.teacher;

  return (
    prevTeacher.id === nextTeacher.id &&
    prevTeacher.full_name === nextTeacher.full_name &&
    prevTeacher.avatar_url === nextTeacher.avatar_url &&
    prevTeacher.city === nextTeacher.city &&
    prevTeacher.rating === nextTeacher.rating &&
    prevTeacher.total_reviews === nextTeacher.total_reviews &&
    prevTeacher.hourly_rate === nextTeacher.hourly_rate &&
    prevTeacher.current_students === nextTeacher.current_students &&
    prevTeacher.total_students === nextTeacher.total_students &&
    prevTeacher.is_verified === nextTeacher.is_verified &&
    prevTeacher.is_same_city === nextTeacher.is_same_city &&
    prevTeacher.can_do_in_person === nextTeacher.can_do_in_person &&
    prevTeacher.availability_status === nextTeacher.availability_status &&
    prevTeacher.specializations.join('|') === nextTeacher.specializations.join('|') &&
    prevProps.headerAction === nextProps.headerAction
  );
});

const styles = StyleSheet.create({
  teacherCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  teacherName: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  headerAction: {
    flexShrink: 0,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  specializationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  specializationChip: {
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  specializationText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  moreChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  moreText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  infoGrid: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
    gap: spacing.xs,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  sameCityBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  sameCityText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  subscriptionStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  subscriptionStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  subscriptionStatText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  cardFooter: {
    alignItems: 'stretch',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  priceContainer: {
    minWidth: 0,
  },
  priceLabel: {
    fontSize: typography.fontSizes.xs,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  viewProfileText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
});
