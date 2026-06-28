import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { goalService } from '../../services/goalService';
import { DailyGoalStatus } from '../../types/goals';
import Svg, { Circle } from 'react-native-svg';

interface DailyGoalCardProps {
  studentId: string;
  onSetGoals?: () => void;
  onViewDetails?: () => void;
  refreshTrigger?: number;
}

export const DailyGoalCard: React.FC<DailyGoalCardProps> = ({
  studentId,
  onSetGoals,
  onViewDetails,
  refreshTrigger,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [status, setStatus] = useState<DailyGoalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [hasGoals, setHasGoals] = useState(false);

  useEffect(() => {
    loadGoalStatus();
  }, [studentId, refreshTrigger]);

  const loadGoalStatus = async () => {
    if (!studentId) return;
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const goals = await goalService.getGoals(studentId);
      setHasGoals(!!goals);
      const goalStatus = await goalService.getDailyGoalStatus(studentId);
      setStatus(goalStatus);
    } catch (error) {
      console.error('Error loading goal status:', error);
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

  // No goals set yet — show CTA
  if (!hasGoals) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.ctaContainer, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}
        onPress={onSetGoals}
        activeOpacity={0.7}
      >
        <View style={[styles.ctaIconContainer, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="flag" size={28} color={colors.primary} />
        </View>
        <View style={styles.ctaContent}>
          <Text style={[styles.ctaTitle, { color: colors.text }]}>
            {t('goals.setDailyGoal', 'Set Your Daily Goal')}
          </Text>
          <Text style={[styles.ctaSubtitle, { color: colors.textSecondary }]}>
            {t('goals.setDailyGoalDesc', 'Track your progress and build study habits')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  if (!status) return null;

  const progressPercent = status.progressPercentage;
  const ringSize = 72;
  const strokeWidth = 6;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * Math.min(progressPercent, 100)) / 100;

  const getProgressColor = () => {
    if (status.bothGoalsMet) return '#10B981';
    if (progressPercent >= 50) return '#F59E0B';
    return colors.primary;
  };

  const progressColor = getProgressColor();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: colors.card }]}
      onPress={onViewDetails || onSetGoals}
      activeOpacity={0.7}
    >
      <View style={styles.mainRow}>
        {/* Circular Progress Ring */}
        <View style={styles.ringContainer}>
          <Svg width={ringSize} height={ringSize}>
            {/* Background circle */}
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={colors.border}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Progress circle */}
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={progressColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${ringSize / 2}, ${ringSize / 2}`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            {status.bothGoalsMet ? (
              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            ) : (
              <Text style={[styles.ringPercent, { color: progressColor }]}>
                {progressPercent}%
              </Text>
            )}
          </View>
        </View>

        {/* Goal Details */}
        <View style={styles.detailsContainer}>
          <Text style={[styles.title, { color: colors.text }]}>
            {status.bothGoalsMet
              ? t('goals.dailyGoalComplete', "Today's Goal Complete!")
              : t('goals.dailyGoal', "Today's Goal")}
          </Text>

          {/* Questions progress */}
          <View style={styles.metricRow}>
            <View style={[styles.metricIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="help-circle" size={14} color="#3B82F6" />
            </View>
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>
              {Math.min(status.questionsCompleted, status.questionsTarget)}/{status.questionsTarget} {t('goals.questions', 'questions')}
            </Text>
            {status.questionGoalMet && (
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            )}
          </View>

          {/* Time progress */}
          <View style={styles.metricRow}>
            <View style={[styles.metricIcon, { backgroundColor: '#8B5CF620' }]}>
              <Ionicons name="time" size={14} color="#8B5CF6" />
            </View>
            <Text style={[styles.metricText, { color: colors.textSecondary }]}>
              {Math.min(status.timeSpentMinutes, status.timeTarget)}/{status.timeTarget} {t('goals.minutes', 'min')}
            </Text>
            {status.timeGoalMet && (
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            )}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
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
  loadingContainer: {
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ctaIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  ctaContent: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  ctaSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringContainer: {
    width: 72,
    height: 72,
    marginRight: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringPercent: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailsContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metricIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  metricText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
});
