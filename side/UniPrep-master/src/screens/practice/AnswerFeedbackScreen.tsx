// Answer Feedback Screen
// Dark mode support added - Phase 2

import React, { useMemo } from 'react';
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
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { usePracticeStore } from '../../store/practiceStore';
import { practiceService } from '../../services/practiceService';
import { analyticsUpdateService } from '../../services/analyticsUpdateService';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { Question } from '../../types/practice';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { typography, spacing, borderRadius } from '../../constants/theme';

export const AnswerFeedbackScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    sessionId,
    mode,
    subjectId,
    questions,
    currentQuestionIndex,
    answers,
    nextQuestion,
    getTotalTimeSpent,
    clearSession,
  } = usePracticeStore();

  const params = route.params as {
    question: Question;
    userAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
    isCorrect: boolean;
    timeSpent: number;
  };

  const { question, userAnswer, isCorrect, timeSpent } = params;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const getOptionText = (key: string): string => {
    const optionMap = {
      A: question.option_a,
      B: question.option_b,
      C: question.option_c,
      D: question.option_d,
      E: question.option_e,
    };
    return optionMap[key as keyof typeof optionMap] ?? key;
  };

  const handleContinue = async () => {
    if (isLastQuestion) {
      // Complete session and show results
      await completeSession();
    } else {
      // Go to next question
      nextQuestion();
      navigation.goBack();
    }
  };

  const completeSession = async () => {
    if (!user?.id || !sessionId) return;

    const finalAnswers = new Map(answers);
    finalAnswers.set(question.id, userAnswer);

    // Calculate results from answered questions only.
    let correctCount = 0;
    finalAnswers.forEach((answer, questionId) => {
      const q = questions.find((q) => q.id === questionId);
      if (q && answer === q.correct_answer) {
        correctCount++;
      }
    });

    const totalTime = getTotalTimeSpent();

    // Save session completion
    await practiceService.completePracticeSession(sessionId, correctCount, totalTime);

    // Keep study_progress ownership in analyticsUpdateService.
    // Quiz mode is processed by QuizResultScreen, so this legacy feedback path
    // only records practice-mode analytics here.
    if (mode === 'practice') {
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError || !student) {
        console.error('Failed to get student ID for practice analytics:', studentError);
      } else {
        await analyticsUpdateService.updateAfterPractice(
          student.id,
          question.subject_id,
          finalAnswers.size,
          correctCount,
          Math.ceil(totalTime / 60),
          'practice'
        );
      }
    }

    if (mode === 'quiz') {
      // Navigate to quiz results - use reset to prevent going back
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            { name: 'ModeSelection' },
            { name: 'QuizResult', params: { sessionId, subjectId: subjectId || question.subject_id, mode } },
          ],
        })
      );
    } else {
      // For practice mode, just go back
      clearSession();
      navigation.navigate('SubjectsList' as never);
    }
  };

  const options = [
    { key: 'A' as const, text: question.option_a },
    { key: 'B' as const, text: question.option_b },
    { key: 'C' as const, text: question.option_c },
    { key: 'D' as const, text: question.option_d },
    { key: 'E' as const, text: question.option_e },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Result Header */}
        <View style={[styles.resultHeader, isCorrect ? styles.correctHeader : styles.incorrectHeader]}>
          <Ionicons
            name={isCorrect ? 'checkmark-circle' : 'close-circle'}
            size={64}
            color={isCorrect ? colors.success : colors.error}
          />
          <Text style={[styles.resultTitle, isCorrect ? styles.correctText : styles.incorrectText]}>
            {isCorrect ? t('practice.feedback.correct') : t('practice.feedback.incorrect')}
          </Text>
          <Text style={styles.resultSubtitle}>
            {t('practice.session.timeRemaining')}: {timeSpent} {t('stats.seconds', 'seconds')}
          </Text>
        </View>

        {/* Question */}
        <Card style={styles.questionCard}>
          <Text style={styles.sectionLabel}>{t('practice.feedback.question')}</Text>
          <Text style={styles.questionText}>{question.question_text}</Text>
        </Card>

        {/* Your Answer */}
        <Card style={styles.answerCard}>
          <Text style={styles.sectionLabel}>{t('practice.feedback.yourAnswer')}</Text>
          <View
            style={[
              styles.answerOption,
              isCorrect ? styles.correctAnswer : styles.incorrectAnswer,
            ]}
          >
            <View
              style={[
                styles.optionCircle,
                isCorrect ? styles.correctCircle : styles.incorrectCircle,
              ]}
            >
              <Text style={styles.optionKey}>{userAnswer}</Text>
            </View>
            <Text style={styles.optionText}>{getOptionText(userAnswer)}</Text>
            <Ionicons
              name={isCorrect ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={isCorrect ? colors.success : colors.error}
            />
          </View>
        </Card>

        {/* Correct Answer (if wrong) */}
        {!isCorrect && (
          <Card style={styles.answerCard}>
            <Text style={styles.sectionLabel}>{t('practice.feedback.correctAnswer')}</Text>
            <View style={[styles.answerOption, styles.correctAnswer]}>
              <View style={[styles.optionCircle, styles.correctCircle]}>
                <Text style={styles.optionKey}>{question.correct_answer}</Text>
              </View>
              <Text style={styles.optionText}>
                {getOptionText(question.correct_answer)}
              </Text>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </View>
          </Card>
        )}

        {/* Explanation */}
        {question.explanation && (
          <Card style={styles.explanationCard}>
            <View style={styles.explanationHeader}>
              <Ionicons name="bulb" size={20} color={colors.warning} />
              <Text style={styles.sectionLabel}>{t('practice.feedback.explanation')}</Text>
            </View>
            <Text style={styles.explanationText}>{question.explanation}</Text>
          </Card>
        )}

        {/* All Options Reference */}
        <Card style={styles.optionsCard}>
          <Text style={styles.sectionLabel}>{t('practice.feedback.allOptions')}</Text>
          {options.map((option) => (
            <View
              key={option.key}
              style={[
                styles.referenceOption,
                option.key === question.correct_answer && styles.referenceOptionCorrect,
                option.key === userAnswer && !isCorrect && styles.referenceOptionWrong,
              ]}
            >
              <Text style={styles.referenceKey}>{option.key}.</Text>
              <Text style={styles.referenceText}>{option.text}</Text>
              {option.key === question.correct_answer && (
                <Ionicons name="checkmark" size={16} color={colors.success} />
              )}
              {option.key === userAnswer && !isCorrect && (
                <Ionicons name="close" size={16} color={colors.error} />
              )}
            </View>
          ))}
        </Card>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          title={isLastQuestion ? (mode === 'quiz' ? t('practice.feedback.finishQuiz') : t('practice.feedback.finish')) : t('practice.feedback.nextQuestion')}
          variant="primary"
          onPress={handleContinue}
          fullWidth
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
  scrollView: {
    flex: 1,
  },
  resultHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  correctHeader: {
    backgroundColor: colors.successLight,
  },
  incorrectHeader: {
    backgroundColor: colors.errorLight,
  },
  resultTitle: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    marginTop: spacing.md,
  },
  correctText: {
    color: colors.success,
  },
  incorrectText: {
    color: colors.error,
  },
  resultSubtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  questionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 24,
  },
  answerCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  answerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
  },
  correctAnswer: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
  },
  incorrectAnswer: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error,
  },
  optionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  correctCircle: {
    backgroundColor: colors.success,
  },
  incorrectCircle: {
    backgroundColor: colors.error,
  },
  optionKey: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: '#FFFFFF',
  },
  optionText: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  explanationCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.warningLight,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  explanationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 22,
  },
  optionsCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  referenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  referenceOptionCorrect: {
    backgroundColor: colors.successLight,
  },
  referenceOptionWrong: {
    backgroundColor: colors.errorLight,
  },
  referenceKey: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginRight: spacing.sm,
    width: 20,
  },
  referenceText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
