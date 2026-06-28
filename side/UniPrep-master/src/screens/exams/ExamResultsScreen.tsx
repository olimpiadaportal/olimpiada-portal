// Exam Results Screen
// Dark mode support added - Phase 3

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { ExamsStackParamList } from '../../navigation/ExamsStack';
import { mockExamService } from '../../services/mockExamService';
import { translateSubject } from '../../utils/subjectTranslation';
import { analyticsUpdateService } from '../../services/analyticsUpdateService';
import { leaderboardService } from '../../services/leaderboardService';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { ExamResult } from '../../types/mockExam';
import { teacherExamService } from '../../services/teacherExamService';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ErrorState, SectionHeader } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { AnimatedNumber, AnimatedProgress, Stagger, FadeIn, Celebration } from '../../components/animated';
import { StreakCelebrationModal } from '../../components/StreakCelebrationModal';

type ExamResultsScreenNavigationProp = StackNavigationProp<ExamsStackParamList, 'ExamResults'>;
type ExamResultsScreenRouteProp = RouteProp<ExamsStackParamList, 'ExamResults'>;

export const ExamResultsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<ExamResultsScreenNavigationProp>();
  const route = useRoute<ExamResultsScreenRouteProp>();
  const { user, streakMilestone, setStreakMilestone } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { attemptId } = route.params as { attemptId: string };

  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [pendingRating, setPendingRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    if (attemptId) {
      setLoading(true);
      loadResults();
    }
  }, [attemptId]); // Reload when attemptId changes

  const loadResults = async () => {
    try {
      const data = await mockExamService.getExamResults(attemptId);
      setResult(data);
      // Only update analytics if not already updated
      if (data) {
        await updateAnalyticsIfNeeded(attemptId, data);
        // Trigger celebration for good scores (>=70%)
        if (data.percentage >= 70) {
          setTimeout(() => setShowCelebration(true), 400);
        }
        // Load existing rating if this is a teacher exam
        if (data.uses_teacher_questions) {
          const rating = await teacherExamService.getExamRating(attemptId);
          setExistingRating(rating);
        }
      }
    } catch (error) {
      console.error('Load results error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAnalyticsIfNeeded = async (attemptId: string, examResult: ExamResult) => {
    try {
      // Check if analytics were already updated for this attempt
      const { data: attempt, error: attemptError } = await supabase
        .from('mock_exam_attempts')
        .select('analytics_updated')
        .eq('id', attemptId)
        .single();

      if (attemptError) {
        console.error('❌ Failed to check analytics status:', attemptError);
        return;
      }

      // If already updated, skip
      if (attempt?.analytics_updated) {
        console.log('✅ Analytics already updated for this exam, skipping...');
        return;
      }

      const { data: claim, error: claimError } = await supabase
        .from('mock_exam_attempts')
        .update({ analytics_updated: true })
        .eq('id', attemptId)
        .eq('analytics_updated', false)
        .select('id')
        .maybeSingle();

      if (claimError || !claim) {
        if (claimError) {
          console.error('Failed to claim exam analytics update:', claimError);
        } else {
          console.log('Analytics update already claimed for this exam, skipping...');
        }
        return;
      }

      // Update analytics
      await updateAnalytics(examResult);

      // Mark as updated
      await supabase
        .from('mock_exam_attempts')
        .update({ analytics_updated: true })
        .eq('id', attemptId);

      console.log('✅ Analytics updated and marked as processed');
    } catch (error) {
      console.error('❌ Failed to update analytics:', error);
    }
  };

  const updateAnalytics = async (examResult: ExamResult) => {
    if (!user?.id) return;

    try {
      // Get student ID from user ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError || !student) {
        console.error('Failed to get student ID:', studentError);
        return;
      }

      // For exams, we'll use a general subject or aggregate across all subjects
      // Only count questions the student actually answered, not skipped ones
      await analyticsUpdateService.updateAfterExam(
        student.id,
        examResult.answered_questions,
        examResult.correct_answers,
        examResult.time_taken_minutes // Already in minutes
      );
      console.log('✅ Analytics updated after exam completion');

      // Update leaderboard score via server-side SECURITY DEFINER RPC.
      // The server validates ownership + attempt authenticity, applies the
      // weighted average formula, and updates leaderboard_score + ELO atomically.
      await leaderboardService.updateLeaderboardScore(student.id, attemptId);
      console.log('🏆 Leaderboard score updated (server-side)');
    } catch (error) {
      console.error('Failed to update analytics:', error);
      // Don't block user flow if analytics update fails
    }
  };

  const handleSubmitRating = async () => {
    if (!result || pendingRating === 0 || submittingRating) return;
    setSubmittingRating(true);
    try {
      await teacherExamService.submitExamRating(result.mock_exam_id, attemptId, pendingRating);
      setExistingRating(pendingRating);
      setRatingSubmitted(true);
    } catch (error) {
      console.error('submitExamRating error:', error);
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleReviewAnswers = () => {
    navigation.navigate('ExamReview', { attemptId });
  };

  const handleRetake = () => {
    navigation.navigate('ExamsHub');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContent}>
          <View style={styles.loadingHeader}>
            <LoadingSkeleton width="56%" height={28} />
            <LoadingSkeleton width="72%" height={18} style={styles.loadingLine} />
          </View>
          <Card style={styles.loadingScoreCard}>
            <LoadingSkeleton width={132} height={132} borderRadius={66} />
            <LoadingSkeleton width="44%" height={18} style={styles.loadingLine} />
            <LoadingSkeleton width={92} height={34} borderRadius={borderRadius.full} style={styles.loadingLine} />
          </Card>
          <View style={styles.loadingStatsGrid}>
            {[1, 2, 3, 4].map((item) => (
              <Card key={item} style={styles.loadingStatCard}>
                <LoadingSkeleton width={34} height={34} borderRadius={17} />
                <LoadingSkeleton width="42%" height={24} style={styles.loadingLine} />
                <LoadingSkeleton width="64%" height={14} style={styles.loadingLine} />
              </Card>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState title={t('exams.results.failedToLoad')} />
      </SafeAreaView>
    );
  }

  const scorePercentage = (result.total_score / result.max_possible_score) * 100;
  const scoreColor = scorePercentage >= 70 ? colors.success : scorePercentage >= 50 ? colors.warning : colors.error;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Celebration
        visible={showCelebration}
        intensity={scorePercentage >= 90 ? 'full' : 'medium'}
        onComplete={() => setShowCelebration(false)}
      />
      {/* Streak celebration modal — full-screen, once per day */}
      <StreakCelebrationModal
        milestone={streakMilestone}
        onDismiss={() => setStreakMilestone(null)}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeIn duration={400}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('exams.results.title')}</Text>
          <Text style={styles.examTitle}>{result.exam_title}</Text>
          {result.uses_teacher_questions && (
            <View style={styles.noLeaderboardBanner}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.noLeaderboardText}>{t('examsHub.noLeaderboard')}</Text>
            </View>
          )}
        </View>
        </FadeIn>

        {/* Teacher exam rating */}
        {result.uses_teacher_questions && (
          <FadeIn delay={100}>
          <View style={styles.section}>
            <Card style={styles.ratingCard}>
              {existingRating !== null ? (
                <>
                  <Text style={styles.ratingTitle}>{t('exams.results.alreadyRated')}</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= existingRating ? 'star' : 'star-outline'}
                        size={28}
                        color={star <= existingRating ? '#F59E0B' : colors.textTertiary}
                      />
                    ))}
                  </View>
                </>
              ) : ratingSubmitted ? (
                <Text style={styles.ratingTitle}>{t('exams.results.ratingSubmitted')}</Text>
              ) : (
                <>
                  <Text style={styles.ratingTitle}>{t('exams.results.rateThisExam')}</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity key={star} onPress={() => setPendingRating(star)} activeOpacity={0.7}>
                        <Ionicons
                          name={star <= pendingRating ? 'star' : 'star-outline'}
                          size={32}
                          color={star <= pendingRating ? '#F59E0B' : colors.textTertiary}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {pendingRating > 0 && (
                    <Button
                      title={submittingRating ? '...' : t('common.submit')}
                      onPress={handleSubmitRating}
                      style={styles.ratingButton}
                    />
                  )}
                </>
              )}
            </Card>
          </View>
          </FadeIn>
        )}

        {/* Score Card */}
        <FadeIn delay={200}>
        <View style={styles.scoreSection}>
          <Card style={styles.scoreCard}>
            <View style={styles.scoreCircle}>
              <AnimatedNumber
                value={result.total_score}
                duration={800}
                delay={300}
                style={[styles.scoreValue, { color: scoreColor }]}
              />
              <Text style={styles.scoreMax}>/ {result.max_possible_score}</Text>
            </View>
            <Text style={styles.scoreLabel}>{t('exams.results.totalScore')}</Text>
            <View style={[styles.percentageBadge, { backgroundColor: scoreColor + '20' }]}>
              <AnimatedNumber
                value={result.percentage}
                decimals={1}
                suffix="%"
                duration={800}
                delay={400}
                style={[styles.percentageText, { color: scoreColor }]}
              />
            </View>
          </Card>
        </View>
        </FadeIn>

        {/* Stats Grid */}
        <Stagger delay={80} initialDelay={400}>
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <AnimatedNumber value={result.correct_answers} duration={600} delay={500} style={styles.statValue} />
            <Text style={styles.statLabel}>{t('exams.results.correct')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="close-circle" size={32} color={colors.error} />
            <AnimatedNumber value={result.incorrect_answers} duration={600} delay={600} style={styles.statValue} />
            <Text style={styles.statLabel}>{t('exams.results.incorrect')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="help-circle" size={32} color={colors.textTertiary} />
            <AnimatedNumber value={result.unanswered_questions} duration={600} delay={700} style={styles.statValue} />
            <Text style={styles.statLabel}>{t('exams.results.unanswered')}</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="time" size={32} color={colors.primary} />
            <AnimatedNumber value={result.time_taken_minutes} duration={600} delay={800} style={styles.statValue} />
            <Text style={styles.statLabel}>{t('exams.results.minutes')}</Text>
          </Card>
        </View>
        </Stagger>

        {/* Subject Breakdown */}
        <View style={styles.section}>
          <SectionHeader title={t('exams.results.subjectPerformance')} style={styles.sectionHeader} />
          {result.subject_performances.map((subject, index) => (
            <Card key={index} style={styles.subjectCard}>
              <View style={styles.subjectHeader}>
                <Text style={styles.subjectName}>{translateSubject(subject.subject_name, t)}</Text>
                {result.exam_type !== 'individual' && (
                  <View style={styles.coefficientBadge}>
                    <Text style={styles.coefficientText}>{subject.coefficient}×</Text>
                  </View>
                )}
              </View>
              
              <View style={styles.subjectStats}>
                <Text style={styles.subjectScore}>
                  {t('exams.results.correctCount', { correct: subject.correct_answers, total: subject.total_questions })}
                </Text>
                <Text style={[styles.subjectPercentage, { 
                  color: subject.percentage >= 70 ? colors.success : 
                         subject.percentage >= 50 ? colors.warning : colors.error 
                }]}>
                  {subject.percentage.toFixed(0)}%
                </Text>
              </View>

              {/* Progress Bar */}
              <AnimatedProgress
                progress={subject.percentage / 100}
                delay={600 + index * 100}
                height={8}
                color={
                  subject.percentage >= 70 ? colors.success :
                  subject.percentage >= 50 ? colors.warning : colors.error
                }
                style={{ marginVertical: 4 }}
              />

              <View style={styles.subjectPoints}>
                <Text style={styles.pointsLabel}>
                  {result.exam_type === 'individual'
                    ? t('exams.results.correctAnswers')
                    : t('exams.results.pointsEarned')}:
                </Text>
                <Text style={styles.pointsValue}>
                  {subject.weighted_score.toFixed(0)} / {subject.max_possible.toFixed(0)}
                </Text>
              </View>
            </Card>
          ))}
        </View>

        {/* Analysis */}
        {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
          <View style={styles.section}>
            <SectionHeader title={t('exams.results.performanceAnalysis')} style={styles.sectionHeader} />
            
            {result.strengths.length > 0 && (
              <Card style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <Ionicons name="trending-up" size={24} color={colors.success} />
                  <Text style={styles.analysisTitle}>{t('exams.results.strengths')}</Text>
                </View>
                <View style={styles.tagContainer}>
                  {result.strengths.map((strength, index) => (
                    <View key={index} style={[styles.tag, { backgroundColor: colors.success + '20' }]}>
                      <Text style={[styles.tagText, { color: colors.success }]}>{translateSubject(strength, t)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {result.weaknesses.length > 0 && (
              <Card style={styles.analysisCard}>
                <View style={styles.analysisHeader}>
                  <Ionicons name="trending-down" size={24} color={colors.error} />
                  <Text style={styles.analysisTitle}>{t('exams.results.areasToImprove')}</Text>
                </View>
                <View style={styles.tagContainer}>
                  {result.weaknesses.map((weakness, index) => (
                    <View key={index} style={[styles.tag, { backgroundColor: colors.error + '20' }]}>
                      <Text style={[styles.tagText, { color: colors.error }]}>{translateSubject(weakness, t)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <Button
          title={t('exams.results.reviewAnswers')}
          variant="outline"
          onPress={handleReviewAnswers}
          style={styles.actionButton}
        />
        <Button
          title={t('exams.results.backToExams')}
          onPress={handleRetake}
          style={styles.actionButton}
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
    flex: 1,
    padding: spacing.lg,
  },
  loadingHeader: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  loadingScoreCard: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  loadingStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  loadingStatCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: spacing.md,
  },
  loadingLine: {
    marginTop: spacing.md,
  },
  header: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  examTitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noLeaderboardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  noLeaderboardText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  ratingTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingButton: {
    minWidth: 140,
    marginTop: spacing.xs,
  },
  scoreSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  scoreCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  scoreCircle: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: typography.fontWeights.bold,
    lineHeight: 72,
  },
  scoreMax: {
    fontSize: typography.fontSizes.xl,
    color: colors.textSecondary,
  },
  scoreLabel: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  percentageBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  percentageText: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: spacing.md,
  },
  statValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.xs,
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
  sectionHeader: {
    marginBottom: spacing.md,
  },
  subjectCard: {
    marginBottom: spacing.md,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subjectName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  coefficientBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  coefficientText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
  },
  subjectStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subjectScore: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  subjectPercentage: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  subjectPoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  pointsValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  analysisCard: {
    marginBottom: spacing.md,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analysisTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  tagText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  bottomSpacing: {
    height: 100,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButton: {
    flex: 1,
  },
});
