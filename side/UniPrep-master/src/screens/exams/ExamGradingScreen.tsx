// Exam Grading Screen
// Shows progress while grading exam questions
// Displays checkmarks as each question type is graded

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, CommonActions, useFocusEffect } from '@react-navigation/native';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { mockExamService } from '../../services/mockExamService';
import { supabase } from '../../services/supabase';
import { useAlert } from '../../components/AlertProvider';
import { Card } from '../../components/Card';

interface GradingStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  count?: number;
}

interface RouteParams {
  attemptId: string;
  mcqCount: number;
  codableCount: number;
  writtenCount: number;
}

export const ExamGradingScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { showError } = useAlert();
  
  const { attemptId, mcqCount, codableCount, writtenCount } =
    route.params as RouteParams;

  const [steps, setSteps] = useState<GradingStep[]>([
    {
      id: 'mcq',
      label: t('exams.grading.mcqQuestions'),
      status: 'pending',
      count: mcqCount,
    },
    {
      id: 'codable',
      label: t('exams.grading.codableQuestions'),
      status: 'pending',
      count: codableCount,
    },
    {
      id: 'written',
      label: t('exams.grading.writtenQuestions'),
      status: 'pending',
      count: writtenCount,
    },
  ]);

  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isGrading, setIsGrading] = useState(true);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef(steps.map(() => new Animated.Value(1))).current;
  const progressListenerRef = useRef<string | null>(null);

  // Prevent back navigation during grading
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (isGrading) {
          return true; // Block the back action
        }
        return false; // Allow back navigation
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [isGrading])
  );

  // Stop all animations on unmount to prevent stopTracking crash on Hermes
  useEffect(() => {
    startGrading();
    return () => {
      try { progressAnim.stopAnimation(); } catch (_) {}
      if (progressListenerRef.current) {
        try { progressAnim.removeListener(progressListenerRef.current); } catch (_) {}
      }
      scaleAnims.forEach(a => { try { a.stopAnimation(); } catch (_) {} });
    };
  }, []);

  const startGrading = async () => {
    try {
      // Step 1: Submit exam and grade MCQ/Codable (instant)
      updateStep(0, 'in_progress');
      await simulateDelay(300);

      const result = await mockExamService.submitExam(attemptId);

      if (!result) {
        throw new Error('Failed to submit exam - submitExam returned null');
      }

      updateStep(0, 'completed');
      animateCheckmark(0);

      // Step 2: Codable Open (already graded in submitExam)
      updateStep(1, 'in_progress');
      await simulateDelay(300);
      updateStep(1, 'completed');
      animateCheckmark(1);

      // Step 3: Grade Written Open Questions with AI
      if (writtenCount > 0) {
        updateStep(2, 'in_progress');

        const { data: answers, error: fetchError } = await supabase
          .from('exam_answers')
          .select('*')
          .eq('attempt_id', attemptId);

        if (fetchError) {
          console.error('❌ [ExamGradingScreen] Error fetching answers:', fetchError);
          throw fetchError;
        }

        // Fetch question types separately (no FK relationship to join on)
        const questionIds = [...new Set((answers || []).map((a: any) => a.question_id).filter(Boolean))];
        let questionTypeMap: Record<string, string> = {};
        if (questionIds.length > 0) {
          const { data: questions } = await supabase
            .from('questions')
            .select('id, question_type')
            .in('id', questionIds);
          questionTypeMap = Object.fromEntries((questions || []).map((q: any) => [q.id, q.question_type]));
        }

        const writtenAnswers = (answers || [])
          .filter((a: any) => questionTypeMap[a.question_id] === 'written_open')
          .map((a: any) => ({
            answer_id: a.id,
            question_id: a.question_id,
            text_answer: a.text_answer || '',
            image_url: a.image_url,
          }));

        if (writtenAnswers.length === 0) {
          console.log('[ExamGradingScreen] No written_open answers found — skipping AI grading');
        } else {
          const hasAnyContent = writtenAnswers.some(
            (a: any) => (a.text_answer && a.text_answer.trim()) || a.image_url
          );
          if (!hasAnyContent) {
            console.log('[ExamGradingScreen] All written_open answers are blank — skipping AI grading (score = 0)');
          } else {
          // Sync animated value → progress state for % text display
          progressListenerRef.current = progressAnim.addListener(({ value }) => {
            setProgress(Math.round(value * 100));
          });

          // Phase 1: fast smooth rise to 80% (2.5s, cubic ease-out)
          // Phase 2: very slow crawl 80% → 99% (30s max, quad ease-out)
          // Edge fn return: stop wherever we are, snap to 100%
          progressAnim.setValue(0);
          Animated.timing(progressAnim, {
            toValue: 0.8,
            duration: 5000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (!finished) return; // edge fn already returned during phase 1
            Animated.timing(progressAnim, {
              toValue: 0.99,
              duration: 30000,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }).start();
          });

          const gradingResult = await mockExamService.gradeOpenQuestions(attemptId, writtenAnswers);

          // Edge fn returned — stop the running animation, clean up listener
          progressAnim.stopAnimation();
          if (progressListenerRef.current) {
            progressAnim.removeListener(progressListenerRef.current);
            progressListenerRef.current = null;
          }

          if (!gradingResult.success) {
            console.error('❌ [ExamGradingScreen] AI grading failed:', gradingResult.error);
            // Continue anyway - questions will show as pending
          } else {
            await mockExamService.recalculateScoresAfterAIGrading(attemptId);
            // Wait for database transaction to commit and replicate before navigating
            await simulateDelay(2000);
          }
          } // end hasAnyContent else
        } // end writtenAnswers.length > 0 else

        // Animate to 100% then continue
        await new Promise<void>(resolve => {
          Animated.timing(progressAnim, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }).start(() => {
            setProgress(100);
            resolve();
          });
        });

        await simulateDelay(300);
        updateStep(2, 'completed');
        animateCheckmark(2);
      } else {
        updateStep(2, 'completed');
      }

      // All done - navigate to results
      await simulateDelay(500);

      setIsGrading(false); // Allow navigation now
      
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'ExamsHub' },
            { name: 'ExamResults', params: { attemptId } },
          ],
        })
      );
      
    } catch (error) {
      console.error('❌ [ExamGradingScreen] Grading error:', error);
      setIsGrading(false); // Allow navigation on error
      
      showError(
        t('common.error'),
        'Failed to grade exam. Please try again.'
      );
      
      // Navigate back to exam list on error
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'ExamsHub' }],
        })
      );
    }
  };

  const updateStep = (index: number, status: GradingStep['status']) => {
    setSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, status } : step
    ));
    if (status === 'in_progress') {
      setCurrentStep(index);
    }
  };

  const animateCheckmark = (index: number) => {
    Animated.sequence([
      Animated.timing(scaleAnims[index], {
        toValue: 1.2,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(scaleAnims[index], {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const simulateDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const renderStep = (step: GradingStep, index: number) => {
    const isActive = step.status === 'in_progress';
    const isCompleted = step.status === 'completed';
    const isWrittenStep = step.id === 'written';

    return (
      <Animated.View 
        key={step.id}
        style={[
          styles.stepContainer,
          isActive && styles.stepContainerActive,
          { opacity: scaleAnims[index] },
        ]}
      >
        <View style={styles.stepIconContainer}>
          {isCompleted ? (
            <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            </View>
          ) : isActive ? (
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : (
            <View style={[styles.checkCircle, { backgroundColor: colors.border }]}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
            </View>
          )}
        </View>

        <View style={styles.stepContent}>
          <View style={styles.stepHeader}>
            <Text style={[
              styles.stepLabel,
              isCompleted && styles.stepLabelCompleted,
              isActive && styles.stepLabelActive,
            ]}>
              {step.label}
            </Text>
            {step.count !== undefined && step.count > 0 && (
              <Text style={styles.stepCount}>({step.count})</Text>
            )}
          </View>

          {isActive && isWrittenStep && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                {t('exams.grading.aiAnalyzing')}
              </Text>
              <View style={styles.progressBarContainer}>
                <Animated.View 
                  style={[
                    styles.progressBar,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]} 
                />
              </View>
              <Text style={styles.progressPercent}>{progress}%</Text>
            </View>
          )}

          {isCompleted && (
            <Text style={styles.stepStatus}>
              {step.count === 0 ? t('exams.grading.noQuestions') : t('exams.grading.done')}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Card style={styles.headerCard}>
          <Ionicons name="document-text" size={48} color={colors.primary} />
          <Text style={styles.title}>{t('exams.grading.title')}</Text>
          <Text style={styles.subtitle}>{t('exams.grading.subtitle')}</Text>
        </Card>

        <View style={styles.stepsContainer}>
          {steps.map((step, index) => renderStep(step, index))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('exams.grading.pleaseWait')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  headerCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  stepsContainer: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepContainerActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  stepIconContainer: {
    marginRight: spacing.md,
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
    color: colors.textSecondary,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  stepLabelCompleted: {
    color: colors.success,
  },
  stepLabelActive: {
    color: colors.primary,
  },
  stepCount: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  stepStatus: {
    fontSize: typography.fontSizes.sm,
    color: colors.success,
    marginTop: spacing.xs,
  },
  progressContainer: {
    marginTop: spacing.sm,
  },
  progressText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  footerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
});

export default ExamGradingScreen;
