import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { mockExamService } from '../../services/mockExamService';
import { useAuthStore } from '../../store/authStore';
import { MockExamWithStatus } from '../../types/mockExam';
import { Card } from '../../components/Card';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { SectionHeader, StatusBadge } from '../../components/ui';

export const TeacherExamListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { teacherId, teacherName, teacherAvatar } = route.params as {
    teacherId: string;
    teacherName: string;
    teacherAvatar?: string;
  };

  const [exams, setExams] = useState<MockExamWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadExams();
    }, [teacherId, user?.id])
  );

  const loadExams = async () => {
    if (!user) {
      setExams([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await mockExamService.getTeacherApprovedExams(teacherId, user.id);
      setExams(data);
    } catch (error) {
      console.error('Load teacher exams error:', error);
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

  const getGroupLabel = (exam: MockExamWithStatus) => {
    if (!exam.target_group) return null;
    return `${t('exams.filters.group')} ${exam.target_group}`;
  };

  const getExamTypeLabel = (exam: MockExamWithStatus) => {
    if (exam.exam_type === 'first_stage') return t('exams.filters.firstStage');
    if (exam.exam_type === 'individual') return t('teacherBuildExam.individual');
    return t('exams.filters.secondStage');
  };

  const getSourceBadge = (exam: MockExamWithStatus) => {
    const isTeacherExam = Boolean(exam.created_by_teacher || exam.uses_teacher_questions);

    return {
      label: isTeacherExam ? t('teacherExams.teacherExamBadge') : 'Elmly',
      icon: isTeacherExam ? 'person-outline' as const : 'school-outline' as const,
      variant: isTeacherExam ? 'neutral' as const : 'info' as const,
    };
  };

  const renderExamCard = ({ item }: { item: MockExamWithStatus }) => {
    const status = getStatusBadge(item);
    const groupLabel = getGroupLabel(item);
    const sourceBadge = getSourceBadge(item);

    return (
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.82}
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
                {groupLabel && (
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                    <Text style={styles.metaText}>{groupLabel}</Text>
                  </View>
                )}
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
                numberOfLines={1}
              >
                {getExamTypeLabel(item)}
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
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with teacher info */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        {teacherAvatar ? (
          <Image source={{ uri: teacherAvatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={18} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerName}>{teacherName}</Text>
        </View>
      </View>

      <View style={styles.noticeSection}>
        <SectionHeader
          title={t('examsHub.teacherExams')}
          subtitle={t('examsHub.noLeaderboard')}
          style={styles.noticeHeader}
        />
      </View>

      {loading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <Card key={i} style={styles.examCard}>
              <View style={styles.skeletonTopRow}>
                <LoadingSkeleton width="56%" height={22} />
                <LoadingSkeleton width={92} height={28} borderRadius={borderRadius.full} />
              </View>
              <LoadingSkeleton width="84%" height={16} style={styles.skeletonLine} />
              <LoadingSkeleton width="64%" height={16} style={styles.skeletonLine} />
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
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    avatarPlaceholder: {
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerText: { flex: 1 },
    headerName: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: typography.fontWeights.bold,
    },
    noticeSection: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    noticeHeader: {
      marginBottom: 0,
    },
    listContent: { padding: spacing.lg, gap: spacing.md },
    examCard: { padding: spacing.lg },
    examHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    examInfo: { flex: 1, marginRight: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    examTitle: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: typography.fontWeights.semibold,
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
      maxWidth: 112,
    },
    typeBadgeText: {
      fontSize: typography.fontSizes.xs,
      fontWeight: typography.fontWeights.semibold,
    },
    examStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
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
