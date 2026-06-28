import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { CompetitiveQuestion } from '../../types/competitive';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { competitiveCache } from '../../services/competitiveCache';
import i18n from '../../i18n';
import { useAlert } from '../../components/AlertProvider';
import { ErrorState, LoadingState, ScreenShell, SectionHeader } from '../../components/ui';

type RouteParams = {
  CompetitiveQuiz: {
    sessionId: string;
    subjectName: string;
  };
};

export const CompetitiveQuizScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'CompetitiveQuiz'>>();
  const { colors } = useTheme();
  const { showError, showConfirm } = useAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { sessionId, subjectName } = route.params;
  const [questions, setQuestions] = useState<CompetitiveQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Load questions from temp storage on mount
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        console.log('📦 Loading questions from temp storage for session:', sessionId);
        const tempQuestions = await competitiveCache.getTempQuestions(sessionId);
        
        if (tempQuestions && tempQuestions.length > 0) {
          console.log('✅ Loaded questions:', {
            count: tempQuestions.length,
            firstQuestion: tempQuestions[0],
          });
          setQuestions(tempQuestions);
        } else {
          console.error('❌ No questions found in temp storage!');
          showError(i18n.t('common.error'), i18n.t('common.tryAgain'), () => navigation.goBack());
        }
      } catch (error) {
        console.error('❌ Failed to load questions:', error);
        showError(i18n.t('common.error'), i18n.t('common.tryAgain'), () => navigation.goBack());
      } finally {
        setLoading(false);
      }
    };

    loadQuestions();
  }, [sessionId]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionTimes, setQuestionTimes] = useState<Record<string, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [showPalette, setShowPalette] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [totalTime, setTotalTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitInFlightRef = useRef(false);
  const submitPromptOpenRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length;

  useEffect(() => {
    // Start timer for current question
    const questionStartTime = Date.now();
    
    return () => {
      // Save time spent on this question when moving away
      if (currentQuestion) {
        const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
        setQuestionTimes(prev => ({
          ...prev,
          [currentQuestion.id]: (prev[currentQuestion.id] || 0) + timeSpent,
        }));
      }
    };
  }, [currentIndex]);

  useEffect(() => {
    // Only start timer if questions are loaded
    if (questions.length === 0 || loading) return;

    // Update total time every second
    timerRef.current = setInterval(() => {
      setTotalTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [startTime, questions.length, loading]);

  const handleAnswer = (answer: string) => {
    if (submitting) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const toggleMarkForReview = () => {
    if (!currentQuestion) return;
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentQuestion.id)) {
        newSet.delete(currentQuestion.id);
      } else {
        newSet.add(currentQuestion.id);
      }
      return newSet;
    });
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };


  const handleSubmit = () => {
    if (submitInFlightRef.current || submitPromptOpenRef.current) return;

    const unanswered = questions.length - answeredCount;
    
    if (unanswered > 0) {
      submitPromptOpenRef.current = true;
      showConfirm(
        i18n.t('competitive.submitQuiz'),
        i18n.t('competitive.unansweredQuestions', { count: unanswered }),
        submitQuiz,
        () => {
          submitPromptOpenRef.current = false;
        },
        i18n.t('competitive.submit'),
        i18n.t('common.cancel')
      );
    } else {
      submitQuiz();
    }
  };

  const submitQuiz = () => {
    if (submitInFlightRef.current) return;
    submitPromptOpenRef.current = false;
    submitInFlightRef.current = true;
    setSubmitting(true);

    // Prepare answers for submission
    const submissionData = Object.entries(answers).map(([questionId, studentAnswer]) => ({
      questionId,
      studentAnswer,
      timeSpent: questionTimes[questionId] || 0,
    }));

    // Navigate to results
    // @ts-ignore - Complex navigation typing
    navigation.navigate('CompetitiveResults' as never, {
      sessionId,
      answers: submissionData,
      totalTime,
      questions, // Pass questions for review
    } as never);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExit = () => {
    showConfirm(
      i18n.t('competitive.exitQuiz'),
      i18n.t('competitive.exitQuizWarning'),
      () => {
        // Reset to Mode Selection (Practice tab root)
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'ModeSelection' }],
          })
        );
      },
      undefined,
      i18n.t('common.exit'),
      i18n.t('common.cancel')
    );
  };

  if (loading) {
    return (
      <ScreenShell scroll={false} contentStyle={styles.centerState}>
        <LoadingState title={i18n.t('competitive.loadingQuestions')} />
      </ScreenShell>
    );
  }

  if (questions.length === 0) {
    return (
      <ScreenShell scroll={false} contentStyle={styles.centerState}>
        <ErrorState
          title={i18n.t('competitive.noQuestionsAvailable')}
          actionLabel={i18n.t('common.goBack')}
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExit} style={styles.exitButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <SectionHeader
            title={subjectName}
            subtitle={i18n.t('competitive.questionNumber', { current: currentIndex + 1, total: questions.length })}
            icon="sparkles-outline"
            style={styles.headerTitle}
          />
        </View>
        <View style={styles.headerRight}>
          <View style={styles.timerContainer}>
            <Ionicons name="time-outline" size={20} color={colors.primary} />
            <Text style={styles.timerText}>{formatTime(totalTime)}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowPalette(!showPalette)} style={styles.paletteButton}>
            <Ionicons name="grid" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {i18n.t('competitive.answeredCount', { answered: answeredCount, total: questions.length })}
      </Text>

      {/* Question Navigator Palette */}
      {showPalette && (
        <View style={styles.palette}>
          <Text style={styles.paletteTitle}>{i18n.t('exams.session.questionNavigator')}</Text>
          <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.paletteGrid}>
              {questions.map((q, index) => {
                const isMarked = markedForReview.has(q.id);
                const hasAnswer = answers[q.id] !== undefined;
                const status = isMarked ? 'marked' : hasAnswer ? 'answered' : 'unanswered';
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={[
                      styles.paletteItem,
                      index === currentIndex && styles.paletteItemCurrent,
                      status === 'answered' && styles.paletteItemAnswered,
                      status === 'marked' && styles.paletteItemMarked,
                    ]}
                    onPress={() => {
                      setCurrentIndex(index);
                      setShowPalette(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.paletteItemText,
                        (index === currentIndex || status === 'answered' || status === 'marked') &&
                          styles.paletteItemTextActive,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.paletteItemAnswered]} />
              <Text style={styles.legendText}>{i18n.t('practice.navigator.answered')} ({answeredCount})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.paletteItemMarked]} />
              <Text style={styles.legendText}>{i18n.t('practice.navigator.marked')} ({markedForReview.size})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { borderColor: colors.border, borderWidth: 1 }]} />
              <Text style={styles.legendText}>{i18n.t('practice.navigator.unanswered')} ({questions.length - answeredCount})</Text>
            </View>
          </View>
        </View>
      )}

      {/* Question */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.questionContainer}>
          <View style={styles.topicBadge}>
            <Text style={styles.topicText}>{currentQuestion.topic}</Text>
            <View style={[
              styles.difficultyBadge,
              { backgroundColor: getDifficultyColor(currentQuestion.difficulty) }
            ]}>
              <Text style={styles.difficultyText}>
                {i18n.t(`competitive.${currentQuestion.difficulty}`)}
              </Text>
            </View>
          </View>

          <Text style={styles.questionText}>{currentQuestion.question_text}</Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {['A', 'B', 'C', 'D', 'E'].map((option) => {
              const optionKey = `option_${option.toLowerCase()}` as keyof CompetitiveQuestion;
              const optionText = currentQuestion[optionKey] as string;
              const isSelected = answers[currentQuestion.id] === option;

              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    isSelected && styles.optionButtonSelected,
                  ]}
                  onPress={() => handleAnswer(option)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.optionCircle,
                    isSelected && styles.optionCircleSelected,
                  ]}>
                    {isSelected && (
                      <View style={styles.optionCircleInner} />
                    )}
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionLabel}>{option}</Text>
                    <Text style={styles.optionText}>{optionText}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Mark for Review Button */}
        <TouchableOpacity 
          style={styles.markButton} 
          onPress={toggleMarkForReview}
        >
          <Ionicons
            name={currentQuestion && markedForReview.has(currentQuestion.id) ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={currentQuestion && markedForReview.has(currentQuestion.id) ? colors.warning : colors.textSecondary}
          />
          <Text style={styles.markButtonText}>
            {currentQuestion && markedForReview.has(currentQuestion.id) 
              ? i18n.t('exams.session.markedForReview') 
              : i18n.t('exams.session.markForReview')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Navigation Footer */}
      <View style={styles.footer}>
        {/* Top Row: Previous and Next/Submit */}
        <View style={styles.footerTopRow}>
          <TouchableOpacity
            style={[
              styles.footerButton,
              styles.secondaryButton,
              (currentIndex === 0 || submitting) && styles.disabledButton,
            ]}
            onPress={handlePrevious}
            disabled={currentIndex === 0 || submitting}
          >
            <Ionicons 
              name="chevron-back" 
              size={20} 
              color={currentIndex === 0 ? colors.border : colors.text} 
            />
            <Text style={[
              styles.footerButtonText,
              currentIndex === 0 && styles.disabledText
            ]}>
              {i18n.t('competitive.previous')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.footerButton,
              styles.primaryButton,
              styles.primaryFooterButton,
              submitting && styles.disabledButton,
            ]}
            onPress={currentIndex === questions.length - 1 ? handleSubmit : handleNext}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>
                  {currentIndex === questions.length - 1 ? i18n.t('competitive.submitQuizButton') : i18n.t('competitive.nextQuestion')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {currentIndex < questions.length - 1 && (
          <TouchableOpacity
            style={[
              styles.footerButton,
              styles.secondaryButton,
              styles.fullWidthButton,
              submitting && styles.disabledButton,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Ionicons name="checkmark-done-outline" size={20} color={colors.text} />
            <Text style={styles.footerButtonText}>
              {i18n.t('practice.session.finish')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
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
      return '#6B7280';
  }
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerState: {
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
    exitButton: {
      padding: spacing.xs,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      flex: 1,
      marginBottom: 0,
    },
    subjectName: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    questionCounter: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      marginTop: 2,
    },
    timerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    timerText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.primary,
    },
    progressBarContainer: {
      height: 4,
      backgroundColor: colors.border,
    },
    progressBar: {
      height: '100%',
      backgroundColor: '#F59E0B',
    },
    progressText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.sm,
    },
    scrollView: {
      flex: 1,
    },
    questionContainer: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      margin: spacing.md,
      padding: spacing.md,
    },
    topicBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
      gap: spacing.xs,
    },
    topicText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: typography.fontWeights.medium,
    },
    difficultyBadge: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: 3,
    },
    difficultyText: {
      fontSize: 10,
      color: '#FFFFFF',
      fontWeight: typography.fontWeights.semibold,
      textTransform: 'capitalize',
    },
    questionText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.medium,
      color: colors.text,
      lineHeight: 24,
      marginBottom: spacing.md,
    },
    optionsContainer: {
      gap: 6,
    },
    optionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    optionButtonSelected: {
      borderColor: '#F59E0B',
      backgroundColor: colors.warningLight,
    },
    optionCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    optionCircleSelected: {
      borderColor: '#F59E0B',
    },
    optionCircleInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#F59E0B',
    },
    optionContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    optionLabel: {
      fontSize: 13,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      minWidth: 20,
    },
    optionText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    footer: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.xs,
      backgroundColor: colors.background,
    },
    footerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    footerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.xs,
    },
    secondaryButton: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      flex: 1,
    },
    primaryButton: {
      backgroundColor: '#F59E0B',
    },
    primaryFooterButton: {
      flex: 1,
    },
    fullWidthButton: {
      flex: 0,
      minHeight: 44,
      width: '100%',
    },
    footerButtonText: {
      fontSize: 14,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      flexShrink: 0,
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: typography.fontWeights.semibold,
      color: '#FFFFFF',
    },
    disabledText: {
      color: colors.border,
    },
    disabledButton: {
      opacity: 0.6,
    },
    markButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: colors.surfaceVariant,
      borderRadius: borderRadius.md,
      gap: spacing.sm,
    },
    markButtonText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      fontWeight: typography.fontWeights.medium,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    paletteButton: {
      padding: spacing.xs,
    },
    palette: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      maxHeight: 300,
    },
    paletteTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    paletteScroll: {
      maxHeight: 180,
    },
    paletteGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    paletteItem: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.sm,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    paletteItemCurrent: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    paletteItemAnswered: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    paletteItemMarked: {
      backgroundColor: colors.warning,
      borderColor: colors.warning,
    },
    paletteItemText: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.medium,
      color: colors.text,
    },
    paletteItemTextActive: {
      color: '#FFFFFF',
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    legendBox: {
      width: 16,
      height: 16,
      borderRadius: 4,
    },
    legendText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
  });
