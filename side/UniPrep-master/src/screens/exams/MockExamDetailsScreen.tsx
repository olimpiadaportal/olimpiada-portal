// Mock Exam Details Screen
// Dark mode support added - Phase 3

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { mockExamService } from '../../services/mockExamService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { MockExamWithStatus, GROUP_SCORING, getSubjectMaxPoints } from '../../types/mockExam';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ErrorState, StatusBadge } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { Stagger } from '../../components/animated';
import { translateSubject } from '../../utils/subjectTranslation';

export const MockExamDetailsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { examId, returnTo } = route.params as { examId: string; returnTo?: string };
  
  const [exam, setExam] = useState<MockExamWithStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExamDetails();
  }, [examId]);

  const loadExamDetails = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const data = await mockExamService.getMockExamDetails(examId, user.id);
      setExam(data);
    } catch (error) {
      console.error('Load exam details error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = async () => {
    if (!user || !exam) return;

    // No resume feature - always show instructions for new exam
    (navigation as any).navigate('ExamInstructions', {
      examId: exam.id,
      examTitle: exam.title,
      duration: exam.duration_minutes,
      totalQuestions: exam.total_questions,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <LoadingSkeleton height={28} width="78%" style={styles.loadingTitle} />
            <View style={styles.loadingBadgeRow}>
              <LoadingSkeleton height={28} width={86} borderRadius={borderRadius.full} />
              <LoadingSkeleton height={28} width={104} borderRadius={borderRadius.full} />
            </View>
          </View>
        </View>
        <View style={styles.content}>
          {[1, 2, 3].map((item) => (
            <Card key={item} style={styles.card}>
              <LoadingSkeleton height={22} width="56%" />
              <LoadingSkeleton height={18} width="88%" style={styles.loadingLine} />
              <LoadingSkeleton height={18} width="72%" style={styles.loadingLine} />
            </Card>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ErrorState
          title={t('exams.details.notFound')}
          actionLabel={t('common.back')}
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  const isTeacherExam = !!exam.created_by_teacher;
  const scoringConfig = isTeacherExam ? null : GROUP_SCORING[exam.target_group];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (returnTo) {
                navigation.navigate(returnTo as never);
              } else {
                navigation.goBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.title}>{exam.title}</Text>
            <View style={styles.badges}>
              {exam.target_group && (
                <StatusBadge
                  label={`${t('exams.details.group')} ${exam.target_group}`}
                  variant="info"
                />
              )}
              <StatusBadge
                label={
                  exam.exam_type === 'first_stage'
                    ? t('exams.details.firstStage')
                    : exam.exam_type === 'individual'
                      ? t('teacherBuildExam.individual')
                      : t('exams.details.secondStage')
                }
                variant="accent"
              />
              {isTeacherExam && (
                <StatusBadge label={t('teacherExams.teacherExamBadge')} variant="neutral" />
              )}
            </View>
          </View>
        </View>

        <Stagger delay={100} initialDelay={100} distance={20}>
        <View style={styles.content}>
          {/* Exam Info Card */}
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('exams.details.examInformation')}</Text>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Ionicons name="time" size={20} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{t('exams.details.duration')}</Text>
                  <Text style={styles.infoValue}>{t('exams.details.minutes', { count: exam.duration_minutes })}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="document-text" size={20} color={colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{t('exams.details.questions')}</Text>
                  <Text style={styles.infoValue}>{t('exams.details.questionsCount', { count: exam.total_questions })}</Text>
                </View>
              </View>
              {!isTeacherExam && scoringConfig && (
                <>
                  <View style={styles.infoItem}>
                    <Ionicons name="trophy" size={20} color={colors.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>{t('exams.details.maxPoints')}</Text>
                      <Text style={styles.infoValue}>{t('exams.details.points', { count: scoringConfig.max_total_points })}</Text>
                    </View>
                  </View>
                  <View style={styles.infoItem}>
                    <Ionicons name="school" size={20} color={colors.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>{t('exams.details.subjects')}</Text>
                      <Text style={styles.infoValue}>{t('exams.details.subjectsCount', { count: scoringConfig.subjects.length })}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </Card>

          {/* Subject Breakdown — official exams only */}
          {!isTeacherExam && scoringConfig && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('exams.details.subjectBreakdown')}</Text>
            {scoringConfig.subjects.map((subject, index) => {
              const maxPoints = getSubjectMaxPoints(exam.target_group, subject.name);
              return (
                <View key={index} style={styles.subjectRow}>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.subjectName}>{translateSubject(subject.name, t)}</Text>
                    <Text style={styles.subjectMeta}>
                      {t('exams.details.questionsCount', { count: subject.questions })} • {t('exams.details.coefficient')}: {subject.coefficient}×
                    </Text>
                  </View>
                  <View style={styles.subjectPoints}>
                    <Text style={styles.pointsValue}>
                      {maxPoints}
                    </Text>
                    <Text style={styles.pointsLabel}>{t('exams.details.maxPts')}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
          )}

          {/* Previous Attempts */}
          {exam.attempt_count > 0 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{t('exams.details.yourPerformance')}</Text>
              <View style={styles.performanceGrid}>
                <View style={styles.performanceItem}>
                  <Text style={styles.performanceValue}>{exam.attempt_count}</Text>
                  <Text style={styles.performanceLabel}>{t('exams.details.attempts')}</Text>
                </View>
                {exam.best_score !== undefined && (
                  <View style={styles.performanceItem}>
                    <Text style={[styles.performanceValue, { color: colors.success }]}>
                      {exam.best_score.toFixed(0)}
                    </Text>
                    <Text style={styles.performanceLabel}>{t('exams.details.bestScore')}</Text>
                  </View>
                )}
                {exam.best_score !== undefined && !isTeacherExam && scoringConfig && (
                  <View style={styles.performanceItem}>
                    <Text style={[styles.performanceValue, { color: colors.primary }]}>
                      {((exam.best_score / scoringConfig.max_total_points) * 100).toFixed(1)}%
                    </Text>
                    <Text style={styles.performanceLabel}>{t('exams.details.percentage')}</Text>
                  </View>
                )}
              </View>
            </Card>
          )}
        </View>
        </Stagger>
      </ScrollView>

      {/* Start Button */}
      <View style={styles.footer}>
        <Button
          title={t('exams.details.startExam')}
          onPress={handleStartExam}
          style={styles.startButton}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  backButton: {
    marginRight: spacing.md,
    marginTop: spacing.xs,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  loadingTitle: {
    marginBottom: spacing.sm,
  },
  loadingBadgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  loadingLine: {
    marginTop: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + 80,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  infoGrid: {
    gap: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subjectMeta: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  subjectPoints: {
    alignItems: 'flex-end',
  },
  pointsValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
  },
  pointsLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  performanceItem: {
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  performanceLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    width: '100%',
  },
});
