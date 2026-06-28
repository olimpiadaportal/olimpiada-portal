// Mock Exam Screen
// Dark mode support added - Phase 3

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { mockExamService } from '../../services/mockExamService';
import { imageUploadService } from '../../services/imageUploadService';
import { supabase } from '../../services/supabase';
import { ExamQuestion, ExamAnswer, TIMER_WARNINGS, AUTO_SAVE_INTERVAL } from '../../types/mockExam';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius, shadows } from '../../constants/theme';
import { useExamStore } from '../../store/examStore';
import { translateSubject } from '../../utils/subjectTranslation';
import { ContextFlipCard } from '../../components/ContextFlipCard';
import { useAlert } from '../../components/AlertProvider';
import { useScreenSecurity } from '../../hooks/useScreenSecurity';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { QuestionFeedbackModal } from '../../components/QuestionFeedbackModal';

export const MockExamScreen = () => {
  // Prevent screenshots during exam (controlled by feature flag)
  const { enabled: screenshotPrevention } = useFeatureFlag('screenshot_prevention');
  useScreenSecurity(screenshotPrevention);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { attemptId } = route.params as { attemptId: string };
  const examStore = useExamStore();
  const { clearSession: clearExamSession } = examStore;
  const { colors } = useTheme();
  const { showError, showWarning, showConfirm, showAlert } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, ExamAnswer>>(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [answerImageUrl, setAnswerImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const submitInFlightRef = useRef(false);
  const questionStartTimeRef = useRef<number>(Date.now());
  const warningsShownRef = useRef({
    tenMinutes: false,
    fiveMinutes: false,
    oneMinute: false,
  });

  useEffect(() => {
    loadExamData();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
      try { fadeAnim.stopAnimation(); } catch (_) {}
    };
  }, []);

  // Sync textAnswer and answerImageUrl state when question changes
  useEffect(() => {
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion) {
      const currentAnswer = answers.get(currentQuestion.id);
      setTextAnswer(currentAnswer?.text_answer || '');
      setAnswerImageUrl(currentAnswer?.image_url || null);
    }
  }, [currentQuestionIndex, questions, answers]);

  const loadExamData = async () => {
    try {
      const attempt = await mockExamService.getExamAttempt(attemptId);
      if (!attempt) {
        showError('Error', 'Exam attempt not found', () => navigation.goBack());
        return;
      }

      // Set sessionId in store for tab navigation detection
      examStore.setSessionId(attemptId);

      const examQuestions = await mockExamService.getExamQuestions(attempt.mock_exam_id);
      setQuestions(examQuestions);
      setAnswers(attempt.answers);
      setTimeRemaining(attempt.time_remaining_seconds);

      // Check if time has already expired
      if (attempt.time_remaining_seconds <= 0) {
        setLoading(false);
        showAlert({
          title: 'Time Expired',
          message: 'The exam time has expired. Your exam will be submitted automatically.',
          type: 'warning',
          buttons: [{ text: 'OK', onPress: submitExam }],
        });
        return;
      }

      // Check if exam has no questions
      if (examQuestions.length === 0) {
        setLoading(false);
        showAlert({
          title: t('exams.session.noQuestions'),
          message: t('exams.session.noQuestionsMessage'),
          type: 'warning',
          buttons: [{
            text: t('common.ok'),
            onPress: async () => {
              // Mark exam as completed with 0 score
              try {
                await supabase
                  .from('mock_exam_attempts')
                  .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    total_score: 0,
                    percentage: 0
                  })
                  .eq('id', attemptId);
              } catch (error) {
                console.error('Error cancelling exam:', error);
              }
              navigation.goBack();
            }
          }],
        });
        return;
      }

      // Start timer
      startTimer(attempt.time_remaining_seconds);
      
      // Start auto-save
      startAutoSave();
      
      setLoading(false);
    } catch (error) {
      console.error('Load exam data error:', error);
      showError('Error', 'Failed to load exam', () => navigation.goBack());
    }
  };

  const startTimer = (initialTime: number) => {
    let remaining = initialTime;
    
    timerRef.current = setInterval(() => {
      remaining--;
      setTimeRemaining(remaining);

      // Check for warnings
      if (remaining === TIMER_WARNINGS.TEN_MINUTES && !warningsShownRef.current.tenMinutes) {
        warningsShownRef.current.tenMinutes = true;
        showWarning('⏰ Time Warning', '10 minutes remaining!');
      } else if (remaining === TIMER_WARNINGS.FIVE_MINUTES && !warningsShownRef.current.fiveMinutes) {
        warningsShownRef.current.fiveMinutes = true;
        showWarning('⏰ Time Warning', '5 minutes remaining!');
      } else if (remaining === TIMER_WARNINGS.ONE_MINUTE && !warningsShownRef.current.oneMinute) {
        warningsShownRef.current.oneMinute = true;
        showWarning('⚠️ Final Warning', '1 minute remaining!');
      }

      // Auto-submit when time runs out
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleAutoSubmit();
      }

      // Update time in database every minute
      if (remaining % 60 === 0) {
        mockExamService.updateTimeRemaining(attemptId, remaining);
      }
    }, 1000);
  };

  const startAutoSave = () => {
    autoSaveRef.current = setInterval(() => {
      saveProgress();
    }, AUTO_SAVE_INTERVAL);
  };

  const saveProgress = async () => {
    try {
      // Use the same function to save current question time
      await saveCurrentQuestionTime();
      
      // Update time remaining
      await mockExamService.updateTimeRemaining(attemptId, timeRemaining);
      console.log('Progress auto-saved');
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const saveCurrentQuestionTime = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return 0;

    const timeSpent = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    const existingAnswer = answers.get(currentQuestion.id);
    const totalTime = (existingAnswer?.time_spent_seconds || 0) + timeSpent;

    // Update answer with new time - only use answers Map as source of truth
    // Do NOT fall back to textAnswer/answerImageUrl state — they may hold
    // stale values from a previously viewed question (async state update race)
    const newAnswer: ExamAnswer = {
      question_id: currentQuestion.id,
      selected_answer: existingAnswer?.selected_answer || null,
      text_answer: existingAnswer?.text_answer || undefined,
      image_url: existingAnswer?.image_url || undefined,
      is_marked: existingAnswer?.is_marked || false,
      time_spent_seconds: totalTime,
    };

    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, newAnswer);
    setAnswers(newAnswers);

    // Save to database based on question type
    const qType = currentQuestion.question_type || 'mcq';
    if (qType === 'mcq') {
      await mockExamService.saveAnswer(
        attemptId,
        currentQuestion.id,
        newAnswer.selected_answer || null,
        newAnswer.is_marked,
        totalTime
      );
    } else {
      // For open questions, save text answer AND image_url
      await mockExamService.saveTextAnswer(
        attemptId,
        currentQuestion.id,
        newAnswer.text_answer || '',
        newAnswer.is_marked,
        totalTime,
        newAnswer.image_url
      );
    }

    // IMPORTANT: Reset timer after saving to prevent double counting
    questionStartTimeRef.current = Date.now();

    return totalTime;
  };

  const handleSelectAnswer = (option: 'A' | 'B' | 'C' | 'D' | 'E') => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const existingAnswer = answers.get(currentQuestion.id);
    
    // Calculate time spent so far (without awaiting)
    const currentTime = existingAnswer?.time_spent_seconds || 0;
    const additionalTime = questionStartTimeRef.current 
      ? Math.floor((Date.now() - questionStartTimeRef.current) / 1000)
      : 0;
    const totalTime = currentTime + additionalTime;

    const newAnswer: ExamAnswer = {
      question_id: currentQuestion.id,
      selected_answer: option,
      is_marked: existingAnswer?.is_marked || false,
      time_spent_seconds: totalTime,
    };

    // Update local state IMMEDIATELY for instant feedback
    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, newAnswer);
    setAnswers(newAnswers);

    // Save to database in background (don't await)
    mockExamService.saveAnswer(
      attemptId,
      currentQuestion.id,
      option || null,
      newAnswer.is_marked,
      newAnswer.time_spent_seconds
    ).catch(err => console.error('Error saving answer:', err));
  };

  const handleTextAnswerChange = (text: string) => {
    setTextAnswer(text);
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const existingAnswer = answers.get(currentQuestion.id);
    const currentTime = existingAnswer?.time_spent_seconds || 0;
    const additionalTime = questionStartTimeRef.current 
      ? Math.floor((Date.now() - questionStartTimeRef.current) / 1000)
      : 0;
    const totalTime = currentTime + additionalTime;

    const newAnswer: ExamAnswer = {
      question_id: currentQuestion.id,
      text_answer: text,
      image_url: existingAnswer?.image_url || answerImageUrl || undefined,
      is_marked: existingAnswer?.is_marked || false,
      time_spent_seconds: totalTime,
    };

    // Update local state
    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, newAnswer);
    setAnswers(newAnswers);

    // Auto-save text answers with image_url preserved
    mockExamService.saveTextAnswer(
      attemptId,
      currentQuestion.id,
      text,
      newAnswer.is_marked,
      newAnswer.time_spent_seconds,
      newAnswer.image_url
    ).catch(err => console.error('Error saving text answer:', err));
  };

  const handleImageUpload = async (source: 'camera' | 'gallery') => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    try {
      setUploadingImage(true);

      // Pick image
      const imageUri = await imageUploadService.pickExamAnswerImage(source);
      if (!imageUri) {
        setUploadingImage(false);
        return;
      }

      // Upload to Supabase Storage
      const uploadedUrl = await imageUploadService.uploadExamAnswerImage(
        imageUri,
        attemptId,
        currentQuestion.id
      );

      if (!uploadedUrl) {
        showError(t('common.error'), t('exams.session.imageUploadFailed'));
        setUploadingImage(false);
        return;
      }

      // Update local state
      setAnswerImageUrl(uploadedUrl);

      // Update answers map with image URL
      const existingAnswer = answers.get(currentQuestion.id);
      const newAnswer = {
        ...existingAnswer,
        question_id: currentQuestion.id,
        text_answer: existingAnswer?.text_answer || textAnswer,
        is_marked: existingAnswer?.is_marked || false,
        time_spent_seconds: existingAnswer?.time_spent_seconds || 0,
        image_url: uploadedUrl,
      };

      const newAnswers = new Map(answers);
      newAnswers.set(currentQuestion.id, newAnswer as ExamAnswer);
      setAnswers(newAnswers);

      // Save to database
      await mockExamService.saveTextAnswer(
        attemptId,
        currentQuestion.id,
        newAnswer.text_answer || '',
        newAnswer.is_marked,
        newAnswer.time_spent_seconds,
        uploadedUrl
      );

      // Success notification - image uploaded
    } catch (error) {
      console.error('Image upload error:', error);
      showError(t('common.error'), t('exams.session.imageUploadFailed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion || !answerImageUrl) return;

    try {
      // Delete from storage
      await imageUploadService.deleteExamAnswerImage(answerImageUrl);

      // Update local state
      setAnswerImageUrl(null);

      // Update answers map
      const existingAnswer = answers.get(currentQuestion.id);
      const newAnswer = {
        ...existingAnswer,
        question_id: currentQuestion.id,
        image_url: undefined,
      };

      const newAnswers = new Map(answers);
      newAnswers.set(currentQuestion.id, newAnswer as ExamAnswer);
      setAnswers(newAnswers);

      // Save to database with null image
      await mockExamService.saveTextAnswer(
        attemptId,
        currentQuestion.id,
        existingAnswer?.text_answer || '',
        existingAnswer?.is_marked || false,
        existingAnswer?.time_spent_seconds || 0,
        ''
      );
    } catch (error) {
      console.error('Remove image error:', error);
    }
  };

  const handleMarkForReview = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const existingAnswer = answers.get(currentQuestion.id);
    const newAnswer: ExamAnswer = {
      question_id: currentQuestion.id,
      selected_answer: existingAnswer?.selected_answer,
      text_answer: existingAnswer?.text_answer,
      is_marked: !existingAnswer?.is_marked,
      time_spent_seconds: existingAnswer?.time_spent_seconds || 0,
    };

    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, newAnswer);
    setAnswers(newAnswers);

    // Save based on question type
    if (currentQuestion.question_type === 'mcq') {
      await mockExamService.saveAnswer(
        attemptId,
        currentQuestion.id,
        newAnswer.selected_answer || null,
        newAnswer.is_marked,
        newAnswer.time_spent_seconds
      );
    } else {
      await mockExamService.saveTextAnswer(
        attemptId,
        currentQuestion.id,
        newAnswer.text_answer || '',
        newAnswer.is_marked,
        newAnswer.time_spent_seconds
      );
    }
  };

  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      await saveCurrentQuestionTime(); // Save time and reset timer
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = async () => {
    if (currentQuestionIndex > 0) {
      await saveCurrentQuestionTime(); // Save time and reset timer
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleJumpToQuestion = async (index: number) => {
    await saveCurrentQuestionTime(); // Save time and reset timer
    setCurrentQuestionIndex(index);
    setShowPalette(false);
  };

  const handleSubmitExam = () => {
    if (submitInFlightRef.current || submitting) return;

    // Count answers: MCQ with selected_answer OR open questions with text_answer/image_url
    const answeredCount = Array.from(answers.values()).filter(a => 
      a.selected_answer || (a.text_answer && a.text_answer.trim() !== '') || a.image_url
    ).length;
    const unansweredCount = questions.length - answeredCount;

    // Build message - only show answered count if there are unanswered questions
    let message = '';
    if (unansweredCount > 0) {
      message = t('exams.session.answeredQuestionsCount', { answered: answeredCount, total: questions.length }) + '\n\n';
      message += t('exams.session.unansweredQuestionsCount', { count: unansweredCount }) + '\n\n';
    }
    message += t('exams.session.confirmSubmitQuestion');

    showConfirm(
      t('exams.session.submitExam'),
      message,
      submitExam,
      undefined,
      t('exams.session.submit'),
      t('common.cancel')
    );
  };

  const submitExam = async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      console.log('📝 Starting exam submission for attemptId:', attemptId);
      
      // Save time for current question before submitting
      await saveCurrentQuestionTime();
      
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);

      // Get question counts by type for grading screen
      console.log('📊 Getting question counts by type...');
      const counts = await mockExamService.getQuestionCountsByType(attemptId);
      console.log('📊 Question counts:', counts);

      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'ExamsHub' },
            {
              name: 'ExamGrading',
              params: {
                attemptId,
                mcqCount: counts.mcq,
                codableCount: counts.codable,
                writtenCount: counts.written,
              },
            },
          ],
        })
      );
    } catch (error) {
      console.error('❌ Submit exam error:', error);
      showError('Error', 'Failed to submit exam. Please check your connection and try again.');
      submitInFlightRef.current = false;
      setSubmitting(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoSubmit = async () => {
    showAlert({
      title: 'Time\'s Up!',
      message: 'The exam time has ended. Your exam will be submitted automatically.',
      type: 'warning',
      buttons: [{ text: 'OK', onPress: submitExam }],
    });
  };

  const handleExitAttempt = () => {
    showConfirm(
      t('exams.session.exitExam'),
      t('exams.session.exitExamMessage'),
      async () => {
        // Clear timers
        if (timerRef.current) clearInterval(timerRef.current);
        if (autoSaveRef.current) clearInterval(autoSaveRef.current);
        
        // Delete the attempt from database (no resume feature)
        await mockExamService.abandonExamAttempt(attemptId);
        
        // Clear local state
        clearExamSession();
        
        // Reset navigation stack to prevent returning to frozen exam screen
        // This is industry standard: use CommonActions.reset to clear the stack
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'ExamsHub' }],
          })
        );
      },
      undefined,
      t('common.exit'),
      t('common.cancel')
    );
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getQuestionStatus = (questionId: string): 'answered' | 'marked' | 'unanswered' => {
    const answer = answers.get(questionId);
    if (!answer) return 'unanswered';
    if (answer.is_marked) return 'marked';
    if (answer.selected_answer) return 'answered';
    return 'unanswered';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingHeader}>
          <LoadingSkeleton width={42} height={42} borderRadius={borderRadius.full} />
          <View style={styles.loadingHeaderText}>
            <LoadingSkeleton width="68%" height={24} />
            <LoadingSkeleton width="42%" height={16} style={styles.loadingLine} />
          </View>
        </View>
        <View style={styles.loadingProgress}>
          <LoadingSkeleton width="100%" height={8} borderRadius={borderRadius.full} />
          <LoadingSkeleton width="36%" height={16} style={styles.loadingCenteredLine} />
        </View>
        <View style={styles.loadingContent}>
          <View style={styles.loadingQuestionCard}>
            <LoadingSkeleton width={96} height={22} borderRadius={borderRadius.full} />
            <LoadingSkeleton width="88%" height={28} style={styles.loadingLine} />
            <LoadingSkeleton width="72%" height={28} style={styles.loadingLine} />
            {[1, 2, 3, 4].map((item) => (
              <LoadingSkeleton
                key={item}
                width="100%"
                height={58}
                borderRadius={borderRadius.md}
                style={styles.loadingOption}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // No questions available
  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.exitButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={colors.error} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mock Exam</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{t('exams.session.noQuestions')}</Text>
          <Text style={styles.emptySubtext}>
            {t('exams.session.noQuestionsMessage')}
          </Text>
          <Button
            title={t('common.back')}
            onPress={() => navigation.goBack()}
            style={styles.goBackButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = currentQuestion ? answers.get(currentQuestion.id) : undefined;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  
  // Calculate stats
  const answeredCount = Array.from(answers.values()).filter(a => a.selected_answer).length;
  const markedCount = Array.from(answers.values()).filter(a => a.is_marked).length;

  // Timer color
  const timerColor = timeRemaining < 60 ? colors.error : timeRemaining < 300 ? colors.warning : colors.success;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.exitButton} onPress={handleExitAttempt}>
          <Ionicons name="close" size={24} color={colors.error} />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <View style={[styles.timerContainer, { backgroundColor: timerColor + '20' }]}>
            <Ionicons name="time" size={20} color={timerColor} />
            <Text style={[styles.timerText, { color: timerColor }]}>
              {formatTime(timeRemaining)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.paletteButton}
          onPress={() => setShowPalette(!showPalette)}
        >
          <Ionicons name="grid" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Question Palette */}
      {showPalette && (
        <View style={styles.palette}>
          <Text style={styles.paletteTitle}>{t('exams.session.questionNavigator')}</Text>
          <ScrollView style={styles.paletteScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.paletteGrid}>
              {questions.map((q, index) => {
                const status = getQuestionStatus(q.id);
                return (
                  <TouchableOpacity
                    key={q.id}
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
                  </TouchableOpacity>
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
              <View style={[styles.legendBox, { borderColor: colors.border }]} />
              <Text style={styles.legendText}>{t('practice.navigator.unanswered')} ({questions.length - answeredCount})</Text>
            </View>
          </View>
        </View>
      )}

      {/* Question Content */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.questionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View>
            <Text style={styles.questionNumber}>
              {t('exams.session.questionCounter', { current: currentQuestionIndex + 1, total: questions.length })}
            </Text>
            <Text style={styles.subjectName}>{translateSubject(currentQuestion?.subject_name || '', t)}</Text>
            {/* Question Type Badge - show for non-MCQ types */}
            {(() => {
              const qType = currentQuestion?.question_type || 'mcq';
              if (qType === 'mcq') return null;
              return (
                <View style={[
                  styles.questionTypeBadge,
                  qType === 'codable_open' ? styles.codableOpenBadge : styles.writtenOpenBadge
                ]}>
                  <Text style={styles.questionTypeBadgeText}>
                    {qType === 'codable_open' 
                      ? `💻 ${t('exams.session.openQuestion')}` 
                      : `✍️ ${t('exams.session.situationQuestion')}`}
                  </Text>
                </View>
              );
            })()}
          </View>
          <TouchableOpacity
            onPress={() => setShowFeedbackModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Context card for Written Open Questions (Situasiya) */}
        {(currentQuestion?.question_type === 'written_open') && currentQuestion?.context_text && (
          <ContextFlipCard
            contextText={currentQuestion.context_text}
            contextImageUrl={currentQuestion.context_image_url}
            groupOrder={currentQuestion.group_order}
            labelText={`📝 ${t('exams.session.situation')}:`}
            tapToSeeImageText={t('exams.review.tapToSeeImage') || 'Şəkli görmək üçün toxun'}
            tapToSeeTextText={t('exams.review.tapToSeeText') || 'Mətni görmək üçün toxun'}
          />
        )}

        <Text style={styles.questionText}>{currentQuestion?.question_text}</Text>

        {/* Question Image */}
        {currentQuestion?.question_image_url && (
          <View style={styles.imageContainer}>
            {imageLoading && (
              <View style={styles.imageLoadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.imageLoadingText}>Loading image...</Text>
              </View>
            )}
            {imageError ? (
              <View style={styles.imageErrorContainer}>
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                <Text style={styles.imageErrorText}>Failed to load image</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={() => {
                    setImageError(false);
                    setImageLoading(true);
                  }}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
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

        {/* Answer Input - Different UI based on question type */}
        {(() => {
          const qType = currentQuestion?.question_type || 'mcq';
          
          if (qType === 'mcq') {
            return (
              <View style={styles.options}>
                {['A', 'B', 'C', 'D', 'E'].map((option) => {
                  const optionKey = `option_${option.toLowerCase()}` as keyof ExamQuestion;
                  const optionText = currentQuestion?.[optionKey] as string;
                  const isSelected = currentAnswer?.selected_answer === option;

                  if (!optionText) return null;

                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.option, isSelected && styles.optionSelected]}
                      onPress={() => handleSelectAnswer(option as 'A' | 'B' | 'C' | 'D' | 'E')}
                    >
                      <View style={[styles.optionCircle, isSelected && styles.optionCircleSelected]}>
                        <Text style={[styles.optionLetter, isSelected && styles.optionLetterSelected]}>
                          {option}
                        </Text>
                      </View>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {optionText}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          } else if (qType === 'codable_open') {
            return (
              <View style={styles.textAnswerContainer}>
                <Text style={styles.textAnswerLabel}>
                  {t('exams.session.yourAnswer')}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={textAnswer}
                  onChangeText={handleTextAnswerChange}
                  placeholder={t('exams.session.typeYourAnswer')}
                  placeholderTextColor={colors.textSecondary}
                  multiline={false}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.textInputHint}>
                  {t('exams.session.shortAnswerHint')}
                </Text>
              </View>
            );
          } else if (qType === 'written_open') {
            return (
              <View style={styles.textAnswerContainer}>
                <Text style={styles.textAnswerLabel}>
                  {t('exams.session.yourAnswer')}
                </Text>
                <TextInput
                  style={[styles.textInput, styles.textAreaInput]}
                  value={textAnswer}
                  onChangeText={handleTextAnswerChange}
                  placeholder={t('exams.session.writeYourAnswer')}
                  placeholderTextColor={colors.textSecondary}
                  multiline={true}
                  numberOfLines={8}
                  textAlignVertical="top"
                />
                <Text style={styles.textInputHint}>
                  {t('exams.session.essayHint')}
                </Text>

                {/* Image Upload Section - HIDDEN: DeepSeek AI doesn't support vision/image recognition
                    TODO: Re-enable when switching to a vision-capable AI model (e.g., GPT-4V, Claude 3, DeepSeek-VL2)
                    The backend code and state management are ready - just uncomment this section when AI supports images
                */}
                {/* 
                <View style={styles.imageUploadSection}>
                  <Text style={styles.imageUploadLabel}>
                    {t('exams.session.addImage')}
                  </Text>
                  
                  {answerImageUrl ? (
                    <View style={styles.uploadedImageContainer}>
                      <Image
                        source={{ uri: answerImageUrl }}
                        style={styles.uploadedImage}
                        resizeMode="contain"
                        onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
                      />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={handleRemoveImage}
                      >
                        <Ionicons name="close-circle" size={28} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.imageUploadButtons}>
                      <TouchableOpacity
                        style={styles.imageUploadButton}
                        onPress={() => handleImageUpload('camera')}
                        disabled={uploadingImage}
                      >
                        {uploadingImage ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="camera" size={24} color={colors.primary} />
                            <Text style={styles.imageUploadButtonText}>
                              {t('exams.session.takePhoto')}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.imageUploadButton}
                        onPress={() => handleImageUpload('gallery')}
                        disabled={uploadingImage}
                      >
                        {uploadingImage ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="images" size={24} color={colors.primary} />
                            <Text style={styles.imageUploadButtonText}>
                              {t('exams.session.chooseFromGallery')}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                */}
              </View>
            );
          }
          return null;
        })()}

        {/* Mark for Review */}
        <TouchableOpacity style={styles.markButton} onPress={handleMarkForReview}>
          <Ionicons
            name={currentAnswer?.is_marked ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={currentAnswer?.is_marked ? colors.warning : colors.textSecondary}
          />
          <Text style={styles.markButtonText}>
            {currentAnswer?.is_marked ? t('exams.session.markedForReview') : t('exams.session.markForReview')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Navigation Footer */}
      <View style={styles.footer}>
        <View style={styles.navigationButtons}>
          <View style={styles.navigationPrimaryRow}>
            <Button
              title={t('common.previous')}
              variant="outline"
              size="compact"
              onPress={handlePrevious}
              disabled={currentQuestionIndex === 0 || submitting}
              style={styles.navButton}
            />

            {isLastQuestion ? (
              <Button
                title={t('exams.session.submitExam')}
                size="compact"
                onPress={handleSubmitExam}
                loading={submitting}
                disabled={submitting}
                style={styles.submitButton}
              />
            ) : (
              <Button
                title={t('common.next')}
                size="compact"
                onPress={handleNext}
                disabled={submitting}
                style={styles.navButton}
              />
            )}
          </View>

          {!isLastQuestion && (
            <Button
              title={t('practice.session.finish')}
              variant="outline"
              size="compact"
              onPress={handleSubmitExam}
              loading={submitting}
              disabled={submitting}
              style={styles.finishButton}
            />
          )}
        </View>
      </View>
      </KeyboardAvoidingView>

      {/* Question Feedback Modal */}
      {questions.length > 0 && currentQuestionIndex < questions.length && (
        <QuestionFeedbackModal
          visible={showFeedbackModal}
          questionId={questions[currentQuestionIndex].id}
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
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadingHeaderText: {
    flex: 1,
  },
  loadingProgress: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  loadingContent: {
    flex: 1,
    padding: spacing.lg,
  },
  loadingQuestionCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    ...shadows.sm,
  },
  loadingLine: {
    marginTop: spacing.sm,
  },
  loadingCenteredLine: {
    marginTop: spacing.xs,
  },
  loadingOption: {
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  goBackButton: {
    minWidth: 200,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  placeholder: {
    width: 44,
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
  exitButton: {
    padding: spacing.xs,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  timerText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  paletteButton: {
    padding: spacing.xs,
  },
  palette: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: '50%',
  },
  paletteTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paletteScroll: {
    maxHeight: 300,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.sm,
  },
  paletteItem: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  paletteItemCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
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
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  paletteItemTextActive: {
    color: '#FFFFFF',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
  },
  legendText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  questionHeader: {
    marginBottom: spacing.xs,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: typography.fontWeights.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  subjectName: {
    fontSize: 11,
    color: colors.textSecondary,
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
  options: {
    gap: 6,
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCircleSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionLetter: {
    fontSize: 13,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  optionLetterSelected: {
    color: '#FFFFFF',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  optionTextSelected: {
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  markButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  markButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    padding: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  navigationButtons: {
    gap: spacing.sm,
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
  textAnswerContainer: {
    marginBottom: spacing.md,
  },
  textAnswerLabel: {
    fontSize: 14,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  textAreaInput: {
    minHeight: 120,
    paddingTop: spacing.sm,
  },
  textInputHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  // Question Type Badge styles
  questionTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  codableOpenBadge: {
    backgroundColor: '#E0F2FE',
  },
  writtenOpenBadge: {
    backgroundColor: '#E0E7FF',
  },
  questionTypeBadgeText: {
    fontSize: 12,
    fontWeight: typography.fontWeights.medium,
    color: '#1E40AF',
  },
  // Image Upload Styles
  imageUploadSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  imageUploadLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  imageUploadButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  imageUploadButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  imageUploadButtonText: {
    fontSize: typography.fontSizes.xs,
    color: colors.primary,
    textAlign: 'center',
  },
  uploadedImageContainer: {
    position: 'relative',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceVariant || '#f5f5f5',
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadedImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceVariant || '#f5f5f5',
  },
  removeImageButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
  },
});
