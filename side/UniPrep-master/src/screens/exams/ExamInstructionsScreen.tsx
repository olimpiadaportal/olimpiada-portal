// Exam Instructions Screen
// Dark mode support added - Phase 3

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { mockExamService } from '../../services/mockExamService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { Button } from '../../components/Button';
import { typography, spacing, borderRadius } from '../../constants/theme';

export const ExamInstructionsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { examId, examTitle, duration, totalQuestions } = route.params as {
    examId: string;
    examTitle: string;
    duration: number;
    totalQuestions: number;
  };

  const [understood, setUnderstood] = useState(false);
  const [starting, setStarting] = useState(false);
  const instructionRules = useMemo(
    () => [
      {
        icon: 'navigate-outline' as const,
        title: t('exams.instructions.rule2Title'),
        description: t('exams.instructions.rule2Description'),
      },
      {
        icon: 'bookmark-outline' as const,
        title: t('exams.instructions.rule3Title'),
        description: t('exams.instructions.rule3Description'),
      },
      {
        icon: 'save-outline' as const,
        title: t('exams.instructions.rule4Title'),
        description: t('exams.instructions.rule4Description'),
      },
      {
        icon: 'send-outline' as const,
        title: t('exams.instructions.rule5Title'),
        description: t('exams.instructions.rule5Description'),
      },
    ],
    [t]
  );

  const handleBeginExam = async () => {
    if (!user || !understood) return;

    setStarting(true);
    try {
      // Get exam questions to store their IDs
      const questions = await mockExamService.getExamQuestions(examId);
      const questionIds = questions.map(q => q.id);
      
      const attemptId = await mockExamService.startExamAttempt(user.id, examId, duration, questionIds);
      
      if (attemptId) {
        // Navigate to exam screen
        (navigation as any).navigate('MockExam', { attemptId });
      }
    } catch (error) {
      console.error('Start exam error:', error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('exams.instructions.title')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Exam Info */}
          <View style={styles.examInfo}>
            <Ionicons name="document-text" size={48} color={colors.primary} />
            <Text style={styles.examTitle}>{examTitle}</Text>
            <View style={styles.examMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="time" size={20} color={colors.textSecondary} />
                <Text style={styles.metaText}>{t('exams.instructions.minutes', { count: duration })}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.metaText}>{t('exams.instructions.questions', { count: totalQuestions })}</Text>
              </View>
            </View>
          </View>

          {/* Important Notice */}
          <View style={styles.noticeBox}>
            <Ionicons name="alert-circle" size={24} color={colors.warning} />
            <Text style={styles.noticeText}>
              {t('exams.instructions.timedNotice')}
            </Text>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exams.instructions.examRules')}</Text>
            {instructionRules.map((rule) => (
              <View key={rule.title} style={styles.ruleItem}>
                <View style={styles.ruleIcon}>
                  <Ionicons name={rule.icon} size={18} color={colors.primary} />
                </View>
                <View style={styles.ruleContent}>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                  <Text style={styles.ruleDescription}>{rule.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Timer Warnings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exams.instructions.timerWarnings')}</Text>
            <Text style={styles.sectionDescription}>
              {t('exams.instructions.timerWarningsDescription')}
            </Text>
            
            <View style={styles.warningsList}>
              <View style={styles.warningItem}>
                <Ionicons name="notifications" size={20} color={colors.warning} />
                <Text style={styles.warningText}>{t('exams.instructions.warning10min')}</Text>
              </View>
              <View style={styles.warningItem}>
                <Ionicons name="notifications" size={20} color={colors.warning} />
                <Text style={styles.warningText}>{t('exams.instructions.warning5min')}</Text>
              </View>
              <View style={styles.warningItem}>
                <Ionicons name="notifications" size={20} color={colors.error} />
                <Text style={styles.warningText}>{t('exams.instructions.warning1min')}</Text>
              </View>
            </View>
          </View>

          {/* Scoring Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('exams.instructions.scoring')}</Text>
            <View style={styles.scoringBox}>
              <View style={styles.scoringItem}>
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                <Text style={styles.scoringText}>{t('exams.instructions.correctAnswer')}</Text>
              </View>
              <View style={styles.scoringItem}>
                <Ionicons name="close-circle" size={24} color={colors.error} />
                <Text style={styles.scoringText}>{t('exams.instructions.wrongAnswer')}</Text>
              </View>
              <View style={styles.scoringItem}>
                <Ionicons name="help-circle" size={24} color={colors.textTertiary} />
                <Text style={styles.scoringText}>{t('exams.instructions.unanswered')}</Text>
              </View>
            </View>
          </View>

          {/* Confirmation Checkbox */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setUnderstood(!understood)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, understood && styles.checkboxChecked]}>
              {understood && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              {t('exams.instructions.confirmationText')}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            title={t('exams.instructions.beginExam')}
            onPress={handleBeginExam}
            disabled={!understood}
            loading={starting}
            style={styles.beginButton}
          />
        </View>
      </SafeAreaView>
    </Modal>
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
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  examInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  examTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  examMeta: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    marginBottom: spacing.xl,
  },
  noticeText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  ruleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleContent: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  ruleDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  warningsList: {
    gap: spacing.sm,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  warningText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  scoringBox: {
    backgroundColor: colors.surfaceVariant,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  scoringItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoringText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.primary + '30',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  beginButton: {
    width: '100%',
  },
});
