import React, { useState } from 'react';
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
import { CompetitiveQuestion } from '../../types/competitive';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { ErrorState, ScreenShell, SectionHeader } from '../../components/ui';

type RouteParams = {
  CompetitiveReview: {
    sessionId: string;
    answers: Array<{
      questionId: string;
      studentAnswer: string;
      timeSpent: number;
    }>;
    questions: CompetitiveQuestion[];
  };
};

export const CompetitiveReviewScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'CompetitiveReview'>>();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { answers, questions } = route.params;
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!questions.length) {
    return (
      <ScreenShell scroll={false} contentStyle={styles.emptyState}>
        <ErrorState
          title={t('competitive.noQuestionsAvailable')}
          actionLabel={t('common.goBack')}
          onAction={() =>
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'ModeSelection' }],
              })
            )
          }
        />
      </ScreenShell>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers.find(a => a.questionId === currentQuestion.id);
  
  const isCorrect = currentAnswer?.studentAnswer === currentQuestion.correct_answer;
  const wasAnswered = !!currentAnswer?.studentAnswer;

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    navigation.goBack(); // Go back to results screen
  };

  const handleFinish = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'ModeSelection' }],
      })
    );
  };

  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return '#10B981';
      case 'medium':
        return '#F59E0B';
      case 'hard':
        return '#EF4444';
      default:
        return colors.textSecondary;
    }
  };

  const getOptionLetter = (index: number): string => {
    return String.fromCharCode(65 + index); // A=65
  };

  const options = [
    { letter: 'A', text: currentQuestion.option_a },
    { letter: 'B', text: currentQuestion.option_b },
    { letter: 'C', text: currentQuestion.option_c },
    { letter: 'D', text: currentQuestion.option_d },
    { letter: 'E', text: currentQuestion.option_e },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('competitive.review.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('competitive.review.questionOf', { current: currentIndex + 1, total: questions.length })}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Question Card */}
        <View style={styles.questionCard}>
          {/* Question Header */}
          <View style={styles.questionHeader}>
            <View style={styles.badges}>
              <View style={[styles.badge, styles.topicBadge]}>
                <Text style={styles.badgeText}>{currentQuestion.topic}</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: getDifficultyColor(currentQuestion.difficulty) },
                ]}
              >
                <Text style={[styles.badgeText, styles.difficultyText]}>
                  {t(`competitive.difficulty.${currentQuestion.difficulty.toLowerCase()}`)}
                </Text>
              </View>
            </View>
          </View>

          {/* Question Text */}
          <Text style={styles.questionText}>{currentQuestion.question_text}</Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {options.map((option) => {
              const isStudentAnswer = currentAnswer?.studentAnswer === option.letter;
              const isCorrectAnswer = currentQuestion.correct_answer === option.letter;

              return (
                <View 
                  key={option.letter} 
                  style={[
                    styles.option,
                    isCorrectAnswer && styles.optionCorrect,
                    isStudentAnswer && !isCorrect && styles.optionIncorrect,
                  ]}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionLetter}>{option.letter}</Text>
                    <Text style={styles.optionText}>{option.text}</Text>
                  </View>
                  <View style={styles.optionIcons}>
                    {isStudentAnswer && (
                      <Ionicons 
                        name="person" 
                        size={20} 
                        color={isCorrect ? '#10B981' : '#EF4444'} 
                      />
                    )}
                    {isCorrectAnswer && (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Result */}
          <View style={styles.resultContainer}>
            {!wasAnswered ? (
              <View style={[styles.resultBadge, styles.skippedBadge]}>
                <Ionicons name="play-skip-forward" size={20} color="#6B7280" />
                <Text style={[styles.resultText, { color: '#6B7280' }]}>
                  {t('competitive.review.skipped')}
                </Text>
              </View>
            ) : isCorrect ? (
              <View style={[styles.resultBadge, styles.correctBadge]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={[styles.resultText, { color: '#10B981' }]}>
                  {t('competitive.review.correct')}
                </Text>
              </View>
            ) : (
              <View style={[styles.resultBadge, styles.incorrectBadge]}>
                <Ionicons name="close-circle" size={20} color="#EF4444" />
                <Text style={[styles.resultText, { color: '#EF4444' }]}>
                  {t('competitive.review.incorrect', { answer: currentQuestion.correct_answer })}
                </Text>
              </View>
            )}
          </View>

          {/* Explanation */}
          <View style={styles.explanationContainer}>
            <SectionHeader
              title={t('competitive.review.explanation')}
              icon="bulb-outline"
              style={styles.explanationHeader}
            />
            <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Navigation Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navButton, styles.secondaryButton]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={currentIndex === 0 ? colors.border : colors.text}
          />
          <Text
            style={[
              styles.navButtonText,
              currentIndex === 0 && styles.disabledText,
            ]}
          >
            {t('competitive.review.previous')}
          </Text>
        </TouchableOpacity>

        {currentIndex === questions.length - 1 ? (
          <TouchableOpacity
            style={[styles.navButton, styles.primaryButton]}
            onPress={handleFinish}
          >
            <Text style={styles.primaryButtonText}>{t('competitive.review.finish')}</Text>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navButton, styles.primaryButton]}
            onPress={handleNext}
          >
            <Text style={styles.primaryButtonText}>{t('competitive.review.next')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
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
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerRight: {
      width: 40,
    },
    headerTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    content: {
      flex: 1,
    },
    questionCard: {
      margin: spacing.lg,
      padding: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    questionHeader: {
      marginBottom: spacing.md,
    },
    badges: {
      flexDirection: 'row',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.sm,
    },
    topicBadge: {
      backgroundColor: colors.primary + '20',
    },
    badgeText: {
      fontSize: typography.fontSizes.xs,
      fontWeight: typography.fontWeights.semibold,
      color: colors.primary,
    },
    difficultyText: {
      color: '#FFFFFF',
    },
    questionText: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      lineHeight: 28,
      marginBottom: spacing.lg,
    },
    optionsContainer: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      backgroundColor: colors.background,
      borderRadius: borderRadius.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    optionCorrect: {
      backgroundColor: '#10B98120',
      borderColor: '#10B981',
    },
    optionIncorrect: {
      backgroundColor: '#EF444420',
      borderColor: '#EF4444',
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.sm,
    },
    optionLetter: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      minWidth: 24,
    },
    optionText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      color: colors.text,
      lineHeight: 22,
    },
    optionIcons: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    resultContainer: {
      marginBottom: spacing.lg,
    },
    resultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
    correctBadge: {
      backgroundColor: '#10B98120',
    },
    incorrectBadge: {
      backgroundColor: '#EF444420',
    },
    skippedBadge: {
      backgroundColor: colors.background,
    },
    resultText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
    },
    explanationContainer: {
      padding: spacing.md,
      backgroundColor: colors.background,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: '#F59E0B40',
    },
    explanationHeader: {
      marginBottom: spacing.sm,
    },
    explanationTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    explanationText: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      lineHeight: 22,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    navButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
      flex: 1,
    },
    secondaryButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    primaryButton: {
      backgroundColor: '#F59E0B',
    },
    navButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    primaryButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: '#FFFFFF',
    },
    disabledText: {
      color: colors.border,
    },
  });
