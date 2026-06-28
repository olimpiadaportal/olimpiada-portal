import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../constants/theme';
import { competitiveSessionService, QuestionResult } from '../services/competitiveSessionService';
import { useTranslation } from 'react-i18next';

// Helper to convert subject name to translation key
const getSubjectTranslationKey = (subjectName: string): string => {
  const mapping: Record<string, string> = {
    'Azerbaijani Language': 'azerbaijaniLanguage',
    'Russian Language': 'russianLanguage',
    'Mathematics': 'mathematics',
    'Physics': 'physics',
    'Chemistry': 'chemistry',
    'Biology': 'biology',
    'History': 'history',
    'Geography': 'geography',
    'Literature': 'literature',
    'English': 'english',
  };
  return mapping[subjectName] || subjectName.toLowerCase().replace(/\s+/g, '');
};

interface SessionDetailsModalProps {
  visible: boolean;
  sessionId: string | null;
  onClose: () => void;
}

export const SessionDetailsModal: React.FC<SessionDetailsModalProps> = ({
  visible,
  sessionId,
  onClose,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [questions, setQuestions] = useState<QuestionResult[]>([]);

  useEffect(() => {
    if (visible && sessionId) {
      loadSessionDetails();
    }
  }, [visible, sessionId]);

  const loadSessionDetails = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const { session: sessionData, questions: questionResults } = 
        await competitiveSessionService.getSessionDetails(sessionId);
      
      setSession(sessionData);
      // Filter out empty/invalid questions - only show questions with actual content
      const validQuestions = (questionResults || []).filter(
        (q) => q.question_text && q.question_text.trim() !== ''
      );
      setQuestions(validQuestions);
    } catch (error) {
      console.error('Failed to load session details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#10B981';
    if (score >= 80) return '#3B82F6';
    if (score >= 70) return '#F59E0B';
    return '#EF4444';
  };

  const renderQuestion = (question: QuestionResult, index: number) => {
    const isCorrect = question.is_correct;
    const wasAnswered = question.student_answer !== null;

    return (
      <View key={question.id} style={styles.questionCard}>
        {/* Question Header */}
        <View style={styles.questionHeader}>
          <View style={styles.questionNumber}>
            <Text style={styles.questionNumberText}>{t('sessionDetails.questionNumber', { number: index + 1 })}</Text>
          </View>
          <View style={[
            styles.resultBadge,
            { backgroundColor: isCorrect ? '#D1FAE5' : wasAnswered ? '#FEE2E2' : '#FEF3C7' }
          ]}>
            <Ionicons 
              name={isCorrect ? 'checkmark-circle' : wasAnswered ? 'close-circle' : 'help-circle'} 
              size={16} 
              color={isCorrect ? '#10B981' : wasAnswered ? '#EF4444' : '#F59E0B'} 
            />
            <Text style={[
              styles.resultText,
              { color: isCorrect ? '#065F46' : wasAnswered ? '#991B1B' : '#92400E' }
            ]}>
              {isCorrect ? t('competitive.review.correct') : wasAnswered ? t('sessionDetails.wrong') : t('competitive.review.skipped')}
            </Text>
          </View>
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.timeText}>{formatTime(question.time_spent_seconds)}</Text>
          </View>
        </View>

        {/* Question Text */}
        <Text style={styles.questionText}>{question.question_text}</Text>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {['A', 'B', 'C', 'D'].map(option => {
            const optionText = question[`option_${option.toLowerCase()}` as keyof QuestionResult] as string;
            const isStudentAnswer = question.student_answer === option;
            const isCorrectAnswer = question.correct_answer === option;

            let optionStyle = styles.option;
            let optionTextStyle = styles.optionText;

            if (isCorrectAnswer) {
              optionStyle = [styles.option, styles.correctOption];
              optionTextStyle = [styles.optionText, styles.correctOptionText];
            } else if (isStudentAnswer && !isCorrect) {
              optionStyle = [styles.option, styles.wrongOption];
              optionTextStyle = [styles.optionText, styles.wrongOptionText];
            }

            return (
              <View key={option} style={optionStyle}>
                <View style={styles.optionLeft}>
                  <View style={[
                    styles.optionBadge,
                    isCorrectAnswer && styles.correctBadge,
                    isStudentAnswer && !isCorrect && styles.wrongBadge,
                  ]}>
                    <Text style={[
                      styles.optionBadgeText,
                      (isCorrectAnswer || (isStudentAnswer && !isCorrect)) && styles.optionBadgeTextActive,
                    ]}>
                      {option}
                    </Text>
                  </View>
                  <Text style={optionTextStyle}>{optionText}</Text>
                </View>
                {isCorrectAnswer && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
                {isStudentAnswer && !isCorrect && (
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                )}
              </View>
            );
          })}
        </View>

        {/* Show correct answer if student was wrong */}
        {!isCorrect && wasAnswered && (
          <View style={styles.correctAnswerHint}>
            <Ionicons name="information-circle" size={16} color="#3B82F6" />
            <Text style={styles.correctAnswerText}>
              {t('sessionDetails.correctAnswer')}: {question.correct_answer}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('sessionDetails.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{t('sessionDetails.loadingDetails')}</Text>
          </View>
        ) : session ? (
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.subjectName}>
                  {session.subject_name ? t(`subjects.${getSubjectTranslationKey(session.subject_name)}`) : t('common.unknown')}
                </Text>
                <Text style={[styles.scoreText, { color: getScoreColor(session.score) }]}>
                  {session.score}%
                </Text>
              </View>

              <View style={styles.summaryStats}>
                <View style={styles.statItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <Text style={styles.statLabel}>{t('competitive.results.correct')}</Text>
                  <Text style={styles.statValue}>{session.correct_answers}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="help-circle" size={20} color="#F59E0B" />
                  <Text style={styles.statLabel}>{t('sessionDetails.total')}</Text>
                  <Text style={styles.statValue}>{questions.length > 0 ? questions.length : session.total_questions}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="time" size={20} color="#3B82F6" />
                  <Text style={styles.statLabel}>{t('sessionDetails.time')}</Text>
                  <Text style={styles.statValue}>{formatTime(session.time_spent_seconds)}</Text>
                </View>
              </View>
            </View>

            {/* Questions List */}
            <View style={styles.questionsSection}>
              <Text style={styles.sectionTitle}>{t('sessionDetails.allQuestions')}</Text>
              {questions.map((question, index) => renderQuestion(question, index))}
            </View>

            {/* Bottom spacing */}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={64} color={colors.border} />
            <Text style={styles.errorText}>Failed to load session details</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
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
    },
    headerTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    closeButton: {
      padding: spacing.xs,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    loadingText: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
    },
    scrollView: {
      flex: 1,
    },
    summaryCard: {
      backgroundColor: colors.card,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    subjectName: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    scoreText: {
      fontSize: typography.fontSizes.xxl,
      fontWeight: typography.fontWeights.bold,
    },
    summaryStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    statItem: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    statLabel: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    statValue: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border,
    },
    questionsSection: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    questionCard: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    questionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    questionNumber: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    questionNumberText: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.bold,
      color: '#FFFFFF',
    },
    resultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
      flex: 1,
    },
    resultText: {
      fontSize: typography.fontSizes.xs,
      fontWeight: typography.fontWeights.semibold,
    },
    timeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    questionText: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      marginBottom: spacing.md,
      lineHeight: 22,
    },
    optionsContainer: {
      gap: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    correctOption: {
      backgroundColor: '#D1FAE5',
      borderColor: '#10B981',
    },
    wrongOption: {
      backgroundColor: '#FEE2E2',
      borderColor: '#EF4444',
    },
    optionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    optionBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    correctBadge: {
      backgroundColor: '#10B981',
    },
    wrongBadge: {
      backgroundColor: '#EF4444',
    },
    optionBadgeText: {
      fontSize: typography.fontSizes.xs,
      fontWeight: typography.fontWeights.bold,
      color: colors.textSecondary,
    },
    optionBadgeTextActive: {
      color: '#FFFFFF',
    },
    optionText: {
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      flex: 1,
    },
    correctOptionText: {
      color: '#065F46',
      fontWeight: typography.fontWeights.semibold,
    },
    wrongOptionText: {
      color: '#991B1B',
    },
    correctAnswerHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      padding: spacing.sm,
      backgroundColor: '#DBEAFE',
      borderRadius: borderRadius.sm,
    },
    correctAnswerText: {
      fontSize: typography.fontSizes.sm,
      color: '#1E40AF',
      fontWeight: typography.fontWeights.medium,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    errorText: {
      fontSize: typography.fontSizes.lg,
      color: colors.textSecondary,
      marginTop: spacing.lg,
    },
  });
