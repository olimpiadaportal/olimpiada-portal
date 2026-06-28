import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { adaptiveLearningService } from '../../services/adaptiveLearningService';
import { competitiveSessionService } from '../../services/competitiveSessionService';
import { supabase } from '../../services/supabase';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { scoringService } from '../../services/scoringService';
import { streakService } from '../../services/streakService';
import { FadeIn, Stagger, AnimatedNumber } from '../../components/animated';
import { StreakCelebrationModal } from '../../components/StreakCelebrationModal';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ScreenShell, SectionHeader } from '../../components/ui';

type RouteParams = {
  CompetitiveResults: {
    sessionId: string;
    answers: Array<{
      questionId: string;
      studentAnswer: string;
      timeSpent: number;
    }>;
    totalTime: number;
    questions?: any[];
  };
};

interface TopicPerformance {
  topic: string;
  correct: number;
  total: number;
  percentage: number;
}

export const CompetitiveResultsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'CompetitiveResults'>>();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const streakMilestone = useAuthStore((state) => state.streakMilestone);
  const setStreakMilestone = useAuthStore((state) => state.setStreakMilestone);
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { sessionId, answers, totalTime } = route.params;

  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [topicPerformance, setTopicPerformance] = useState<TopicPerformance[]>([]);

  useEffect(() => {
    calculateResults();
  }, []);

  const calculateResults = async () => {
    try {
      setLoading(true);
      
      // Get questions from route params
      const questions = route.params.questions || [];
      const totalQuestions = questions.length || 20;
      
      // Calculate answered vs unanswered
      const answeredCount = answers.filter(a => a.studentAnswer).length;
      const skipped = totalQuestions - answeredCount;
      
      // Calculate correct/incorrect by checking actual answers
      let correctAnswers = 0;
      let incorrectAnswers = 0;
      
      answers.forEach(answer => {
        if (!answer.studentAnswer) return; // Skip unanswered
        
        const question = questions.find((q: any) => q.id === answer.questionId);
        if (!question) return;
        
        if (answer.studentAnswer === question.correct_answer) {
          correctAnswers++;
        } else {
          incorrectAnswers++;
        }
      });
      
      // Score is based on total questions (industry standard)
      const calculatedScore = totalQuestions > 0 
        ? Math.round((correctAnswers / totalQuestions) * 100)
        : 0;

      setCorrectCount(correctAnswers);
      setIncorrectCount(incorrectAnswers);
      setSkippedCount(skipped);
      setScore(calculatedScore);

      // Calculate topic performance from actual questions
      const topicMap = new Map<string, { correct: number; total: number }>();
      
      // Group answers by topic from actual questions
      answers.forEach(answer => {
        // Find the question for this answer
        const question = questions.find((q: any) => q.id === answer.questionId);
        if (!question) return;
        
        const topic = question.topic || 'General';
        const isCorrect = answer.studentAnswer === question.correct_answer;
        
        // Initialize topic if not exists
        if (!topicMap.has(topic)) {
          topicMap.set(topic, { correct: 0, total: 0 });
        }
        
        // Update stats
        const stats = topicMap.get(topic)!;
        stats.total += 1;
        if (isCorrect) {
          stats.correct += 1;
        }
      });

      // Convert to array and sort by percentage (worst first for focus)
      const topicPerf: TopicPerformance[] = Array.from(topicMap.entries())
        .map(([topic, stats]) => ({
          topic,
          correct: stats.correct,
          total: stats.total,
          percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        }))
        .sort((a, b) => a.percentage - b.percentage); // Worst topics first

      setTopicPerformance(topicPerf);

      // Save session to database
      await saveSessionToDatabase(questions, answers, correctAnswers, answeredCount);

      // Save question results for adaptive learning
      await saveQuestionResults(questions, answers);
    } catch (error) {
      console.error('Failed to calculate results:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save session to database with question results
   */
  const saveSessionToDatabase = async (
    questions: any[],
    answers: any[],
    correctAnswers: number,
    answeredCount: number
  ) => {
    try {
      console.log('💾 Saving competitive session to database...');

      // Get session data from database
      const { data: session, error: sessionError } = await supabase
        .from('competitive_sessions')
        .select('student_id, subject_id, subject_name, weak_topics_covered')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.error('❌ Failed to fetch session data:', sessionError);
        return;
      }

      // Calculate score (based on total questions - industry standard)
      const totalQuestions = questions.length || 20;
      const calculatedScore = totalQuestions > 0 
        ? Math.round((correctAnswers / totalQuestions) * 100)
        : 0;

      // Prepare question results for database
      const questionResults = questions.map(question => {
        const answer = answers.find(a => a.questionId === question.id);
        return {
          question_id: question.id,
          question_text: question.question_text,
          option_a: question.option_a,
          option_b: question.option_b,
          option_c: question.option_c,
          option_d: question.option_d,
          correct_answer: question.correct_answer,
          student_answer: answer?.studentAnswer || null,
          is_correct: answer?.studentAnswer === question.correct_answer,
          time_spent_seconds: answer?.timeSpent || 0,
        };
      });

      // Update existing session with results
      // IMPORTANT: Update student_id to current user (for cached sessions)
      const cacheExpiresAt = new Date();
      cacheExpiresAt.setDate(cacheExpiresAt.getDate() + 3);

      // Get current student's ID from students table
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      console.log('🔍 Student ID check:', {
        userId: user?.id,
        studentId: student?.id,
        sessionStudentId: session.student_id,
        willUse: student?.id || session.student_id
      });

      const success = await competitiveSessionService.updateSession(
        sessionId,
        {
          student_id: student?.id || session.student_id, // Use current user's student_id
          score: calculatedScore,
          correct_answers: correctAnswers,
          time_spent_seconds: totalTime,
          completed_at: new Date().toISOString(),
          cache_expires_at: cacheExpiresAt.toISOString(),
        },
        questionResults
      );

      if (success) {
        console.log('✅ Session saved successfully');

        // ============================================
        // STAGE 10.2: Update ELO Score & Streak
        // ============================================
        try {
          // Determine difficulty
          const difficulty = scoringService.getDifficultyFromPercentage(calculatedScore);
          
          // Update ELO score
          await scoringService.updateScore(calculatedScore, difficulty, 'quiz_completion');
          
          // Update streak
          await streakService.updateStreakRealtime('competitive');
          
          console.log('✅ Score and streak updated after competitive session');
        } catch (scoringError) {
          console.error('Error updating score/streak:', scoringError);
        }
        // ============================================
      } else {
        console.error('❌ Failed to save session');
      }
    } catch (error) {
      console.error('❌ Error saving session:', error);
      // Don't throw - this is a background operation
    }
  };

  /**
   * Save question results to database for adaptive learning
   */
  const saveQuestionResults = async (questions: any[], answers: any[]) => {
    try {
      console.log('💾 Saving question results for adaptive learning...');

      // Get student and subject IDs from the session
      const { data: session, error: sessionError } = await supabase
        .from('competitive_sessions')
        .select('student_id, subject_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        console.error('❌ Failed to fetch session data:', sessionError);
        return;
      }

      // Prepare question results
      const questionResults = answers
        .map(answer => {
          const question = questions.find((q: any) => q.id === answer.questionId);
          if (!question) return null;

          return {
            sessionId,
            studentId: session.student_id,
            subjectId: session.subject_id,
            questionId: answer.questionId,
            topic: question.topic || 'General',
            difficulty: question.difficulty || 'medium',
            studentAnswer: answer.studentAnswer || null,
            correctAnswer: question.correct_answer,
            isCorrect: answer.studentAnswer === question.correct_answer,
            timeSpent: Math.ceil(answer.timeSpent || 0), // Round up to nearest second
          };
        })
        .filter(Boolean); // Remove null entries

      if (questionResults.length === 0) {
        console.log('⚠️ No question results to save');
        return;
      }

      // Save to database
      const result = await adaptiveLearningService.saveQuestionResults(
        questionResults as Parameters<typeof adaptiveLearningService.saveQuestionResults>[0]
      );

      if (result.success) {
        console.log(`✅ Saved ${questionResults.length} question results for adaptive learning`);
      } else {
        console.error('❌ Failed to save question results:', result.error);
      }
    } catch (error) {
      console.error('❌ Error saving question results:', error);
      // Don't throw - this is a background operation that shouldn't block the UI
    }
  };

  const handleReviewAnswers = () => {
    // Navigate to review screen with session data
    // @ts-ignore - Navigation types are complex
    navigation.navigate('CompetitiveReview', {
      sessionId,
      answers,
      questions: route.params.questions || [],
    });
  };

  const handleFinish = () => {
    // Reset to Mode Selection (Practice tab root)
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'ModeSelection' }],
      })
    );
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (percentage: number): string => {
    if (percentage >= 90) return '#10B981';
    if (percentage >= 80) return '#3B82F6';
    if (percentage >= 70) return '#F59E0B';
    return '#EF4444';
  };

  const getScoreMessage = (percentage: number): string => {
    if (percentage >= 90) return t('competitive.results.scoreExcellent');
    if (percentage >= 80) return t('competitive.results.scoreGreat');
    if (percentage >= 70) return t('competitive.results.scoreGood');
    if (percentage >= 60) return t('competitive.results.scoreNotBad');
    return t('competitive.results.scoreKeepPracticing');
  };

  if (loading) {
    return (
      <ScreenShell contentStyle={styles.loadingContent}>
        <LoadingSkeleton height={28} width="58%" style={styles.loadingHeaderSkeleton} />
        <LoadingSkeleton height={160} width={160} style={styles.loadingScoreSkeleton} />
        <View style={styles.loadingGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <LoadingSkeleton key={index} height={96} style={styles.loadingStatSkeleton} />
          ))}
        </View>
        <LoadingSkeleton height={132} style={styles.loadingCardSkeleton} />
      </ScreenShell>
    );
  }

  const scoreColor = getScoreColor(score);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StreakCelebrationModal
        milestone={streakMilestone}
        onDismiss={() => setStreakMilestone(null)}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeIn duration={400}>
        <View style={styles.header}>
          <Ionicons name="trophy" size={32} color="#F59E0B" />
          <Text style={styles.headerTitle}>{t('competitive.results.sessionComplete')}</Text>
        </View>
        </FadeIn>

        {/* Score Circle */}
        <FadeIn delay={200} duration={500}>
        <View style={styles.scoreSection}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <AnimatedNumber value={score} suffix="%" style={[styles.scorePercentage, { color: scoreColor }]} duration={800} delay={300} />
            <Text style={styles.scoreLabel}>{t('competitive.results.score')}</Text>
          </View>
          <Text style={styles.scoreMessage}>{getScoreMessage(score)}</Text>
        </View>
        </FadeIn>

        {/* Quick Stats */}
        <Stagger delay={80} initialDelay={500} distance={16}>
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={32} color="#10B981" />
            <AnimatedNumber value={correctCount} style={styles.statValue} duration={600} delay={600} />
            <Text style={styles.statLabel}>{t('competitive.results.correct')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="close-circle" size={32} color="#EF4444" />
            <AnimatedNumber value={incorrectCount} style={styles.statValue} duration={600} delay={700} />
            <Text style={styles.statLabel}>{t('competitive.results.incorrect')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="help-circle" size={32} color="#F59E0B" />
            <AnimatedNumber value={skippedCount} style={styles.statValue} duration={600} delay={800} />
            <Text style={styles.statLabel}>{t('competitive.results.skipped')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={32} color="#3B82F6" />
            <Text style={styles.statValue}>{formatTime(totalTime)}</Text>
            <Text style={styles.statLabel}>{t('competitive.results.time')}</Text>
          </View>
        </View>
        </Stagger>

        {/* Topic Performance */}
        <FadeIn delay={800} duration={400}>
        <View style={styles.section}>
          <SectionHeader
            title={t('competitive.results.topicPerformance')}
            icon="analytics-outline"
            style={styles.sectionHeader}
          />
          <View style={styles.topicsContainer}>
            {topicPerformance.map((topic, index) => (
              <View key={index} style={styles.topicCard}>
                <View style={styles.topicHeader}>
                  <Text style={styles.topicName}>{topic.topic}</Text>
                  <Text style={[
                    styles.topicPercentage,
                    { color: getScoreColor(topic.percentage) }
                  ]}>
                    {topic.percentage}%
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: `${topic.percentage}%`,
                        backgroundColor: getScoreColor(topic.percentage)
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.topicStats}>
                  {t('competitive.results.correctCount', { correct: topic.correct, total: topic.total })}
                </Text>
              </View>
            ))}
          </View>
        </View>

        </FadeIn>

        {/* Focus Recommendation */}
        {topicPerformance.length > 0 && (
          <View style={styles.recommendationCard}>
            <Ionicons name="bulb" size={24} color="#F59E0B" />
            <View style={styles.recommendationContent}>
              <Text style={styles.recommendationTitle}>{t('competitive.results.focusOn')}</Text>
              <Text style={styles.recommendationText}>
                {topicPerformance
                  .filter(t => t.percentage < 70)
                  .map(t => t.topic)
                  .join(', ') || t('competitive.results.keepUpGreatWork')}
              </Text>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <FadeIn delay={1000} duration={400}>
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleReviewAnswers}
          >
            <Ionicons name="list" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>
              {t('competitive.results.reviewAnswers')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleFinish}
          >
            <Text style={styles.primaryButtonText}>{t('competitive.results.finish')}</Text>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        </FadeIn>

        {/* Bottom spacing */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
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
    loadingGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      width: '100%',
    },
    loadingStatSkeleton: {
      borderRadius: borderRadius.lg,
      width: '48%',
    },
    loadingCardSkeleton: {
      borderRadius: borderRadius.lg,
      width: '100%',
    },
    scrollView: {
      flex: 1,
    },
    header: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    headerTitle: {
      fontSize: typography.fontSizes.xxl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    scoreSection: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
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
    },
    statsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    statCard: {
      width: '48%',
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    statValue: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    statLabel: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
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
    sectionHeader: {
      marginBottom: spacing.md,
    },
    topicsContainer: {
      gap: spacing.md,
    },
    topicCard: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    topicHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    topicName: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    topicPercentage: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.bold,
    },
    progressBarContainer: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      marginBottom: spacing.xs,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      borderRadius: 4,
    },
    topicStats: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
    },
    recommendationCard: {
      flexDirection: 'row',
      backgroundColor: '#FEF3C7',
      marginHorizontal: spacing.lg,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    recommendationContent: {
      flex: 1,
    },
    recommendationTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: '#92400E',
      marginBottom: spacing.xs,
    },
    recommendationText: {
      fontSize: typography.fontSizes.sm,
      color: '#92400E',
    },
    actionsContainer: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    secondaryButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryButton: {
      backgroundColor: '#F59E0B',
    },
    actionButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
    },
    primaryButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: '#FFFFFF',
    },
  });
