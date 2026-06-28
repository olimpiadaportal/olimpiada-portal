import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
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
import { OfflineScreen } from '../../components/OfflineScreen';
import { useTheme } from '../../contexts/ThemeContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { FadeIn } from '../../components/animated';

export const MockExamsListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors: themeColors } = useTheme();
  const { isOnline } = useNetworkStatus();
  const styles = React.useMemo(() => createStyles(themeColors), [themeColors]);
  const [exams, setExams] = useState<MockExamWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<ExamType | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<ExamGroup | 'all'>('all');

  useEffect(() => {
    loadExams();
  }, [selectedType, selectedGroup]);

  // Reload exams when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadExams();
    }, [selectedType, selectedGroup])
  );

  const loadExams = async () => {
    if (!user) {
      console.log('No user found');
      return;
    }
    
    setLoading(true);
    try {
      const type = selectedType === 'all' ? undefined : selectedType;
      const group = selectedGroup === 'all' ? undefined : selectedGroup;
      const data = await mockExamService.getMockExams(user.id, type, group);
      setExams(data);
    } catch (error) {
      console.error('Load exams error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (exam: MockExamWithStatus) => {
    // No resume feature - only show completed status
    if (exam.attempt_count > 0) {
      return { text: t(exam.attempt_count > 1 ? 'exams.status.attempts' : 'exams.status.attempt', { count: exam.attempt_count }), color: themeColors.success, icon: 'checkmark-circle' as const };
    }
    return { text: t('exams.status.notStarted'), color: themeColors.disabled, icon: 'time' as const };
  };

  const renderExamCard = ({ item, index }: { item: MockExamWithStatus; index: number }) => {
    const status = getStatusBadge(item);

    return (
      <FadeIn delay={index * 70} duration={400}>
      <TouchableOpacity
        onPress={() =>
          (navigation as any).navigate('MockExamDetails', { examId: item.id })
        }
      >
        <Card style={styles.examCard}>
          <View style={styles.examHeader}>
            <View style={styles.examInfo}>
              <Text style={styles.examTitle}>{item.title}</Text>
              <View style={styles.examMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color={themeColors.textSecondary} />
                  <Text style={styles.metaText}>{item.duration_minutes} {t('exams.list.min')}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="document-text-outline" size={14} color={themeColors.textSecondary} />
                  <Text style={styles.metaText}>{item.total_questions} {t('exams.list.questions')}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: item.exam_type === 'first_stage' ? themeColors.primary + '20' : item.exam_type === 'individual' ? '#8B5CF620' : themeColors.secondary + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: item.exam_type === 'first_stage' ? themeColors.primary : item.exam_type === 'individual' ? '#8B5CF6' : themeColors.secondary }]}>
                {item.exam_type === 'first_stage' ? t('exams.filters.firstStage') : item.exam_type === 'individual' ? t('teacherBuildExam.individual') : t('exams.filters.secondStage')}
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
                <Ionicons name="trophy" size={16} color={themeColors.warning} />
                <Text style={[styles.statText, { color: themeColors.text }]}>{t('exams.list.best')}: {item.best_score.toFixed(0)} pts</Text>
              </View>
            )}
          </View>

          {item.last_attempt_date && (
            <Text style={styles.lastAttempt}>
              {t('exams.list.lastAttempt')}: {formatShortDate(item.last_attempt_date, t('common.locale'))}
            </Text>
          )}
        </Card>
      </TouchableOpacity>
      </FadeIn>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="document-text-outline" size={64} color={themeColors.disabled} />
      <Text style={styles.emptyText}>{t('exams.noExams')}</Text>
      <Text style={styles.emptySubtext}>
        {t('exams.noExamsSubtext')}
      </Text>
    </View>
  );

  // Show offline screen when offline
  if (!isOnline) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('exams.title')}</Text>
          <Text style={styles.subtitle}>{t('exams.subtitle')}</Text>
        </View>
        <OfflineScreen 
          title={t('offline.examsTitle', 'Exams Unavailable')}
          message={t('offline.examsMessage', 'Mock exams require an internet connection. You can still practice with downloaded questions in Standard Mode.')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="document-text-outline"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('exams.title')}</Text>
        <Text style={styles.subtitle}>{t('exams.subtitle')}</Text>
      </View>

      {/* Filters */}
      <View style={styles.filtersSection}>
        {/* Exam Type Filter */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('exams.filters.examType')}:</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterButton, selectedType === 'all' && styles.filterButtonActive]}
              onPress={() => setSelectedType('all')}
            >
              <Text style={[styles.filterButtonText, selectedType === 'all' && styles.filterButtonTextActive]}>
                {t('exams.filters.all')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, selectedType === 'first_stage' && styles.filterButtonActive]}
              onPress={() => setSelectedType('first_stage')}
            >
              <Text style={[styles.filterButtonText, selectedType === 'first_stage' && styles.filterButtonTextActive]}>
                {t('exams.filters.firstStage')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, selectedType === 'second_stage' && styles.filterButtonActive]}
              onPress={() => setSelectedType('second_stage')}
            >
              <Text style={[styles.filterButtonText, selectedType === 'second_stage' && styles.filterButtonTextActive]}>
                {t('exams.filters.secondStage')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Group Filter */}
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>{t('exams.filters.group')}:</Text>
          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={[styles.filterButton, selectedGroup === 'all' && styles.filterButtonActive]}
              onPress={() => setSelectedGroup('all')}
            >
              <Text style={[styles.filterButtonText, selectedGroup === 'all' && styles.filterButtonTextActive]}>
                {t('exams.filters.all')}
              </Text>
            </TouchableOpacity>
            {(['I', 'II', 'III', 'IV', 'V'] as ExamGroup[]).map(group => (
              <TouchableOpacity
                key={group}
                style={[styles.filterButton, selectedGroup === group && styles.filterButtonActive]}
                onPress={() => setSelectedGroup(group)}
              >
                <Text style={[styles.filterButtonText, selectedGroup === group && styles.filterButtonTextActive]}>
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
              <View style={styles.examHeader}>
                <LoadingSkeleton width="70%" height={24} />
                <LoadingSkeleton width={80} height={28} borderRadius={borderRadius.full} />
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
                <LoadingSkeleton width="40%" height={16} />
                <LoadingSkeleton width="50%" height={16} />
                <LoadingSkeleton width="45%" height={16} />
              </View>
              <LoadingSkeleton width="100%" height={44} borderRadius={borderRadius.md} style={{ marginTop: spacing.md }} />
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={exams}
          renderItem={renderExamCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  filtersSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterRow: {
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  examCard: {
    marginBottom: spacing.md,
  },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  examInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  examTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  examMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  typeBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  examStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  resumeText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: '#FFFFFF',
  },
  lastAttempt: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
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
    paddingHorizontal: spacing.xl,
  },
});
