import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { studyPlanService } from '../../services/studyPlanService';
import { StudyPlan, StudyPlanWeek } from '../../types/goals';

interface StudyPlanPreviewProps {
  studentId: string;
  onViewPlan?: () => void;
  onCreatePlan?: () => void;
  refreshTrigger?: number;
}

export const StudyPlanPreview: React.FC<StudyPlanPreviewProps> = ({
  studentId,
  onViewPlan,
  onCreatePlan,
  refreshTrigger,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [currentWeek, setCurrentWeek] = useState<StudyPlanWeek | null>(null);
  const [planComplete, setPlanComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    loadPlan();
  }, [studentId, refreshTrigger]);

  const loadPlan = async () => {
    if (!studentId) return;
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const activePlan = await studyPlanService.getActivePlan(studentId);
      setPlan(activePlan);
      if (activePlan) {
        const complete = studyPlanService.isPlanComplete(activePlan);
        setPlanComplete(complete);
        if (!complete) {
          const week = studyPlanService.getCurrentWeek(activePlan);
          setCurrentWeek(week);
        }
      }
    } catch (error) {
      console.error('Error loading study plan:', error);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    );
  }

  // No plan — don't show anything
  if (!plan) {
    return null;
  }

  // Plan is fully complete — show completion card
  if (planComplete) {
    const completedWeeks = plan.weeks?.filter(w => w.is_completed).length ?? 0;
    const totalWeeks = plan.total_weeks;
    const avgAccuracy = plan.weeks && plan.weeks.length > 0
      ? Math.round(
          plan.weeks.reduce((sum, w) => sum + (w.actual_accuracy ?? w.target_accuracy ?? 0), 0) /
          plan.weeks.length
        )
      : 0;
    const totalCompleted = plan.weeks?.reduce((sum, w) => sum + (w.completed_questions ?? 0), 0) ?? 0;
    const totalTarget = plan.weeks?.reduce((sum, w) => sum + (w.target_questions ?? 0), 0) ?? 0;

    return (
      <TouchableOpacity
        style={[styles.container, styles.completedContainer, { backgroundColor: colors.card, borderColor: '#10B981' }]}
        onPress={onViewPlan}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconContainer, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>
                {t('studyPlan.planComplete', 'Plan Complete!')}
              </Text>
              <Text style={[styles.weekLabel, { color: '#10B981' }]}>
                {t('studyPlan.tapToSeeResults', 'Tap to see your results')}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>

        {/* Achievement stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#10B98112' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{completedWeeks}/{totalWeeks}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('studyPlan.weeksCompleted', 'Weeks')}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#6366F112' }]}>
            <Text style={[styles.statValue, { color: '#6366F1' }]}>{totalCompleted}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('studyPlan.questionsAnswered', 'Questions')}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F59E0B12' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{avgAccuracy}%</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('studyPlan.avgAccuracy', 'Accuracy')}
            </Text>
          </View>
        </View>

        {/* Full progress bar at 100% */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {t('studyPlan.overallProgress', 'Overall Progress')}
            </Text>
            <Text style={[styles.progressPercent, { color: '#10B981' }]}>100%</Text>
          </View>
          <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
            <View style={[styles.progressBarFill, { width: '100%', backgroundColor: '#10B981' }]} />
          </View>
        </View>

        {/* CTA hint */}
        <View style={[styles.ctaHint, { borderTopColor: colors.border }]}>
          <Ionicons name="analytics-outline" size={14} color={colors.primary} />
          <Text style={[styles.ctaHintText, { color: colors.primary }]}>
            {t('studyPlan.viewDetailedAnalytics', 'View detailed analytics & achievements')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Plan is active — no current week found (shouldn't happen after isPlanComplete fix, but guard)
  if (!currentWeek) return null;

  const progressWidth = Math.min(plan.progress_percentage, 100);

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.card }]}
      onPress={onViewPlan}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: '#6366F120' }]}>
            <Ionicons name="calendar" size={18} color="#6366F1" />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('studyPlan.thisWeek', "This Week's Focus")}
            </Text>
            <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>
              {t('studyPlan.weekOf', 'Week {{week}} of {{total}}', {
                week: currentWeek.week_number,
                total: plan.total_weeks,
              })}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>

      {/* Focus Subjects */}
      <View style={styles.subjectsRow}>
        {currentWeek.focus_subject_names.slice(0, 3).map((name, index) => (
          <View
            key={index}
            style={[styles.subjectChip, { backgroundColor: getSubjectColor(index) + '15' }]}
          >
            <View style={[styles.subjectDot, { backgroundColor: getSubjectColor(index) }]} />
            <Text
              style={[styles.subjectName, { color: getSubjectColor(index) }]}
              numberOfLines={1}
            >
              {name}
            </Text>
          </View>
        ))}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {t('studyPlan.overallProgress', 'Overall Progress')}
          </Text>
          <Text style={[styles.progressPercent, { color: colors.text }]}>
            {Math.round(plan.progress_percentage)}%
          </Text>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${progressWidth}%`,
                backgroundColor: progressWidth >= 100 ? '#10B981' : '#6366F1',
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const getSubjectColor = (index: number): string => {
  const palette = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];
  return palette[index % palette.length];
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  completedContainer: {
    borderWidth: 1.5,
  },
  loadingContainer: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  subjectsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  subjectDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  subjectName: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressSection: {
    marginTop: 2,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  ctaHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  ctaHintText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
