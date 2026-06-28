import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { spacing, borderRadius } from '../../constants/theme';
import { studyPlanService } from '../../services/studyPlanService';
import { supabase } from '../../services/supabase';
import { StudyPlan, StudyPlanWeek } from '../../types/goals';
import { useAlert } from '../../components/AlertProvider';

export const StudyPlanScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { showSuccess, showError } = useAlert();

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [currentWeek, setCurrentWeek] = useState<StudyPlanWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [user]);

  const loadPlan = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!student) return;

      const activePlan = await studyPlanService.getActivePlan(student.id);
      setPlan(activePlan);
      if (activePlan) {
        const week = studyPlanService.getCurrentWeek(activePlan);
        setCurrentWeek(week);
      }
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlan();
    setRefreshing(false);
  };

  const handleAbandonPlan = () => {
    if (!plan || !user?.id) return;
    showError(
      t('studyPlan.abandonTitle', 'Abandon Plan?'),
      t('studyPlan.abandonDesc', 'This will mark your current plan as abandoned. You can create a new one anytime.')
    );
    // For now, just abandon directly. A proper confirm dialog would be better.
    // The user can create a new plan from GoalSettingScreen.
  };

  const getWeekStatus = (week: StudyPlanWeek): 'current' | 'completed' | 'upcoming' | 'past' => {
    if (!currentWeek) return 'upcoming';
    if (week.id === currentWeek.id) return 'current';
    if (week.is_completed) return 'completed';
    if (week.week_number < currentWeek.week_number) return 'past';
    return 'upcoming';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'current': return '#6366F1';
      case 'completed': return '#10B981';
      case 'past': return '#94A3B8';
      case 'upcoming': return '#CBD5E1';
      default: return '#CBD5E1';
    }
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'current': return 'play-circle';
      case 'completed': return 'checkmark-circle';
      case 'past': return 'ellipse';
      case 'upcoming': return 'ellipse-outline';
      default: return 'ellipse-outline';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('studyPlan.title', 'Study Plan')}
          </Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: '#6366F120' }]}>
            <Ionicons name="calendar-outline" size={48} color="#6366F1" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t('studyPlan.noPlan', 'No Study Plan Yet')}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            {t('studyPlan.noPlanDesc', 'Set your goals and exam date to generate a personalized study plan.')}
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: '#6366F1' }]}
            onPress={() => navigation.navigate('GoalSetting' as never)}
          >
            <Ionicons name="flag" size={20} color="#FFFFFF" />
            <Text style={styles.createButtonText}>
              {t('goals.setGoals', 'Set Goals & Create Plan')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('studyPlan.title', 'Study Plan')}
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('GoalSetting' as never)} style={styles.backButton}>
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Plan Overview Card */}
        <View style={[styles.overviewCard, { backgroundColor: '#6366F1' }]}>
          <View style={styles.overviewHeader}>
            <View>
              <Text style={styles.overviewTitle}>{plan.title}</Text>
              {plan.description && (
                <Text style={styles.overviewDesc}>{plan.description}</Text>
              )}
            </View>
          </View>
          <View style={styles.overviewStats}>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatValue}>{plan.total_weeks}</Text>
              <Text style={styles.overviewStatLabel}>{t('studyPlan.weeks', 'Weeks')}</Text>
            </View>
            <View style={[styles.overviewDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatValue}>{Math.round(plan.progress_percentage)}%</Text>
              <Text style={styles.overviewStatLabel}>{t('studyPlan.progress', 'Progress')}</Text>
            </View>
            <View style={[styles.overviewDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatValue}>
                {currentWeek ? currentWeek.week_number : '-'}
              </Text>
              <Text style={styles.overviewStatLabel}>{t('studyPlan.currentWeek', 'Current')}</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={styles.overviewProgressBg}>
            <View
              style={[
                styles.overviewProgressFill,
                { width: `${Math.min(plan.progress_percentage, 100)}%` },
              ]}
            />
          </View>
        </View>

        {/* Weekly Breakdown */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('studyPlan.weeklyBreakdown', 'Weekly Breakdown')}
        </Text>

        {plan.weeks?.map((week) => {
          const status = getWeekStatus(week);
          const statusColor = getStatusColor(status);
          const isCurrent = status === 'current';

          return (
            <View
              key={week.id}
              style={[
                styles.weekCard,
                {
                  backgroundColor: colors.card,
                  borderLeftColor: statusColor,
                  borderLeftWidth: 3,
                },
                isCurrent && { borderColor: statusColor, borderWidth: 1 },
              ]}
            >
              <View style={styles.weekHeader}>
                <View style={styles.weekHeaderLeft}>
                  <Ionicons name={getStatusIcon(status)} size={20} color={statusColor} />
                  <Text style={[styles.weekTitle, { color: colors.text }]}>
                    {t('studyPlan.weekNumber', 'Week {{num}}', { num: week.week_number })}
                  </Text>
                  {isCurrent && (
                    <View style={[styles.currentBadge, { backgroundColor: statusColor + '20' }]}>
                      <Text style={[styles.currentBadgeText, { color: statusColor }]}>
                        {t('studyPlan.current', 'Current')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.weekDates, { color: colors.textSecondary }]}>
                  {formatDateShort(week.start_date)} - {formatDateShort(week.end_date)}
                </Text>
              </View>

              {/* Focus Subjects */}
              <View style={styles.focusSubjects}>
                {week.focus_subject_names.map((name, idx) => (
                  <View
                    key={idx}
                    style={[styles.subjectChip, { backgroundColor: getSubjectColor(idx) + '15' }]}
                  >
                    <View style={[styles.subjectDot, { backgroundColor: getSubjectColor(idx) }]} />
                    <Text style={[styles.subjectName, { color: getSubjectColor(idx) }]} numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Week Targets */}
              <View style={styles.weekTargets}>
                <View style={styles.weekTarget}>
                  <Ionicons name="help-circle-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.weekTargetText, { color: colors.textSecondary }]}>
                    {week.completed_questions}/{week.target_questions} {t('goals.questions', 'questions')}
                  </Text>
                </View>
                <View style={styles.weekTarget}>
                  <Ionicons name="trending-up-outline" size={14} color={colors.textSecondary} />
                  <Text style={[styles.weekTargetText, { color: colors.textSecondary }]}>
                    {t('studyPlan.weeklyProgress', 'Progress: {{pct}}%', {
                      pct: week.target_questions > 0
                        ? Math.round((week.completed_questions / week.target_questions) * 100)
                        : 0,
                    })}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const formatDateShort = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const getSubjectColor = (index: number): string => {
  const palette = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];
  return palette[index % palette.length];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  overviewCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  overviewHeader: {
    marginBottom: spacing.md,
  },
  overviewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  overviewDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 4,
  },
  overviewStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  overviewStat: {
    flex: 1,
    alignItems: 'center',
  },
  overviewStatValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  overviewStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  overviewDivider: {
    width: 1,
    height: 32,
  },
  overviewProgressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  overviewProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  weekCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  weekHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  weekDates: {
    fontSize: 11,
    fontWeight: '400',
  },
  focusSubjects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.xs,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  subjectDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  subjectName: {
    fontSize: 11,
    fontWeight: '500',
  },
  weekTargets: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  weekTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weekTargetText: {
    fontSize: 11,
    fontWeight: '400',
  },
});
