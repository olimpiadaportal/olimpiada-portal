import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { mockExamService } from '../../services/mockExamService';
import { useAuthStore } from '../../store/authStore';
import { MockExamWithStatus, ExamType, ExamGroup } from '../../types/mockExam';
import { Card } from '../../components/Card';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { FadeIn } from '../../components/animated';
import { SectionHeader, StatusBadge } from '../../components/ui';

export const OfficialExamsListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [exams, setExams] = useState<MockExamWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<ExamType | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<ExamGroup | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      loadExams();
    }, [selectedType, selectedGroup])
  );

  const loadExams = async () => {
    if (!user) {
      setExams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const type = selectedType === 'all' ? undefined : selectedType;
      const group = selectedGroup === 'all' ? undefined : selectedGroup;
      const data = await mockExamService.getMockExams(user.id, type, group, true);
      setExams(data);
    } catch (error) {
      console.error('Load official exams error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (exam: MockExamWithStatus) => {
    if (exam.attempt_count > 0) {
      return {
        text: t(
          exam.attempt_count > 1 ? 'exams.status.attempts' : 'exams.status.attempt',
          { count: exam.attempt_count }
        ),
        color: colors.success,
        icon: 'checkmark-circle' as const,
      };
    }
    return { text: t('exams.status.notStarted'), color: colors.disabled, icon: 'time' as const };
  };

  const getSourceBadge = (exam: MockExamWithStatus) => {
    const isTeacherExam = Boolean(exam.created_by_teacher || exam.uses_teacher_questions || exam.is_official === false);

    return {
      label: isTeacherExam ? t('teacherExams.teacherExamBadge') : 'Elmly',
      icon: isTeacherExam ? 'person-outline' as const : 'school-outline' as const,
      variant: isTeacherExam ? 'neutral' as const : 'info' as const,
    };
  };

  const renderExamCard = ({ item, index }: { item: MockExamWithStatus; index: number }) => {
    const status = getStatusBadge(item);
    const sourceBadge = getSourceBadge(item);

    return (
      <FadeIn delay={index * 70} duration={400}>
        <TouchableOpacity
          onPress={() => navigation.navigate('MockExamDetails', { examId: item.id })}
        >
          <Card style={styles.examCard}>
            <View style={styles.examHeader}>
              <View style={styles.examInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.examTitle} numberOfLines={2}>{item.title}</Text>
                  <StatusBadge
                    label={sourceBadge.label}
                    icon={sourceBadge.icon}
                    variant={sourceBadge.variant}
                  />
                </View>
                <View style={styles.examMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.metaText}>
                      {item.duration_minutes} {t('exams.list.min')}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.metaText}>
                      {item.total_questions} {t('exams.list.questions')}
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor:
                      item.exam_type === 'first_stage'
                        ? colors.primary + '20'
                        : colors.secondary + '20',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    {
                      color:
                        item.exam_type === 'first_stage' ? colors.primary : colors.secondary,
                    },
                  ]}
                >
                  {item.exam_type === 'first_stage'
                    ? t('exams.filters.firstStage')
                    : t('exams.filters.secondStage')}
                </Text>
              </View>
            </View>

            <View style={styles.examStats}>
              <View style={styles.statItem}>
                <Ionicons name={status.icon} size={16} color={status.color} />
                <Text style={[styles.statText, { color: status.color }]}>{status.text}</Text>
              </View>
              {item.best_score !== undefined && (
                <View style={styles.statItem}>
                  <Ionicons name="trophy" size={16} color={colors.warning} />
                  <Text style={[styles.statText, { color: colors.text }]}>
                    {t('exams.list.best')}: {item.best_score.toFixed(0)} pts
                  </Text>
                </View>
              )}
            </View>

            {item.last_attempt_date && (
              <Text style={styles.lastAttempt}>
                {t('exams.list.lastAttempt')}:{' '}
                {formatShortDate(item.last_attempt_date, t('common.locale'))}
              </Text>
            )}
          </Card>
        </TouchableOpacity>
      </FadeIn>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('examsHub.officialTitle')}</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        <SectionHeader
          title={t('exams.available')}
          style={styles.filtersHeader}
        />
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('exams.filters.examType')}:</Text>
          <View style={styles.filterButtons}>
            {(['all', 'first_stage', 'second_stage'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.filterButton, selectedType === type && styles.filterButtonActive]}
                onPress={() => setSelectedType(type)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedType === type && styles.filterButtonTextActive,
                  ]}
                >
                  {type === 'all'
                    ? t('exams.filters.all')
                    : type === 'first_stage'
                    ? t('exams.filters.firstStage')
                    : t('exams.filters.secondStage')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('exams.filters.group')}:</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterButton, selectedGroup === 'all' && styles.filterButtonActive]}
              onPress={() => setSelectedGroup('all')}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  selectedGroup === 'all' && styles.filterButtonTextActive,
                ]}
              >
                {t('exams.filters.all')}
              </Text>
            </TouchableOpacity>
            {(['I', 'II', 'III', 'IV', 'V'] as ExamGroup[]).map((group) => (
              <TouchableOpacity
                key={group}
                style={[
                  styles.filterButton,
                  selectedGroup === group && styles.filterButtonActive,
                ]}
                onPress={() => setSelectedGroup(group)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedGroup === group && styles.filterButtonTextActive,
                  ]}
                >
                  {t(`exams.filters.group${group}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <Card key={i} style={styles.examCard}>
              <View style={styles.skeletonTopRow}>
                <LoadingSkeleton width="58%" height={22} />
                <LoadingSkeleton width={72} height={28} borderRadius={borderRadius.full} />
              </View>
              <LoadingSkeleton width="86%" height={16} style={styles.skeletonLine} />
              <LoadingSkeleton width="62%" height={16} style={styles.skeletonLine} />
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={exams}
          renderItem={renderExamCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={colors.disabled} />
              <Text style={styles.emptyText}>{t('exams.noExams')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },
    backButton: { padding: 4 },
    headerText: { flex: 1 },
    title: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    filtersSection: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    filtersHeader: {
      marginBottom: spacing.xs,
    },
    filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    filterLabel: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      fontWeight: typography.fontWeights.semibold,
    },
    filterButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    filterButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    filterButtonText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    filterButtonTextActive: { color: '#fff' },
    listContent: { padding: spacing.lg, gap: spacing.md },
    examCard: { padding: spacing.lg },
    examHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    examInfo: { flex: 1, marginRight: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    examTitle: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
      lineHeight: typography.fontSizes.md * typography.lineHeights.tight,
    },
    examMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    typeBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    typeBadgeText: {
      fontSize: typography.fontSizes.xs,
      fontWeight: typography.fontWeights.semibold,
    },
    examStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statText: {
      fontSize: typography.fontSizes.xs,
    },
    lastAttempt: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    emptyContainer: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
    emptyText: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    skeletonTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    skeletonLine: {
      marginTop: spacing.sm,
    },
  });
