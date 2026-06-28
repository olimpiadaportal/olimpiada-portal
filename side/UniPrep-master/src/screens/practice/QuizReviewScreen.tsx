// Quiz Review Screen
// Dark mode support added - Phase 2

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { practiceService } from '../../services/practiceService';
import { aiExplanationService } from '../../services/aiExplanationService';
import { AIExplanationModal } from '../../components/practice';
import { Card } from '../../components/Card';
import { MaintenanceModal } from '../../components/MaintenanceModal';
import { QuestionFeedbackModal } from '../../components/QuestionFeedbackModal';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

interface QuestionReview {
  id: string;
  session_id: string;
  question_id: string;
  selected_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string | null;
  text_answer?: string | null;
  is_correct: boolean;
  time_spent: number;
  question: {
    id: string;
    question_text: string;
    question_type?: 'mcq' | 'codable_open' | 'written_open';
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    option_e: string;
    correct_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
    explanation?: string;
    difficulty: string;
    subject_name: string;
  };
  correct_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
}

export const QuizReviewScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { sessionId } = route.params as { sessionId: string };
  
  // Feature flag for AI explanations
  const { enabled: aiExplanationsEnabled } = useFeatureFlag('ai_explanations');
  const { isOnline } = useNetworkStatus();
  
  // Check if this is an offline session
  const isOfflineSession = sessionId?.startsWith('offline_');

  const [allReviews, setAllReviews] = useState<QuestionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');
  
  // AI Explanation Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [currentExplanation, setCurrentExplanation] = useState<any>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionReview | null>(null);
  // Question Feedback Modal
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null);
  const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  useEffect(() => {
    loadReviews();
  }, [sessionId]);

  const isReviewSkipped = (review: QuestionReview) => !review.selected_answer && !review.text_answer;

  const reviews = useMemo(() => {
    if (filter === 'correct') {
      return allReviews.filter(review => review.is_correct === true && !isReviewSkipped(review));
    }
    if (filter === 'incorrect') {
      return allReviews.filter(review => review.is_correct === false && !isReviewSkipped(review));
    }
    if (filter === 'skipped') {
      return allReviews.filter(isReviewSkipped);
    }
    return allReviews;
  }, [allReviews, filter]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await practiceService.getQuestionReviews(sessionId, 'all');
      setAllReviews(data);
    } catch (error) {
      console.error('Load reviews error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAskAI = async (review: QuestionReview) => {
    // Set question and open modal with loading state FIRST
    setSelectedQuestion(review);
    setExplanationLoading(true);
    setCurrentExplanation(null);
    setModalVisible(true); // Open modal AFTER setting loading state

    try {
      // Get actual answer text for MCQ questions, not just the letter
      const questionType = (review.question as any).question_type || 'mcq';
      let studentAnswerText = review.text_answer || review.selected_answer || '';
      let correctAnswerText = review.correct_answer || '';
      
      if (questionType === 'mcq' && review.selected_answer) {
        studentAnswerText = (review.question as any)[`option_${review.selected_answer.toLowerCase()}`] || review.selected_answer;
      }
      if (questionType === 'mcq' && review.correct_answer) {
        correctAnswerText = (review.question as any)[`option_${review.correct_answer.toLowerCase()}`] || review.correct_answer;
      }
      
      const response = await aiExplanationService.getExplanation({
        questionId: review.question_id,
        questionText: review.question.question_text,
        studentAnswer: studentAnswerText,
        correctAnswer: correctAnswerText,
        subjectName: review.question.subject_name,
      });

      if (response.success && response.data) {
        console.log('📦 Received explanation data:', JSON.stringify(response.data, null, 2));
        // Set the entire explanation object, not just the explanation field
        setCurrentExplanation(response.data);
      } else {
        // Check if it's a maintenance mode error (not a real error, just disabled)
        if (response.error?.code === 'MAINTENANCE_MODE') {
          console.log('ℹ️ AI Explain is in maintenance mode');
          // Show beautiful maintenance modal
          setMaintenanceMessage(t('ai.maintenance.explain'));
          setMaintenanceModalVisible(true);
          setModalVisible(false);
          setSelectedQuestion(null);
          setExplanationLoading(false);
          return;
        }
        
        // Log actual errors
        console.error('Failed to get explanation:', response.error);
        
        // Keep modal open to show error state for other errors
      }
    } catch (error) {
      console.error('Error getting explanation:', error);
      // Keep modal open to show error state
    } finally {
      setExplanationLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setCurrentExplanation(null);
    setSelectedQuestion(null);
  };

  const renderQuestion = (review: QuestionReview, index: number) => {
    const isCorrect = review.is_correct;
    const questionType = review.question.question_type || 'mcq';
    // A question is skipped if it has neither selected_answer (MCQ) nor text_answer (codable_open)
    const isSkipped = !review.selected_answer && !review.text_answer;
    
    // For codable_open and written_open, answers are text strings
    const userAnswerText = isSkipped 
      ? t('practice.review.skipped')
      : questionType === 'mcq'
        ? review.question[`option_${review.selected_answer?.toLowerCase()}` as keyof typeof review.question] as string
        : (review.text_answer || review.selected_answer || '');
    
    const correctAnswerText = questionType === 'mcq'
      ? review.question[`option_${review.correct_answer.toLowerCase()}` as keyof typeof review.question] as string
      : review.correct_answer;
    
    const questionNumber = (review as { question_number?: number }).question_number || index + 1;

    return (
      <Card key={index} style={styles.questionCard}>
        {/* Header */}
        <View style={styles.questionHeader}>
          <View style={styles.questionNumber}>
            <Text style={styles.questionNumberText}>S{questionNumber}</Text>
          </View>
          <View style={styles.questionMeta}>
            <Text style={styles.subjectName}>{review.question.subject_name}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: isSkipped ? '#FFA500' + '20' : (isCorrect ? colors.success + '20' : colors.error + '20') }
          ]}>
            <Ionicons
              name={isSkipped ? 'remove-circle' : (isCorrect ? 'checkmark-circle' : 'close-circle')}
              size={16}
              color={isSkipped ? '#FFA500' : (isCorrect ? colors.success : colors.error)}
            />
            <Text style={[
              styles.statusText,
              { color: isSkipped ? '#FFA500' : (isCorrect ? colors.success : colors.error) }
            ]}>
              {isSkipped ? t('practice.review.skipped') : (isCorrect ? t('practice.review.correct') : t('practice.review.incorrect'))}
            </Text>
          </View>
          {/* Report issue */}
          <TouchableOpacity
            onPress={() => setFeedbackQuestionId(review.question.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Question Text */}
        <Text style={styles.questionText}>{review.question.question_text}</Text>

        {/* Your Answer */}
        <View style={styles.answerSection}>
          <Text style={styles.answerLabel}>{t('practice.review.yourAnswer')}:</Text>
          <View style={[
            styles.answerBox,
            { 
              backgroundColor: isCorrect ? colors.success + '10' : colors.error + '10',
              borderColor: isCorrect ? colors.success : colors.error,
            }
          ]}>
            {questionType === 'mcq' && (
              <View style={[
                styles.answerCircle,
                { 
                  backgroundColor: isCorrect ? colors.success : colors.error,
                }
              ]}>
                <Text style={styles.answerLetter}>
                  {review.selected_answer || '-'}
                </Text>
              </View>
            )}
            <Text style={styles.answerText}>{userAnswerText}</Text>
          </View>
        </View>

        {/* Skipped Message */}
        {isSkipped && (
          <View style={[styles.answerSection, { marginTop: 8 }]}>
            <Text style={[styles.answerLabel, { color: '#FFA500' }]}>
              {t('practice.review.youSkippedThisQuestion')}
            </Text>
          </View>
        )}

        {/* Correct Answer (if incorrect or skipped) */}
        {(!isCorrect || isSkipped) && (
          <View style={styles.answerSection}>
            <Text style={styles.answerLabel}>{t('practice.review.correctAnswer')}:</Text>
            <View style={[
              styles.answerBox,
              { 
                backgroundColor: colors.success + '10',
                borderColor: colors.success,
              }
            ]}>
              {questionType === 'mcq' && (
                <View style={[
                  styles.answerCircle,
                  { backgroundColor: colors.success }
                ]}>
                  <Text style={styles.answerLetter}>
                    {review.correct_answer}
                  </Text>
                </View>
              )}
              <Text style={styles.answerText}>{correctAnswerText}</Text>
            </View>
          </View>
        )}

        {/* Ask AI Button (for incorrect answers, not skipped) - Controlled by feature flag and requires online */}
        {!isCorrect && !isSkipped && aiExplanationsEnabled && isOnline && !isOfflineSession && (
          <TouchableOpacity 
            style={styles.askAIButton}
            onPress={() => handleAskAI(review)}
            activeOpacity={0.7}
          >
            <Ionicons name="sparkles" size={20} color="#6366F1" />
            <Text style={styles.askAIButtonText}>{t('practice.review.askAI')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#6366F1" />
          </TouchableOpacity>
        )}

        {/* Explanation */}
        {review.question.explanation && (
          <View style={styles.explanationSection}>
            <View style={styles.explanationHeader}>
              <Ionicons name="information-circle" size={16} color={colors.primary} />
              <Text style={styles.explanationLabel}>{t('practice.review.explanation')}</Text>
            </View>
            <Text style={styles.explanationText}>{review.question.explanation}</Text>
          </View>
        )}

        {/* Time Spent */}
        <View style={styles.footer}>
          <View style={styles.timeSpent}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.timeText}>{review.time_spent}s</Text>
          </View>
          <View style={[
            styles.difficultyBadge,
            { 
              backgroundColor: 
                review.question.difficulty === 'easy' ? colors.success + '20' :
                review.question.difficulty === 'medium' ? colors.warning + '20' :
                colors.error + '20'
            }
          ]}>
            <Text style={[
              styles.difficultyText,
              {
                color:
                  review.question.difficulty === 'easy' ? colors.success :
                  review.question.difficulty === 'medium' ? colors.warning :
                  colors.error
              }
            ]}>
              {t(`common.difficulty.${review.question.difficulty}`)}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContent}>
          <LoadingSkeleton height={28} width="50%" style={styles.loadingHeaderSkeleton} />
          <View style={styles.loadingFilterRow}>
            {Array.from({ length: 4 }).map((_, index) => (
              <LoadingSkeleton key={index} height={36} style={styles.loadingFilterSkeleton} />
            ))}
          </View>
          {Array.from({ length: 3 }).map((_, index) => (
            <LoadingSkeleton key={index} height={180} style={styles.loadingQuestionSkeleton} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('practice.review.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            {t('practice.review.all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'correct' && styles.filterTabActive]}
          onPress={() => setFilter('correct')}
        >
          <Text style={[styles.filterText, filter === 'correct' && styles.filterTextActive]}>
            {t('practice.review.correctFilter')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'incorrect' && styles.filterTabActive]}
          onPress={() => setFilter('incorrect')}
        >
          <Text style={[styles.filterText, filter === 'incorrect' && styles.filterTextActive]}>
            {t('practice.review.incorrectFilter')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'skipped' && styles.filterTabActive]}
          onPress={() => setFilter('skipped')}
        >
          <Text style={[styles.filterText, filter === 'skipped' && styles.filterTextActive]}>
            {t('practice.review.skippedFilter')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Questions List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {reviews.map((review, index) => renderQuestion(review, index))}
        
        {reviews.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>{t('practice.review.noQuestionsFound')}</Text>
          </View>
        )}
      </ScrollView>

      {/* AI Explanation Modal */}
      <AIExplanationModal
        visible={modalVisible}
        onClose={handleCloseModal}
        explanation={currentExplanation}
        loading={explanationLoading}
        questionText={selectedQuestion?.question.question_text || ''}
        correctAnswer={selectedQuestion?.correct_answer || ''}
        userAnswer={selectedQuestion?.selected_answer || ''}
      />

      {/* Maintenance Modal */}
      <MaintenanceModal
        visible={maintenanceModalVisible}
        onClose={() => setMaintenanceModalVisible(false)}
        message={maintenanceMessage}
        title={t('ai.maintenance.title')}
      />

      {/* Question Feedback Modal */}
      {feedbackQuestionId && (
        <QuestionFeedbackModal
          visible={!!feedbackQuestionId}
          questionId={feedbackQuestionId}
          onClose={() => setFeedbackQuestionId(null)}
        />
      )}
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
    gap: spacing.md,
  },
  loadingHeaderSkeleton: {
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  loadingFilterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loadingFilterSkeleton: {
    borderRadius: borderRadius.md,
    flex: 1,
  },
  loadingQuestionSkeleton: {
    borderRadius: borderRadius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  questionCard: {
    marginBottom: spacing.md,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  questionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionNumberText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  questionMeta: {
    flex: 1,
  },
  subjectName: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  statusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
  },
  questionText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  answerSection: {
    marginBottom: spacing.md,
  },
  answerLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  answerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  answerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerLetter: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  answerText: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  askAIButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.md,
    gap: 8,
  },
  askAIButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  explanationSection: {
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.info,
    marginBottom: spacing.md,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  explanationLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.info,
    fontWeight: '600',
  },
  explanationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeSpent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  difficultyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  difficultyText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
