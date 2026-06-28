// Exam Review Screen
// Dark mode support added - Phase 3

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { mockExamService } from '../../services/mockExamService';
import { aiExplanationService } from '../../services/aiExplanationService';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { QuestionReview } from '../../types/mockExam';
import { Card } from '../../components/Card';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AIExplanationModal } from '../../components/practice';
import { QuestionFeedbackModal } from '../../components/QuestionFeedbackModal';
import { ContextFlipCard } from '../../components/ContextFlipCard';
import { typography, spacing, borderRadius } from '../../constants/theme';

export const ExamReviewScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { attemptId } = route.params as { attemptId: string };

  const [allReviews, setAllReviews] = useState<QuestionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'skipped'>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionReview | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<any>(null);
  // Question Feedback Modal
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [imageLoadingStates, setImageLoadingStates] = useState<{[key: string]: boolean}>({});
  const [imageErrorStates, setImageErrorStates] = useState<{[key: string]: boolean}>({});
  const [fadeAnims] = useState<{[key: string]: Animated.Value}>({});

  useEffect(() => {
    loadReviews();
  }, [attemptId]);

  const reviews = useMemo(() => {
    if (filter === 'correct') {
      return allReviews.filter(review => review.is_correct === true && !review.is_skipped);
    }
    if (filter === 'incorrect') {
      return allReviews.filter(review => review.is_correct === false && !review.is_skipped);
    }
    if (filter === 'skipped') {
      return allReviews.filter(review => review.is_skipped);
    }
    return allReviews;
  }, [allReviews, filter]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await mockExamService.getQuestionReviews(attemptId, 'all');
      setAllReviews(data);
    } catch (error) {
      console.error('Load reviews error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAskAI = async (review: QuestionReview) => {
    setSelectedQuestion(review);
    setExplanationLoading(true);
    setCurrentExplanation(null);
    setModalVisible(true);

    try {
      // Get actual answer text for MCQ questions, not just the letter
      const questionType = (review.question as any).question_type || 'mcq';
      let studentAnswerText: string = review.user_answer || '';
      let correctAnswerText: string = review.correct_answer || '';

      if (questionType === 'mcq' && review.user_answer) {
        studentAnswerText = review.question[`option_${review.user_answer.toLowerCase()}` as keyof typeof review.question] as string || review.user_answer;
      }
      if (questionType === 'mcq' && review.correct_answer) {
        correctAnswerText = review.question[`option_${review.correct_answer.toLowerCase()}` as keyof typeof review.question] as string || review.correct_answer;
      }

      // For open questions, use the student's text answer and expected answer (if any)
      if (questionType !== 'mcq') {
        studentAnswerText = (review as any).text_answer || review.user_answer || '';
        correctAnswerText = (review.question as any).expected_answer
          || (review.question as any).grading_rubric
          || '';
      }
      
      const response = await aiExplanationService.getExplanation({
        questionId: review.question.id,
        questionText: review.question.question_text,
        studentAnswer: studentAnswerText,
        correctAnswer: correctAnswerText,
        subjectName: review.question.subject_name,
      });

      if (response.success && response.data) {
        setCurrentExplanation(response.data);
      } else {
        console.error('Failed to get explanation:', response.error);
      }
    } catch (error) {
      console.error('Error getting explanation:', error);
    } finally {
      setExplanationLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setCurrentExplanation(null);
    setSelectedQuestion(null);
  };

  const renderLoadingReviews = () => (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {[1, 2, 3].map((item) => (
        <Card key={item} style={styles.questionCard}>
          <View style={styles.reviewSkeletonHeader}>
            <LoadingSkeleton width={36} height={36} borderRadius={18} />
            <View style={styles.reviewSkeletonTitle}>
              <LoadingSkeleton width="48%" height={16} />
              <LoadingSkeleton width="32%" height={14} style={styles.skeletonLine} />
            </View>
            <LoadingSkeleton width={86} height={30} borderRadius={borderRadius.full} />
          </View>
          <LoadingSkeleton width="88%" height={22} style={styles.skeletonLine} />
          <LoadingSkeleton width="72%" height={22} style={styles.skeletonLine} />
          <LoadingSkeleton width="100%" height={64} borderRadius={borderRadius.md} style={styles.skeletonBlock} />
          <LoadingSkeleton width="100%" height={64} borderRadius={borderRadius.md} style={styles.skeletonBlock} />
        </Card>
      ))}
    </ScrollView>
  );

  const renderQuestion = (review: QuestionReview, index: number, visibleReviews: QuestionReview[]) => {
    const isSkipped = review.is_skipped;
    const isCorrect = !isSkipped && review.is_correct === true;
    const isPending = !isSkipped && review.is_correct === null; // Open questions pending grading
    const questionType = (review.question as any).question_type || 'mcq';
    
    // Handle different question types for answer display
    let userAnswerText: string | undefined;
    let correctAnswerText: string | undefined;
    
    if (questionType === 'mcq') {
      // MCQ: Get option text from option_a, option_b, etc.
      userAnswerText = review.user_answer 
        ? review.question[`option_${review.user_answer.toLowerCase()}` as keyof typeof review.question] as string
        : t('exams.review.skipped');
      correctAnswerText = review.correct_answer
        ? review.question[`option_${review.correct_answer.toLowerCase()}` as keyof typeof review.question] as string
        : undefined;
    } else {
      // Open questions: Show text answer directly
      userAnswerText = (review as any).text_answer || t('exams.review.skipped');
      correctAnswerText = (review.question as any).expected_answer || (review.question as any).sample_answer;
    }

    // Determine status color and icon
    let statusColor: string;
    let statusIcon: string;
    let statusText: string;
    
    if (isSkipped) {
      statusColor = '#FFA500'; // Orange
      statusIcon = 'remove-circle';
      statusText = t('exams.review.skipped');
    } else if (isPending) {
      statusColor = '#F59E0B'; // Amber/Yellow
      statusIcon = 'time-outline';
      statusText = t('exams.review.pendingGrading');
    } else if (isCorrect) {
      statusColor = colors.success;
      statusIcon = 'checkmark-circle';
      statusText = t('exams.review.correct');
    } else {
      statusColor = colors.error;
      statusIcon = 'close-circle';
      statusText = t('exams.review.incorrect');
    }

    return (
      <Card key={index} style={styles.questionCard}>
        {/* Header */}
        <View style={styles.questionHeader}>
          <View style={styles.questionNumber}>
            <Text style={styles.questionNumberText}>
              {t('common.questionPrefix')}{review.question.question_order || index + 1}
            </Text>
          </View>
          <View style={styles.questionMeta}>
            <Text style={styles.subjectName}>{review.question.subject_name}</Text>
            {review.was_marked && (
              <Ionicons name="bookmark" size={16} color={colors.warning} />
            )}
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: statusColor + '20' }
          ]}>
            <Ionicons
              name={statusIcon as any}
              size={16}
              color={statusColor}
            />
            <Text style={[
              styles.statusText,
              { color: statusColor }
            ]}>
              {statusText}
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

        {/* Context card for written_open group questions — shown once per group */}
        {questionType === 'written_open' && review.question.context_text &&
          (index === 0 || visibleReviews[index - 1]?.question?.group_id !== review.question.group_id) && (
          <ContextFlipCard
            contextText={review.question.context_text}
            contextImageUrl={(review.question as any).context_image_url}
            groupOrder={(review.question as any).group_order}
            labelText={`📝 ${t('exams.review.situationContext') || 'Situasiya'}`}
            tapToSeeImageText={t('exams.review.tapToSeeImage') || 'Şəkli görmək üçün toxun'}
            tapToSeeTextText={t('exams.review.tapToSeeText') || 'Mətni görmək üçün toxun'}
          />
        )}

        {/* Question Text */}
        <Text style={styles.questionText}>{review.question.question_text}</Text>

        {/* Question Image */}
        {review.question.question_image_url && (
          <View style={styles.imageContainer}>
            {imageLoadingStates[review.question.id] && (
              <View style={styles.imageLoadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.imageLoadingText}>Loading image...</Text>
              </View>
            )}
            {imageErrorStates[review.question.id] ? (
              <View style={styles.imageErrorContainer}>
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                <Text style={styles.imageErrorText}>Failed to load image</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={() => {
                    setImageErrorStates(prev => ({ ...prev, [review.question.id]: false }));
                    setImageLoadingStates(prev => ({ ...prev, [review.question.id]: true }));
                  }}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Animated.View style={{ opacity: fadeAnims[review.question.id] || 1 }}>
                <Image
                  source={{ uri: review.question.question_image_url }}
                  style={styles.questionImage}
                  resizeMode="contain"
                  onLoadStart={() => {
                    if (!fadeAnims[review.question.id]) {
                      fadeAnims[review.question.id] = new Animated.Value(0);
                    }
                    setImageLoadingStates(prev => ({ ...prev, [review.question.id]: true }));
                  }}
                  onLoadEnd={() => {
                    setImageLoadingStates(prev => ({ ...prev, [review.question.id]: false }));
                    if (fadeAnims[review.question.id]) {
                      Animated.timing(fadeAnims[review.question.id], {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                      }).start();
                    }
                  }}
                  onError={() => {
                    setImageLoadingStates(prev => ({ ...prev, [review.question.id]: false }));
                    setImageErrorStates(prev => ({ ...prev, [review.question.id]: true }));
                  }}
                />
              </Animated.View>
            )}
          </View>
        )}

        {/* Your Answer */}
        <View style={styles.answerSection}>
          <Text style={styles.answerLabel}>{t('exams.review.yourAnswer')}:</Text>
          {questionType === 'mcq' ? (
            <View style={[
              styles.answerBox,
              { 
                backgroundColor: isSkipped ? '#FFA500' + '10' : (isCorrect ? colors.success + '10' : colors.error + '10'),
                borderColor: isSkipped ? '#FFA500' : (isCorrect ? colors.success : colors.error),
              }
            ]}>
              <View style={[
                styles.answerCircle,
                { 
                  backgroundColor: isSkipped ? '#FFA500' : (isCorrect ? colors.success : colors.error),
                }
              ]}>
                <Text style={styles.answerLetter}>
                  {review.user_answer || '—'}
                </Text>
              </View>
              <Text style={styles.answerText}>{userAnswerText || ''}</Text>
            </View>
          ) : (
            <View style={[
              styles.answerBox,
              { 
                backgroundColor: isSkipped ? '#FFA500' + '10' : colors.surface,
                borderColor: isSkipped ? '#FFA500' : colors.border,
                flexDirection: 'column',
                alignItems: 'flex-start',
              }
            ]}>
              <Text style={[styles.answerText, { flex: 0 }]}>
                {userAnswerText || t('exams.review.skipped')}
              </Text>
            </View>
          )}
        </View>

        {/* Skipped Message */}
        {isSkipped && (
          <View style={[styles.answerSection, { marginTop: 8 }]}>
            <Text style={[styles.answerLabel, { color: '#FFA500' }]}>
              {t('exams.review.youSkippedThisQuestion')}
            </Text>
          </View>
        )}

        {/* Correct Answer (if incorrect or skipped) - Only for MCQ */}
        {questionType === 'mcq' && (!isCorrect || isSkipped) && review.correct_answer && (
          <View style={styles.answerSection}>
            <Text style={styles.answerLabel}>{t('exams.review.correctAnswer')}:</Text>
            <View style={[
              styles.answerBox,
              { 
                backgroundColor: colors.success + '10',
                borderColor: colors.success,
              }
            ]}>
              <View style={[
                styles.answerCircle,
                { backgroundColor: colors.success }
              ]}>
                <Text style={styles.answerLetter}>{review.correct_answer}</Text>
              </View>
              <Text style={styles.answerText}>{correctAnswerText || ''}</Text>
            </View>
          </View>
        )}
        
        {/* Expected Answer for Open Questions (if available) */}
        {questionType !== 'mcq' && correctAnswerText && (
          <View style={styles.answerSection}>
            <Text style={styles.answerLabel}>{t('exams.review.correctAnswer')}:</Text>
            <View style={[
              styles.answerBox,
              { 
                backgroundColor: colors.success + '10',
                borderColor: colors.success,
                flexDirection: 'column',
                alignItems: 'flex-start',
              }
            ]}>
              <Text style={[styles.answerText, { flex: 0 }]}>{correctAnswerText}</Text>
            </View>
          </View>
        )}

        {/* Ask AI Button (for incorrect MCQ/codable_open only — written_open is graded by AI already) */}
        {!isCorrect && !isSkipped && !isPending && questionType !== 'written_open' && (
          <TouchableOpacity
            style={styles.askAIButton}
            onPress={() => handleAskAI(review)}
          >
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <Text style={styles.askAIText}>{t('exams.review.askAI')}</Text>
          </TouchableOpacity>
        )}

        {/* Explanation (for MCQ questions) */}
        {(review.question as any).explanation && (
          <View style={styles.explanationSection}>
            <View style={styles.explanationHeader}>
              <Ionicons name="bulb" size={16} color={colors.warning} />
              <Text style={styles.explanationLabel}>{t('exams.review.explanation')}</Text>
            </View>
            <Text style={styles.explanationText}>{(review.question as any).explanation}</Text>
          </View>
        )}

        {/* AI Explanation (for open questions with AI grading) */}
        {review.ai_explanation && (() => {
          try {
            const aiData = JSON.parse(review.ai_explanation);
            return (
              <View style={styles.aiExplanationSection}>
                <View style={styles.aiExplanationHeader}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                  <Text style={styles.aiExplanationLabel}>{t('exams.review.aiGrading')}</Text>
                </View>
                
                {/* AI Explanation */}
                {aiData.explanation && (
                  <View style={styles.aiExplanationBlock}>
                    <Text style={styles.aiExplanationTitle}>{t('exams.review.explanation')}:</Text>
                    <Text style={styles.aiExplanationText}>{aiData.explanation}</Text>
                  </View>
                )}
                
                {/* AI Feedback */}
                {aiData.feedback && (
                  <View style={styles.aiExplanationBlock}>
                    <Text style={styles.aiExplanationTitle}>{t('exams.review.feedback')}:</Text>
                    <Text style={styles.aiExplanationText}>{aiData.feedback}</Text>
                  </View>
                )}
                
                {/* Matched Keywords */}
                {aiData.matched_keywords && aiData.matched_keywords.length > 0 && (
                  <View style={styles.aiExplanationBlock}>
                    <Text style={styles.aiExplanationTitle}>{t('exams.review.matchedKeywords')}:</Text>
                    <View style={styles.keywordsContainer}>
                      {aiData.matched_keywords.map((keyword: string, idx: number) => (
                        <View key={idx} style={[styles.keywordBadge, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
                          <Text style={[styles.keywordText, { color: colors.success }]}>{keyword}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                
                {/* Missing Concepts */}
                {aiData.missing_concepts && aiData.missing_concepts.length > 0 && (
                  <View style={styles.aiExplanationBlock}>
                    <Text style={styles.aiExplanationTitle}>{t('exams.review.missingConcepts')}:</Text>
                    <View style={styles.keywordsContainer}>
                      {aiData.missing_concepts.map((concept: string, idx: number) => (
                        <View key={idx} style={[styles.keywordBadge, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
                          <Text style={[styles.keywordText, { color: colors.error }]}>{concept}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          } catch (e) {
            // If JSON parsing fails, just show raw text
            return (
              <View style={styles.aiExplanationSection}>
                <View style={styles.aiExplanationHeader}>
                  <Ionicons name="sparkles" size={16} color={colors.primary} />
                  <Text style={styles.aiExplanationLabel}>{t('exams.review.aiGrading')}</Text>
                </View>
                <Text style={styles.aiExplanationText}>{review.ai_explanation}</Text>
              </View>
            );
          }
        })()}

        {/* Time Spent */}
        <View style={styles.timeSpent}>
          <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.timeText}>
            {Math.floor(review.time_spent_seconds / 60)}:{(review.time_spent_seconds % 60).toString().padStart(2, '0')}
          </Text>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('exams.review.title')}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Filter */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]} numberOfLines={2}>
            {t('exams.review.all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'correct' && styles.filterButtonActive]}
          onPress={() => setFilter('correct')}
        >
          <Ionicons 
            name="checkmark-circle" 
            size={16} 
            color={filter === 'correct' ? '#FFFFFF' : colors.success} 
          />
          <Text style={[styles.filterText, filter === 'correct' && styles.filterTextActive]} numberOfLines={2}>
            {t('exams.review.correct')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'incorrect' && styles.filterButtonActive]}
          onPress={() => setFilter('incorrect')}
        >
          <Ionicons 
            name="close-circle" 
            size={16} 
            color={filter === 'incorrect' ? '#FFFFFF' : colors.error} 
          />
          <Text style={[styles.filterText, filter === 'incorrect' && styles.filterTextActive]} numberOfLines={2}>
            {t('exams.review.incorrect')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'skipped' && styles.filterButtonActive]}
          onPress={() => setFilter('skipped')}
        >
          <Ionicons 
            name="remove-circle" 
            size={16} 
            color={filter === 'skipped' ? '#FFFFFF' : '#FFA500'} 
          />
          <Text style={[styles.filterText, filter === 'skipped' && styles.filterTextActive]} numberOfLines={2}>
            {t('exams.review.skipped')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Questions List */}
      {loading ? (
        renderLoadingReviews()
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {reviews.map((review, index) => renderQuestion(review, index, reviews))}
        </ScrollView>
      )}

      {/* AI Explanation Modal */}
      <AIExplanationModal
        visible={modalVisible}
        onClose={handleCloseModal}
        explanation={currentExplanation}
        loading={explanationLoading}
        questionText={selectedQuestion?.question.question_text || ''}
        correctAnswer={selectedQuestion?.correct_answer || ''}
        userAnswer={selectedQuestion?.user_answer || ''}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  placeholder: {
    width: 44,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    lineHeight: 14,
    textAlign: 'center',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  questionCard: {
    marginBottom: spacing.lg,
  },
  reviewSkeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reviewSkeletonTitle: {
    flex: 1,
  },
  skeletonLine: {
    marginTop: spacing.sm,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  questionNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionNumberText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: '#FFFFFF',
  },
  questionMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subjectName: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  questionText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  imageContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceVariant,
  },
  questionImage: {
    width: '100%',
    height: 250,
    backgroundColor: colors.surfaceVariant,
  },
  imageLoadingContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  imageLoadingText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  imageErrorContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceVariant,
    padding: spacing.lg,
  },
  imageErrorText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  retryButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: typography.fontWeights.semibold,
  },
  answerSection: {
    marginBottom: spacing.md,
  },
  answerLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  answerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
  },
  answerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerLetter: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: '#FFFFFF',
  },
  answerText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  askAIButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  askAIText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.primary,
  },
  explanationSection: {
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
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
    color: colors.warning,
    fontWeight: typography.fontWeights.semibold,
  },
  explanationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  aiExplanationSection: {
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    marginBottom: spacing.md,
  },
  aiExplanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  aiExplanationLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  aiExplanationBlock: {
    marginBottom: spacing.sm,
  },
  aiExplanationTitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  aiExplanationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  keywordBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  keywordText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
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
});
