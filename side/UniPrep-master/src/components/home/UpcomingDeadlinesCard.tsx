import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { Deadline, deadlineService } from '../../services/deadlineService';
import { formatDateWithCapitalizedMonth } from '../../utils/dateFormatting';

interface UpcomingDeadlinesCardProps {
  deadlines: Deadline[];
  loading?: boolean;
  onDeadlinePress?: (deadline: Deadline) => void;
  onAddDeadline?: () => void;
  onViewAll?: () => void;
}

export const UpcomingDeadlinesCard: React.FC<UpcomingDeadlinesCardProps> = ({
  deadlines,
  loading = false,
  onDeadlinePress,
  onAddDeadline,
  onViewAll,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const getUrgencyColor = (urgencyLevel: string): string => {
    return deadlineService.getUrgencyColor(urgencyLevel as 'urgent' | 'soon' | 'upcoming' | 'later');
  };

  const getTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    return deadlineService.getTypeIcon(type as 'exam' | 'assignment' | 'goal' | 'custom') as keyof typeof Ionicons.glyphMap;
  };

  const getDaysLeftText = (daysLeft: number): string => {
    if (daysLeft < 0) return t('home.components.upcomingDeadlines.overdue');
    if (daysLeft === 0) return t('home.components.upcomingDeadlines.today');
    if (daysLeft === 1) return t('home.components.upcomingDeadlines.tomorrow');
    return `${daysLeft} ${t('home.components.upcomingDeadlines.daysLeft')}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.components.upcomingDeadlines.title')}
        </Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (deadlines.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('home.components.upcomingDeadlines.title')}
          </Text>
          {onAddDeadline && (
            <TouchableOpacity onPress={onAddDeadline} activeOpacity={0.7}>
              <Ionicons name="add-circle" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('home.components.upcomingDeadlines.noDeadlines')}. {t('home.components.upcomingDeadlines.tapToAdd')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.components.upcomingDeadlines.title')}
        </Text>
        <View style={styles.headerActions}>
          {onAddDeadline && (
            <TouchableOpacity 
              onPress={onAddDeadline} 
              style={styles.headerButton}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          {onViewAll && deadlines.length > 0 && (
            <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>
                {t('home.components.upcomingDeadlines.viewAll')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.deadlinesList}>
        {deadlines.slice(0, 3).map((deadline, index) => (
          <TouchableOpacity
            key={deadline.id}
            style={[
              styles.deadlineItem,
              { 
                backgroundColor: colors.background,
                borderLeftColor: getUrgencyColor(deadline.urgencyLevel),
              },
            ]}
            onPress={() => onDeadlinePress?.(deadline)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.iconContainer, 
              { backgroundColor: getUrgencyColor(deadline.urgencyLevel) + '20' }
            ]}>
              <Ionicons 
                name={getTypeIcon(deadline.type)} 
                size={20} 
                color={getUrgencyColor(deadline.urgencyLevel)} 
              />
            </View>

            <View style={styles.deadlineContent}>
              <Text style={[styles.deadlineTitle, { color: colors.text }]}>
                {deadline.title}
              </Text>
              {deadline.description && (
                <Text 
                  style={[styles.deadlineDescription, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {deadline.description}
                </Text>
              )}
              <View style={styles.deadlineFooter}>
                <View style={styles.deadlineMeta}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                  <Text style={[styles.deadlineMetaText, { color: colors.textSecondary }]}>
                    {formatDateWithCapitalizedMonth(deadline.date, t('common.locale'), { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Text>
                </View>
                <View style={[
                  styles.daysLeftBadge,
                  { backgroundColor: getUrgencyColor(deadline.urgencyLevel) + '20' }
                ]}>
                  <Text style={[
                    styles.daysLeftText,
                    { color: getUrgencyColor(deadline.urgencyLevel) }
                  ]}>
                    {getDaysLeftText(deadline.daysLeft)}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    marginRight: spacing.xs,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  deadlinesList: {
    gap: spacing.sm,
  },
  deadlineItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  deadlineContent: {
    flex: 1,
  },
  deadlineTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  deadlineDescription: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  deadlineFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deadlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineMetaText: {
    fontSize: 12,
  },
  daysLeftBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  daysLeftText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
