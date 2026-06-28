// Quiz Result Screen
// Dark mode support added - Phase 2

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { PracticeStackParamList } from '../../navigation/PracticeStack';
import { practiceService } from '../../services/practiceService';
import { analyticsUpdateService } from '../../services/analyticsUpdateService';
import { supabase } from '../../services/supabase';
import { usePracticeStore } from '../../store/practiceStore';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { QuizResult } from '../../types/practice';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { FadeIn, Stagger, AnimatedNumber } from '../../components/animated';
import { StreakCelebrationModal } from '../../components/StreakCelebrationModal';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ErrorState, ScreenShell } from '../../components/ui';

type QuizResultScreenNavigationProp = StackNavigationProp<PracticeStackParamList, 'QuizResult'>;
type QuizResultScreenRouteProp = RouteProp<PracticeStackParamList, 'QuizResult'>;

export const QuizResultScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<QuizResultScreenNavigationProp>();
  const route = useRoute<QuizResultScreenRouteProp>();
  const { user, streakMilestone, setStreakMilestone } = useAuthStore();
  const { clearSession } = usePracticeStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);

  const sessionId = route.params?.sessionId;
  const sessionMode = route.params?.mode;

  useEffect(() => {
    if (sessionId) {
      setLoading(true);
      loadResult();
    }
  }, [sessionId]); // Reload when sessionId changes

  const loadResult = async () => {
    if (!sessionId) {
      navigation.goBack();
      return;
    }

    try {
      const data = await practiceService.getQuizResult(sessionId);
      if (data) {
        setResult(data);
        // Only update analytics if not already updated
        await updateAnalyticsIfNeeded(sessionId, data);
      }
    } catch (error) {
      console.error('Load quiz result error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAnalyticsIfNeeded = async (sessionId: string, quizResult: QuizResult) => {
    try {
      // Check if analytics were already updated for this session
      const { data: session, error: sessionError } = await supabase
        .from('practice_sessions')
        .select('analytics_updated, mode')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        console.error('❌ Failed to check analytics status:', sessionError);
        return;
      }

      // If already updated, skip
      if (session?.analytics_updated) {
        console.log('✅ Analytics already updated for this session, skipping...');
        return;
      }

      const { data: claim, error: claimError } = await supabase
        .from('practice_sessions')
        .update({ analytics_updated: true })
        .eq('id', sessionId)
        .eq('analytics_updated', false)
        .select('id')
        .maybeSingle();

      if (claimError || !claim) {
        if (claimError) {
          console.error('Failed to claim analytics update:', claimError);
        } else {
          console.log('Analytics update already claimed for this session, skipping...');
        }
        return;
      }

      // Update analytics
      const modeForAnalytics =
        sessionMode ?? (session?.mode === 'quiz' || session?.mode === 'practice'
          ? session.mode
          : undefined);

      await updateAnalytics(quizResult, modeForAnalytics);

      // Mark as updated
      await supabase
        .from('practice_sessions')
        .update({ analytics_updated: true })
        .eq('id', sessionId);

      console.log('✅ Analytics updated and marked as processed');
    } catch (error) {
      console.error('❌ Failed to update analytics:', error);
    }
  };

  const updateAnalytics = async (
    quizResult: QuizResult,
    modeForAnalytics?: 'practice' | 'quiz'
  ) => {
    if (!user?.id) {
      console.error('❌ Cannot update analytics: No user ID');
      return;
    }
    
    if (!quizResult.subject_id) {
      console.error('❌ Cannot update analytics: No subject ID in result');
      return;
    }

    try {
      console.log('📊 Updating analytics for practice session...');
      
      // Get student ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError || !student) {
        console.error('❌ Failed to get student ID:', studentError);
        return;
      }

      console.log('👤 Student ID:', student.id);
      console.log('📚 Subject ID:', quizResult.subject_id);
      console.log('❓ Questions:', quizResult.total_questions, 'Correct:', quizResult.correct_answers);
      console.log('⏱️ Time:', Math.ceil(quizResult.total_time_seconds / 60), 'minutes');

      // Only count questions the student actually answered (not skipped)
      const answeredQuestions = quizResult.correct_answers + quizResult.incorrect_answers;
      await analyticsUpdateService.updateAfterPractice(
        student.id,
        quizResult.subject_id,
        answeredQuestions,
        quizResult.correct_answers,
        Math.ceil(quizResult.total_time_seconds / 60), // Convert seconds to minutes (round up)
        modeForAnalytics // Pass mode to determine if ELO should be updated
      );
      console.log('✅ Analytics updated after practice session');
    } catch (error) {
      console.error('❌ Failed to update analytics:', error);
      // Don't block user flow if analytics update fails
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}${t('practice.results.minuteShort')} ${secs}${t('practice.results.secondShort')}`;
  };

  const getScoreColor = (percentage: number): string => {
    if (percentage >= 80) return '#10B981';
    if (percentage >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const getScoreMessage = (percentage: number): string => {
    if (percentage >= 90) return t('practice.results.excellent');
    if (percentage >= 80) return t('practice.results.greatJob');
    if (percentage >= 70) return t('practice.results.goodWork');
    if (percentage >= 60) return t('practice.results.notBad');
    return t('practice.results.keepPracticing');
  };

  const handleFinish = () => {
    clearSession();
    // Use reset to go back to Mode Selection screen
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'ModeSelection' }],
      })
    );
  };

  const handleReviewQuestions = () => {
    if (sessionId) {
      navigation.navigate('QuizReview', { sessionId });
    }
  };

  if (loading) {
    return (
      <ScreenShell contentStyle={styles.loadingContent}>
        <LoadingSkeleton height={28} width="56%" style={styles.loadingHeaderSkeleton} />
        <LoadingSkeleton height={160} width={160} style={styles.loadingScoreSkeleton} />
        <View style={styles.loadingStatsRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <LoadingSkeleton key={index} height={96} style={styles.loadingStatSkeleton} />
          ))}
        </View>
        <LoadingSkeleton height={152} style={styles.loadingCardSkeleton} />
        <LoadingSkeleton height={116} style={styles.loadingCardSkeleton} />
      </ScreenShell>
    );
  }

  if (!result) {
    return (
      <ScreenShell scroll={false} contentStyle={styles.errorContainer}>
        <ErrorState
          title={t('practice.results.failedToLoadResults')}
          actionLabel={t('practice.results.goBack')}
          onAction={handleFinish}
        />
      </ScreenShell>
    );
  }

  const scoreColor = getScoreColor(result.score_percentage);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StreakCelebrationModal
        milestone={streakMilestone}
        onDismiss={() => setStreakMilestone(null)}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Score Header */}
        <FadeIn duration={500}>
        <View style={styles.scoreHeader}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <AnimatedNumber value={result.score_percentage} suffix="%" style={[styles.scorePercentage, { color: scoreColor }]} duration={800} delay={200} />
            <Text style={styles.scoreLabel}>{t('practice.results.score')}</Text>
          </View>
          <Text style={styles.scoreMessage}>{getScoreMessage(result.score_percentage)}</Text>
          <Text style={styles.subjectName}>{result.subject_name}</Text>
        </View>
        </FadeIn>

        {/* Quick Stats */}
        <Stagger delay={100} initialDelay={400} distance={20}>
        <View style={styles.statsContainer}>
          <Card style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <AnimatedNumber value={result.correct_answers} style={styles.statValue} duration={600} delay={500} />
            <Text style={styles.statLabel}>{t('practice.results.correct')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="close-circle" size={32} color="#EF4444" />
            <AnimatedNumber value={result.incorrect_answers} style={styles.statValue} duration={600} delay={600} />
            <Text style={styles.statLabel}>{t('practice.results.incorrect')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="time" size={32} color="#3B82F6" />
            <Text style={styles.statValue}>{formatTime(result.total_time_seconds)}</Text>
            <Text style={styles.statLabel}>{t('practice.results.timeSpent')}</Text>
          </Card>
        </View>
        </Stagger>

        {/* Detailed Breakdown */}
        <FadeIn delay={700} duration={400}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('practice.results.performanceBreakdown')}</Text>
          
          <Card style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{t('practice.results.totalQuestions')}</Text>
              <Text style={styles.breakdownValue}>{result.total_questions}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{t('practice.results.correctAnswers')}</Text>
              <Text style={[styles.breakdownValue, { color: '#10B981' }]}>
                {result.correct_answers}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{t('practice.results.incorrectAnswers')}</Text>
              <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>
                {result.incorrect_answers}
              </Text>
            </View>
            {result.skipped_questions > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{t('practice.results.skippedQuestions')}</Text>
                <Text style={[styles.breakdownValue, { color: '#F59E0B' }]}>
                  {result.skipped_questions}
                </Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{t('practice.results.accuracy')}</Text>
              <Text style={[styles.breakdownValue, { color: scoreColor }]}>
                {result.score_percentage}%
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{t('practice.results.avgTimePerQuestion')}</Text>
              <Text style={styles.breakdownValue}>
                {result.average_time_per_question}s
              </Text>
            </View>
          </Card>
        </View>

        </FadeIn>

        {/* Progress Visualization */}
        <FadeIn delay={900} duration={400}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('practice.results.scoreDistribution')}</Text>
          <Card style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{t('practice.results.correct')}</Text>
              <View style={styles.progressBarWrapper}>
                <ProgressBar
                  progress={(result.correct_answers / result.total_questions) * 100}
                  color="#10B981"
                />
              </View>
              <Text style={styles.progressValue}>{result.correct_answers}</Text>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{t('practice.results.incorrect')}</Text>
              <View style={styles.progressBarWrapper}>
                <ProgressBar
                  progress={(result.incorrect_answers / result.total_questions) * 100}
                  color="#EF4444"
                />
              </View>
              <Text style={styles.progressValue}>{result.incorrect_answers}</Text>
            </View>
          </Card>
        </View>
        </FadeIn>
      </ScrollView>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <Button
          title={t('practice.results.reviewAnswers')}
          variant="outline"
          onPress={handleReviewQuestions}
          style={styles.footerButton}
        />
        <Button
          title={t('practice.results.backToHome')}
          variant="primary"
          onPress={handleFinish}
          style={styles.footerButton}
        />
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContent: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  loadingHeaderSkeleton: {
    marginBottom: spacing.sm,
  },
  loadingScoreSkeleton: {
    borderRadius: 80,
  },
  loadingStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  loadingStatSkeleton: {
    borderRadius: borderRadius.lg,
    flex: 1,
  },
  loadingCardSkeleton: {
    borderRadius: borderRadius.lg,
    width: '100%',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.fontSizes.lg,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  scrollView: {
    flex: 1,
  },
  scoreHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  scoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  scorePercentage: {
    fontSize: 48,
    fontWeight: typography.fontWeights.bold,
  },
  scoreLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  scoreMessage: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subjectName: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  breakdownCard: {
    gap: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  progressCard: {
    gap: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  progressLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    width: 70,
  },
  progressBarWrapper: {
    flex: 1,
  },
  progressValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    width: 30,
    textAlign: 'right',
  },
  questionSummaryCard: {
    marginBottom: spacing.sm,
  },
  questionSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  questionNumber: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
  },
  questionSummaryStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  questionSummaryStatusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  questionSummaryText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  questionSummaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionSummaryAnswer: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  answerBold: {
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  questionSummaryTime: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
  },
});
