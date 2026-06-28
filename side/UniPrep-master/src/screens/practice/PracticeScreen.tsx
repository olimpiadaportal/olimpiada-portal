// Practice Screen
// Dark mode support added - Phase 2

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePracticeStore } from '../../store/practiceStore';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { practiceService } from '../../services/practiceService';
import { offlineService } from '../../services/offlineService';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useAlert } from '../../components/AlertProvider';
import { QuestionFeedbackModal } from '../../components/QuestionFeedbackModal';
import { useScreenSecurity } from '../../hooks/useScreenSecurity';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { AppPressable } from '../../components/ui';

export const PracticeScreen = () => {
  // Prevent screenshots during practice (controlled by feature flag)
  const { enabled: screenshotPrevention } = useFeatureFlag('screenshot_prevention');
  useScreenSecurity(screenshotPrevention);
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showWarning, showConfirm } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    sessionId,
    mode,
    subjectId,
    subjectName,
    questions,
    currentQuestionIndex,
    answers,
    setAnswer,
    setCurrentQuestionIndex,
    nextQuestion,
    previousQuestion,
    commitQuestionTime,
    getQuestionTimes,
    startQuestionTimer,
    getTotalTimeSpent,
    addBookmark,
    removeBookmark,
    bookmarkedQuestionIds,
    toggleMarkForReview,
    markedForReviewIds,
    clearSession,
  } = usePracticeStore();

  const [selectedOption, setSelectedOption] = useState<'A' | 'B' | 'C' | 'D' | 'E' | null>(null);
  const [textAnswer, setTextAnswer] = useState<string>('');
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [showPalette, setShowPalette] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const completionInFlightRef = useRef(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const { isOnline } = useNetworkStatus();

  // Stop fadeAnim on unmount to prevent stopTracking crash on Hermes
  useEffect(() => {
    return () => { try { fadeAnim.stopAnimation(); } catch (_) {} };
  }, []);
  
  // Practice mode instant feedback state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackAnswer, setFeedbackAnswer] = useState<'A' | 'B' | 'C' | 'D' | 'E' | string | null>(null);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(false);
  // Track which questions have been answered and locked (for practice mode)
  const [lockedQuestions, setLockedQuestions] = useState<Set<string>>(new Set());
  // Track bookmark state for current question
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  useEffect(() => {
    if (!currentQuestion) {
      navigation.goBack();
      return;
    }

    // Reset palette when question changes
    // (keep it open if user wants to navigate)

    // Load previous answer if exists
    const previousAnswer = answers.get(currentQuestion.id);
    const questionType = currentQuestion.question_type || 'mcq';
    
    if (questionType === 'codable_open') {
      setTextAnswer(previousAnswer || '');
      setSelectedOption(null);
    } else {
      setSelectedOption(previousAnswer as 'A' | 'B' | 'C' | 'D' | 'E' || null);
      setTextAnswer('');
    }
    
    // Update bookmark state for current question
    setIsBookmarked(bookmarkedQuestionIds.has(currentQuestion.id));
    
    // In practice mode, check if this question was already answered (locked)
    const isLocked = mode === 'practice' && lockedQuestions.has(currentQuestion.id);
    
    // If question is locked in practice mode, show the feedback state
    if (isLocked && previousAnswer) {
      setShowFeedback(true);
      setFeedbackAnswer(previousAnswer);
      
      // For codable_open, compare case-insensitive
      const isCorrect = questionType === 'codable_open'
        ? previousAnswer.toLowerCase().trim() === currentQuestion.correct_answer.toLowerCase().trim()
        : previousAnswer === currentQuestion.correct_answer;
      setIsAnswerCorrect(isCorrect);
    } else {
      // Reset feedback state for new/unlocked question
      setShowFeedback(false);
      setFeedbackAnswer(null);
      setIsAnswerCorrect(false);
    }

    // Reset image state for new question
    setImageLoading(false);
    setImageError(false);
    fadeAnim.setValue(0);

    // Start timer for this question
    startQuestionTimer(currentQuestion.id);
    setTimeElapsed(getTotalTimeSpent());

    // Keep the session timer visually smooth after question switches.
    const interval = setInterval(() => {
      setTimeElapsed(getTotalTimeSpent());
    }, 500);

    return () => clearInterval(interval);
  }, [currentQuestionIndex, currentQuestion]);

  // Load unsynced count. Actual sync is centralized in OfflineProvider/offlineSyncService.
  useEffect(() => {
    const loadUnsyncedCount = async () => {
      const count = await offlineService.getUnsyncedCount();
      setUnsyncedCount(count);
    };

    loadUnsyncedCount();
  }, [isOnline]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (option: 'A' | 'B' | 'C' | 'D' | 'E') => {
    setSelectedOption(option);
  };

  const handleTextAnswerChange = (text: string) => {
    setTextAnswer(text);
    // Auto-save text answer to store (like exam side does)
    if (currentQuestion && text.trim()) {
      setAnswer(currentQuestion.id, text.trim());
    }
  };

  const beginCompletion = () => {
    if (completionInFlightRef.current) {
      return false;
    }
    completionInFlightRef.current = true;
    setIsCompleting(true);
    return true;
  };

  const resetCompletion = () => {
    completionInFlightRef.current = false;
    setIsCompleting(false);
  };

  const navigateToResults = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          { name: 'ModeSelection' },
          { name: 'QuizResult', params: { sessionId, subjectId, mode } },
        ],
      })
    );
  };

  const handleBookmark = async () => {
    if (!user?.id || !currentQuestion) return;

    if (isBookmarked) {
      const success = await practiceService.removeBookmark(user.id, currentQuestion.id);
      if (success) {
        removeBookmark(currentQuestion.id);
        setIsBookmarked(false);
      }
    } else {
      const success = await practiceService.bookmarkQuestion(user.id, currentQuestion.id);
      if (success) {
        addBookmark(currentQuestion.id);
        setIsBookmarked(true);
      }
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !currentQuestion) return;

    const questionType = currentQuestion.question_type || 'mcq';
    const answer = questionType === 'codable_open' ? textAnswer.trim() : selectedOption;
    
    if (!answer) {
      showWarning(t('practice.session.selectAnswer'), t('practice.session.selectAnswer'));
      return;
    }

    const isCompletingQuiz = mode !== 'practice' && isLastQuestion;
    if (isCompletingQuiz && !beginCompletion()) return;

    // Save answer
    setAnswer(currentQuestion.id, answer);

    // Submit to database
    const timeSpent = commitQuestionTime(currentQuestion.id);
    
    // For codable_open, compare case-insensitive
    const isCorrect = questionType === 'codable_open'
      ? answer.toLowerCase() === currentQuestion.correct_answer.toLowerCase()
      : answer === currentQuestion.correct_answer;
    
    try {
      await practiceService.submitAnswer(
        user.id,
        currentQuestion.id,
        answer,
        currentQuestion.correct_answer,
        timeSpent,
        sessionId || undefined
      );
    } catch (error) {
      console.error('Submit answer error:', error);
      if (isCompletingQuiz) {
        resetCompletion();
      }
      showWarning(t('common.error'), t('errors.loadFailed'));
      return;
    }

    // PRACTICE MODE: Show instant feedback after each answer (including last question)
    if (mode === 'practice') {
      // Lock this question - user cannot change answer after seeing feedback
      setLockedQuestions(prev => new Set(prev).add(currentQuestion.id));
      setFeedbackAnswer(answer);
      setIsAnswerCorrect(isCorrect);
      setShowFeedback(true);
      // Always return here - even for last question, user must see feedback first
      return; // Don't proceed - wait for user to click "Continue" or "Finish"
    }

    // QUIZ MODE: Continue without feedback (original behavior)
    // If last question, complete the session and show results
    if (isLastQuestion) {
      try {
        // Complete practice session
        if (sessionId) {
          // Update answers map with current answer
          const finalAnswers = new Map(answers);
          finalAnswers.set(currentQuestion.id, answer);

          const correctAnswers = Array.from(finalAnswers.values()).filter(
            (ans, index) => ans === questions[index]?.correct_answer
          ).length;

          const totalTime = getTotalTimeSpent();

          // Check if offline - save result locally for QuizResult screen
          const isOfflineSession = sessionId.startsWith('offline_');
          if (isOfflineSession || !isOnline) {
            await practiceService.saveOfflineSessionResult(
              sessionId,
              subjectId || '',
              subjectName || '',
              questions,
              finalAnswers,
              totalTime,
              getQuestionTimes()
            );
          }

          await practiceService.completePracticeSession(
            sessionId,
            correctAnswers,
            totalTime
          );
        }

        navigateToResults();
      } catch (error) {
        console.error('Complete quiz error:', error);
        showWarning(t('common.error'), t('errors.loadFailed'));
        resetCompletion();
      }
    } else {
      // Move to next question
      nextQuestion();
      setSelectedOption(null);
      setTextAnswer('');
    }
  };

  // Handle continuing after feedback in practice mode
  const handleContinueAfterFeedback = async () => {
    if (!user?.id || !currentQuestion) return;

    // If last question, complete the session and show results
    if (isLastQuestion) {
      if (!beginCompletion()) return;

      try {
        if (sessionId) {
          const correctAnswers = Array.from(answers.values()).filter(
            (answer, index) => answer === questions[index]?.correct_answer
          ).length;

          const totalTime = getTotalTimeSpent();

          // Check if offline - save result locally for QuizResult screen
          const isOfflineSession = sessionId.startsWith('offline_');
          if (isOfflineSession || !isOnline) {
            await practiceService.saveOfflineSessionResult(
              sessionId,
              subjectId || '',
              subjectName || '',
              questions,
              answers,
              totalTime,
              getQuestionTimes()
            );
          }

          await practiceService.completePracticeSession(
            sessionId,
            correctAnswers,
            totalTime
          );
        }

        navigateToResults();
      } catch (error) {
        console.error('Complete practice error:', error);
        showWarning(t('common.error'), t('errors.loadFailed'));
        resetCompletion();
      }
    } else {
      // Move to next question and reset feedback state
      setShowFeedback(false);
      setFeedbackAnswer(null);
      setIsAnswerCorrect(false);
      nextQuestion();
      setSelectedOption(null);
      setTextAnswer('');
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      previousQuestion();
    }
  };

  const handleNext = () => {
    if (!isLastQuestion) {
      nextQuestion();
    }
  };

  const handleFinalSubmit = async () => {
    if (!user?.id || !currentQuestion) return;
    if (!beginCompletion()) return;

    try {
      // Update answers with current selection
      const finalAnswers = new Map(answers);
      const questionType = currentQuestion.question_type || 'mcq';
      const currentAnswer = questionType === 'codable_open' ? textAnswer.trim() : selectedOption;
      const currentQuestionTime = commitQuestionTime(currentQuestion.id);
      if (currentAnswer && !finalAnswers.has(currentQuestion.id)) {
        finalAnswers.set(currentQuestion.id, currentAnswer);
        setAnswer(currentQuestion.id, currentAnswer);
        await practiceService.submitAnswer(
          user.id,
          currentQuestion.id,
          currentAnswer,
          currentQuestion.correct_answer,
          currentQuestionTime,
          sessionId || undefined
        );
      }

      // Record all unanswered questions as skipped (for adaptive algorithm)
      const skippedQuestions = questions.filter(q => !finalAnswers.has(q.id));
      if (skippedQuestions.length > 0) {
        const questionTimes = getQuestionTimes();
        await Promise.all(
          skippedQuestions.map(q =>
            practiceService.recordSkippedQuestion(user.id, q.id, sessionId || undefined, questionTimes.get(q.id) || 0)
          )
        );
      }

      const totalTimeSpent = getTotalTimeSpent();

      // Check if this is an offline session
      const isOfflineSession = sessionId?.startsWith('offline_');

      // Complete practice session
      if (sessionId) {
        const correctAnswers = Array.from(finalAnswers.entries()).filter(
          ([questionId, answer]) => {
            const question = questions.find(q => q.id === questionId);
            return question && answer === question.correct_answer;
          }
        ).length;

        // For offline sessions, save the result locally
        if (isOfflineSession || !isOnline) {
          await practiceService.saveOfflineSessionResult(
            sessionId,
            subjectId || '',
            subjectName || '',
            questions,
            finalAnswers,
            totalTimeSpent,
            getQuestionTimes()
          );
        } else {
          // Online: complete session in database
          await practiceService.completePracticeSession(
            sessionId,
            correctAnswers,
            totalTimeSpent
          );
        }
      }

      // Navigate to results screen - use reset to prevent going back to quiz
      // This is industry standard: once quiz is submitted, user cannot go back
      navigateToResults();
    } catch (error) {
      console.error('Final submit error:', error);
      showWarning(t('common.error'), t('errors.loadFailed'));
      resetCompletion();
    }
  };

  const handleExit = () => {
    showConfirm(
      t('practice.session.exitPractice'),
      t('practice.session.exitPracticeMessage'),
      () => {
        // Clear session without saving progress
        clearSession();
        // Reset to Mode Selection
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'ModeSelection' }],
          })
        );
      },
      undefined,
      t('practice.session.exit'),
      t('practice.session.cancel')
    );
  };

  if (!currentQuestion) {
    return null;
  }

  // Get question status for navigator palette
  const getQuestionStatus = (questionId: string): 'answered' | 'marked' | 'unanswered' => {
    const isMarked = markedForReviewIds.has(questionId);
    const hasAnswer = answers.has(questionId);
    if (isMarked) return 'marked';
    if (hasAnswer) return 'answered';
    return 'unanswered';
  };

  // Count statistics for legend
  const answeredCount = Array.from(answers.keys()).length;
  const markedCount = markedForReviewIds.size;

  // Handle jumping to a specific question
  const handleJumpToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      // Save current answer if any
      if (selectedOption && currentQuestion) {
        setAnswer(currentQuestion.id, selectedOption);
      }
      setCurrentQuestionIndex(index);
      setShowPalette(false);
    }
  };

  const options = [
    { key: 'A' as const, text: currentQuestion.option_a },
    { key: 'B' as const, text: currentQuestion.option_b },
    { key: 'C' as const, text: currentQuestion.option_c },
    { key: 'D' as const, text: currentQuestion.option_d },
    { key: 'E' as const, text: currentQuestion.option_e },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Note: OfflineBanner is shown globally in RootNavigator, no need to duplicate here */}
      
      {/* Header */}
      <View style={styles.header}>
        <AppPressable
          accessibilityLabel={t('common.close')}
          style={styles.exitButton}
          onPress={handleExit}
        >
          <Ionicons name="close" size={24} color={colors.error} />
        </AppPressable>
        <View style={styles.headerCenter}>
          <Text style={styles.subjectName}>{(currentQuestion as { subject_name_az?: string }).subject_name_az || subjectName}</Text>
          <Text style={styles.questionCounter}>
            {t('practice.session.question')} {currentQuestionIndex + 1} {t('practice.session.of')} {questions.length}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.timerContainer}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.timerText}>{formatTime(timeElapsed)}</Text>
          </View>
          <AppPressable
            accessibilityLabel={t('exams.session.questionNavigator')}
            accessibilityState={{ expanded: showPalette }}
            style={styles.paletteButton}
            onPress={() => setShowPalette(!showPalette)}
          >
            <Ionicons name="grid" size={24} color={colors.primary} />
          </AppPressable>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      {/* Question Navigator Palette */}
      {showPalette && (
        <View style={styles.palette}>
          <Text style={styles.paletteTitle}>{t('exams.session.questionNavigator')}</Text>
          <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.paletteGrid}>
              {questions.map((q, index) => {
                const status = getQuestionStatus(q.id);
                return (
                  <AppPressable
                    key={q.id}
                    accessibilityLabel={`${t('practice.session.question')} ${index + 1}`}
                    accessibilityState={{ selected: index === currentQuestionIndex }}
                    haptic={false}
                    style={[
                      styles.paletteItem,
                      index === currentQuestionIndex && styles.paletteItemCurrent,
                      status === 'answered' && styles.paletteItemAnswered,
                      status === 'marked' && styles.paletteItemMarked,
                    ]}
                    onPress={() => handleJumpToQuestion(index)}
                  >
                    <Text
                      style={[
                        styles.paletteItemText,
                        (index === currentQuestionIndex || status === 'answered' || status === 'marked') &&
                          styles.paletteItemTextActive,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </AppPressable>
                );
              })}
            </View>
          </ScrollView>
          
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.paletteItemAnswered]} />
              <Text style={styles.legendText}>{t('practice.navigator.answered')} ({answeredCount})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.paletteItemMarked]} />
              <Text style={styles.legendText}>{t('practice.navigator.marked')} ({markedCount})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, { borderColor: colors.border, borderWidth: 1 }]} />
              <Text style={styles.legendText}>{t('practice.navigator.unanswered')} ({questions.length - answeredCount})</Text>
            </View>
          </View>
        </View>
      )}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Question */}
        <Card style={styles.questionCard}>
          <View style={styles.questionHeaderRow}>
            {currentQuestion.topic ? (
              <View style={styles.topicBadge}>
                <Text style={styles.topicText}>{currentQuestion.topic}</Text>
              </View>
            ) : <View />}
            <AppPressable
              accessibilityLabel={t('practice.questionFeedback.title')}
              onPress={() => setShowFeedbackModal(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.reportButton}
            >
              <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
            </AppPressable>
          </View>
          <Text style={styles.questionText}>{currentQuestion.question_text}</Text>
          
          {/* Question Image */}
          {currentQuestion.question_image_url && (
            <View style={styles.imageContainer}>
              {imageLoading && (
                <View style={styles.imageLoadingContainer}>
                  <ActivityIndicator size="large" color="#3B82F6" />
                  <Text style={styles.imageLoadingText}>{t('practice.session.imageLoading')}</Text>
                </View>
              )}
              {imageError ? (
                <View style={styles.imageErrorContainer}>
                  <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.imageErrorText}>{t('practice.session.imageLoadFailed')}</Text>
                  <AppPressable
                    accessibilityLabel={t('common.retry')}
                    style={styles.retryButton}
                    onPress={() => {
                      setImageError(false);
                      setImageLoading(true);
                    }}
                  >
                    <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                  </AppPressable>
                </View>
              ) : (
                <Animated.View style={{ opacity: fadeAnim }}>
                  <Image
                    source={{ uri: currentQuestion.question_image_url }}
                    style={styles.questionImage}
                    resizeMode="contain"
                    onLoadStart={() => setImageLoading(true)}
                    onLoadEnd={() => {
                      setImageLoading(false);
                      Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                      }).start();
                    }}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                  />
                </Animated.View>
              )}
            </View>
          )}
        </Card>

        {/* Codable Open Text Input */}
        {(currentQuestion.question_type === 'codable_open') ? (
          <View style={styles.textInputContainer}>
            <Text style={styles.textInputLabel}>{t('practice.session.yourAnswer')}</Text>
            <TextInput
              style={[
                styles.textInput,
                showFeedback && (isAnswerCorrect ? styles.textInputCorrect : styles.textInputIncorrect)
              ]}
              value={textAnswer}
              onChangeText={handleTextAnswerChange}
              placeholder={t('practice.session.typeAnswer')}
              placeholderTextColor={colors.textSecondary}
              editable={!showFeedback}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : (
          /* MCQ Options */
          <View style={styles.optionsContainer}>
            {options.map((option) => {
            // Determine option styling based on feedback state
            const isSelected = selectedOption === option.key;
            const isCorrectAnswer = option.key === currentQuestion.correct_answer;
            const isUserAnswer = feedbackAnswer === option.key;
            
            // Feedback styling
            let feedbackStyle = null;
            let feedbackCircleStyle = null;
            let feedbackTextStyle = null;
            
            if (showFeedback) {
              if (isCorrectAnswer) {
                feedbackStyle = styles.optionCardCorrect;
                feedbackCircleStyle = styles.optionCircleCorrect;
                feedbackTextStyle = styles.optionTextCorrect;
              } else if (isUserAnswer && !isAnswerCorrect) {
                feedbackStyle = styles.optionCardIncorrect;
                feedbackCircleStyle = styles.optionCircleIncorrect;
                feedbackTextStyle = styles.optionTextIncorrect;
              }
            }
            
            return (
              <AppPressable
                key={option.key}
                accessibilityLabel={`${option.key}. ${option.text}`}
                accessibilityState={{ selected: isSelected, disabled: showFeedback }}
                style={[
                  styles.optionCard,
                  isSelected && !showFeedback && styles.optionCardSelected,
                  feedbackStyle,
                ]}
                onPress={() => !showFeedback && handleOptionSelect(option.key)}
                disabled={showFeedback}
              >
                <View
                  style={[
                    styles.optionCircle,
                    isSelected && !showFeedback && styles.optionCircleSelected,
                    feedbackCircleStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionKey,
                      isSelected && !showFeedback && styles.optionKeySelected,
                      feedbackTextStyle && { color: '#FFFFFF' },
                    ]}
                  >
                    {option.key}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.optionText,
                    isSelected && !showFeedback && styles.optionTextSelected,
                    feedbackTextStyle,
                  ]}
                >
                  {option.text}
                </Text>
                {/* Show checkmark/cross icons during feedback */}
                {showFeedback && isCorrectAnswer && (
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" style={{ marginLeft: 8 }} />
                )}
                {showFeedback && isUserAnswer && !isAnswerCorrect && (
                  <Ionicons name="close-circle" size={24} color="#EF4444" style={{ marginLeft: 8 }} />
                )}
              </AppPressable>
            );
          })}
          </View>
        )}

        {/* Mark for Review Button (Quiz Mode only - not in practice mode with instant feedback) */}
        {mode === 'quiz' && !showFeedback && (
          <AppPressable
            accessibilityLabel={
              currentQuestion && markedForReviewIds.has(currentQuestion.id)
                ? t('exams.session.markedForReview')
                : t('exams.session.markForReview')
            }
            accessibilityState={{
              selected: Boolean(currentQuestion && markedForReviewIds.has(currentQuestion.id)),
            }}
            style={styles.markButton} 
            onPress={() => currentQuestion && toggleMarkForReview(currentQuestion.id)}
          >
            <Ionicons
              name={currentQuestion && markedForReviewIds.has(currentQuestion.id) ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={currentQuestion && markedForReviewIds.has(currentQuestion.id) ? colors.warning : colors.textSecondary}
            />
            <Text style={styles.markButtonText}>
              {currentQuestion && markedForReviewIds.has(currentQuestion.id) 
                ? t('exams.session.markedForReview') 
                : t('exams.session.markForReview')}
            </Text>
          </AppPressable>
        )}
        
        {/* Instant Feedback Panel (Practice Mode) */}
        {showFeedback && (
          <View style={styles.feedbackContainer}>
            <View style={[styles.feedbackHeader, isAnswerCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
              <Ionicons 
                name={isAnswerCorrect ? 'checkmark-circle' : 'close-circle'} 
                size={32} 
                color={isAnswerCorrect ? '#10B981' : '#EF4444'} 
              />
              <Text style={[styles.feedbackTitle, isAnswerCorrect ? styles.feedbackTitleCorrect : styles.feedbackTitleIncorrect]}>
                {isAnswerCorrect ? t('practice.feedback.correct') : t('practice.feedback.incorrect')}
              </Text>
            </View>
            {currentQuestion.explanation && (
              <View style={styles.explanationContainer}>
                <View style={styles.explanationHeader}>
                  <Ionicons name="bulb" size={20} color="#F59E0B" />
                  <Text style={styles.explanationLabel}>{t('practice.feedback.explanation')}</Text>
                </View>
                <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigationButtons}>
        <View style={styles.navigationPrimaryRow}>
          <Button
            title={t('practice.session.previous')}
            variant="outline"
            size="compact"
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0 || isCompleting}
            style={styles.navButton}
          />
        
          {/* PRACTICE MODE with FEEDBACK: Show Continue button */}
          {mode === 'practice' && showFeedback ? (
            <Button
              title={isLastQuestion ? t('practice.feedback.finishPractice') : t('practice.feedback.nextQuestion')}
              variant="primary"
              size="compact"
              onPress={handleContinueAfterFeedback}
              loading={isCompleting}
              disabled={isCompleting}
              style={styles.submitButton}
            />
          ) : (
            // Normal mode: Show Submit/Next/Skip button
            // On last question: always show "Submit Quiz" and allow submitting with or without answer
            <Button
              title={isLastQuestion ? t('practice.session.submitQuiz') : (selectedOption || textAnswer.trim() ? t('practice.session.nextQuestion') : t('common.skip'))}
              variant="primary"
              size="compact"
              onPress={isLastQuestion
                ? ((selectedOption || textAnswer.trim()) ? handleSubmit : handleFinalSubmit)
                : ((selectedOption || textAnswer.trim()) ? handleSubmit : handleNext)
              }
              loading={isCompleting}
              disabled={isCompleting}
              style={styles.submitButton}
            />
          )}
        </View>

        {!isLastQuestion && (
          <Button
            title={t('practice.session.finish')}
            variant="outline"
            size="compact"
            onPress={handleFinalSubmit}
            disabled={isCompleting}
            style={styles.finishButton}
          />
        )}
      </View>

      {/* Question Feedback Modal */}
      {currentQuestion && (
        <QuestionFeedbackModal
          visible={showFeedbackModal}
          questionId={currentQuestion.id}
          onClose={() => setShowFeedbackModal(false)}
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
    backgroundColor: colors.background,
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
  subjectName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  questionCounter: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeights.medium,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  questionCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  questionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  reportButton: {
    padding: 4,
  },
  topicBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  topicText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  difficultyText: {
    fontSize: typography.fontSizes.xs,
    color: colors.warning,
    textTransform: 'capitalize',
    fontWeight: typography.fontWeights.medium,
  },
  questionText: {
    fontSize: typography.fontSizes.md,
    lineHeight: 24,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  imageContainer: {
    marginTop: spacing.lg,
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
    flex: 1,
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
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
  },
  retryButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: typography.fontWeights.semibold,
  },
  optionsContainer: {
    paddingHorizontal: spacing.md,
    gap: 6,
    marginBottom: spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  optionCircleSelected: {
    backgroundColor: colors.primary,
  },
  optionKey: {
    fontSize: 13,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
  },
  optionKeySelected: {
    color: '#FFFFFF',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navigationButtons: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  navigationPrimaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navButton: {
    flex: 1,
  },
  finishButton: {
    width: '100%',
  },
  submitButton: {
    flex: 1,
  },
  optionCardCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  optionCardIncorrect: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
  optionCircleCorrect: {
    backgroundColor: colors.success,
  },
  optionCircleIncorrect: {
    backgroundColor: colors.error,
  },
  optionTextCorrect: {
    color: colors.success,
    fontWeight: typography.fontWeights.medium,
  },
  optionTextIncorrect: {
    color: colors.error,
    fontWeight: typography.fontWeights.medium,
  },
  feedbackContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  feedbackCorrect: {
    backgroundColor: colors.successLight,
  },
  feedbackIncorrect: {
    backgroundColor: colors.errorLight,
  },
  feedbackTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
  },
  feedbackTitleCorrect: {
    color: colors.success,
  },
  feedbackTitleIncorrect: {
    color: colors.error,
  },
  explanationContainer: {
    padding: spacing.sm,
    backgroundColor: colors.warningLight,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  explanationLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.warning,
    textTransform: 'uppercase',
  },
  explanationText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
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
  // Codable Open Text Input Styles
  textInputContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  textInputLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    minHeight: 50,
  },
  textInputCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  textInputIncorrect: {
    borderColor: colors.error,
    backgroundColor: colors.errorLight,
  },
  textAnswerFeedback: {
    marginTop: spacing.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  feedbackRowText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  correctAnswerRow: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.sm,
  },
  correctAnswerLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  correctAnswerText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
});
