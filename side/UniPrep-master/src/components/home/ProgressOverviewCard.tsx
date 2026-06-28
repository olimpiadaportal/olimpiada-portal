import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';

interface ProgressOverviewCardProps {
  studyStreak: number;
  completionRate: number;
  totalQuestions: number;
  accuracy: number;
}

export const ProgressOverviewCard: React.FC<ProgressOverviewCardProps> = ({
  studyStreak,
  completionRate,
  totalQuestions,
  accuracy,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const stats = [
    {
      icon: 'flame' as const,
      label: t('home.components.progressOverview.studyStreak'),
      value: studyStreak.toString(),
      color: '#EF4444',
      suffix: studyStreak === 1 ? t('common.day') : t('common.days'),
    },
    {
      icon: 'checkmark-circle' as const,
      label: t('home.components.progressOverview.accuracy'),
      value: `${accuracy}%`,
      color: accuracy >= 70 ? '#10B981' : accuracy >= 50 ? '#F59E0B' : '#EF4444',
      suffix: '',
    },
    {
      icon: 'document-text' as const,
      label: t('home.components.progressOverview.questionsAnswered'),
      value: totalQuestions.toString(),
      color: '#3B82F6',
      suffix: t('common.total'),
    },
    {
      icon: 'trending-up' as const,
      label: t('common.complete'),
      value: `${completionRate}%`,
      color: '#8B5CF6',
      suffix: '',
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('home.components.progressOverview.title')}
      </Text>
      
      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <View 
            key={index} 
            style={[
              styles.statItem,
              { borderColor: colors.border },
            ]}
          >
            <View style={[styles.iconContainer, { backgroundColor: stat.color + '20' }]}>
              <Ionicons name={stat.icon} size={24} color={stat.color} />
            </View>
            
            <Text style={[styles.statValue, { color: colors.text }]}>
              {stat.value}
            </Text>
            
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {stat.label}
            </Text>
            
            {stat.suffix && (
              <Text style={[styles.statSuffix, { color: colors.textSecondary }]}>
                {stat.suffix}
              </Text>
            )}
          </View>
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  statItem: {
    width: '50%',
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statSuffix: {
    fontSize: 10,
    marginTop: 2,
  },
});
