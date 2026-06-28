import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { teacherExamService, TeacherExamSummary } from '../../services/teacherExamService';
import { supabase } from '../../services/supabase';
import { Card } from '../../components/Card';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { FadeIn } from '../../components/animated';
import { AppPressable, StatusBadge } from '../../components/ui';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';

type NavigationProp = StackNavigationProp<RootStackParamList>;

interface Props {
  navigation: NavigationProp;
}

const STATUS_COLORS = {
  draft: { label: 'teacherExams.status.draft', variant: 'neutral' as const },
  pending: { label: 'teacherExams.status.pending', variant: 'warning' as const },
  approved: { label: 'teacherExams.status.approved', variant: 'success' as const },
};

export const TeacherMyExamsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [exams, setExams] = useState<TeacherExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadExams();
    }, [user?.id]),
  );

  const loadExams = async (options: { showLoader?: boolean } = {}) => {
    const shouldShowLoader = options.showLoader ?? !hasLoadedRef.current;
    if (shouldShowLoader) setLoading(true);
    try {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (!teacher) {
        setLoading(false);
        return;
      }
      setTeacherId(teacher.id);
      const data = await teacherExamService.getMyExams(teacher.id);
      setExams(data);
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('loadExams error:', err);
    } finally {
      if (shouldShowLoader) setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!teacherId) return;
    setRefreshing(true);
    try {
      const data = await teacherExamService.getMyExams(teacherId);
      setExams(data);
    } catch (err) {
      console.error('handleRefresh error:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = (exam: TeacherExamSummary) => {
    Alert.alert(
      t('teacherExams.deleteTitle'),
      t('teacherExams.deleteConfirm', { title: exam.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!teacherId) return;
            const ok = await teacherExamService.deleteExam(teacherId, exam.id);
            if (ok) loadExams({ showLoader: false });
          },
        },
      ],
    );
  };

  const getExamTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      first_stage: t('exams.filters.firstStage'),
      second_stage: t('exams.filters.secondStage'),
      full_exam: t('teacherExams.fullExam'),
      individual: t('teacherBuildExam.individual'),
    };
    return map[type] || type;
  };

  const renderLoadingCards = () => (
    <View style={styles.list}>
      {[1, 2, 3].map((item) => (
        <Card key={item} style={styles.card}>
          <View style={styles.skeletonTopRow}>
            <LoadingSkeleton width="58%" height={22} />
            <LoadingSkeleton width={86} height={28} borderRadius={borderRadius.full} />
          </View>
          <LoadingSkeleton width="88%" height={16} style={styles.skeletonLine} />
          <LoadingSkeleton width="62%" height={16} style={styles.skeletonLine} />
        </Card>
      ))}
    </View>
  );

  const renderExamCard = ({ item }: { item: TeacherExamSummary }) => {
    const isDraft = item.is_draft;
    const isPending = !item.is_approved;
    const status = isDraft ? STATUS_COLORS.draft : (isPending ? STATUS_COLORS.pending : STATUS_COLORS.approved);

    return (
      <FadeIn duration={260}>
      <Card style={styles.card}>
          {/* Title row */}
          <View style={styles.cardHeader}>
            <Text style={styles.examTitle} numberOfLines={2}>{item.title}</Text>
            <StatusBadge
              label={t(status.label)}
              variant={status.variant}
              style={styles.statusBadge}
            />
          </View>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.metaText}>{getExamTypeLabel(item.exam_type)}</Text>
            </View>
            {item.target_group && (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.metaText}>{t('teacherExams.group', { group: item.target_group })}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.metaText}>{item.question_count}/{item.total_questions} {t('teacherExams.questions')}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.metaText}>{item.duration_minutes} {t('exams.list.min')}</Text>
            </View>
          </View>

          <Text style={styles.dateText}>
            {t('teacherExams.submitted')} {formatShortDate(item.created_at, t('common.locale'))}
          </Text>

          {/* Draft notice */}
          {isDraft && (
            <View style={styles.approvedNotice}>
              <Ionicons name="create-outline" size={14} color="#6B7280" />
              <Text style={[styles.approvedNoticeText, { color: '#6B7280' }]}>
                {t('teacherExams.draftNotice', {
                  added: item.question_count,
                  total: item.total_questions,
                })}
              </Text>
            </View>
          )}

          {/* Notice for approved exams */}
          {item.is_approved && !isDraft && (
            <View style={styles.approvedNotice}>
              <Ionicons name="checkmark-circle" size={14} color="#059669" />
              <Text style={styles.approvedNoticeText}>{t('teacherExams.approvedNotice')}</Text>
            </View>
          )}

          {/* Actions — edit and delete only for pending exams */}
          {isPending && (
            <View style={styles.actionsRow}>
              <AppPressable
                accessibilityLabel={t('common.edit')}
                style={styles.editButton}
                onPress={() => navigation.navigate('TeacherBuildExam', { examId: item.id })}
              >
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={[styles.editText, { color: colors.primary }]}>
                  {t('common.edit')}
                </Text>
              </AppPressable>
              <AppPressable
                accessibilityLabel={t('common.delete')}
                style={styles.deleteButton}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error || '#EF4444'} />
                <Text style={[styles.deleteText, { color: colors.error || '#EF4444' }]}>
                  {t('common.delete')}
                </Text>
              </AppPressable>
            </View>
          )}
        </Card>
      </FadeIn>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('teacherExams.myExams')}</Text>
        <AppPressable
          accessibilityLabel={t('teacherExams.createFirst')}
          style={styles.createButton}
          onPress={() => navigation.navigate('TeacherBuildExam')}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </AppPressable>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.infoText}>{t('teacherExams.infoBanner')}</Text>
      </View>

      {loading ? (
        renderLoadingCards()
      ) : exams.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={56} color={colors.disabled} />
          <Text style={styles.emptyTitle}>{t('teacherExams.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('teacherExams.emptySubtitle')}</Text>
          <AppPressable
            accessibilityLabel={t('teacherExams.createFirst')}
            style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('TeacherBuildExam')}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyCreateText}>{t('teacherExams.createFirst')}</Text>
          </AppPressable>
        </View>
      ) : (
        <FlatList
          data={exams}
          renderItem={renderExamCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
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
    },
    backButton: { marginRight: spacing.md },
    headerTitle: {
      flex: 1,
      fontSize: typography.fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
    },
    createButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
    },
    infoText: {
      flex: 1,
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    card: { marginBottom: spacing.md },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    examTitle: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      fontWeight: '700',
      color: colors.text,
    },
    statusBadge: {
      maxWidth: 112,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: typography.fontSizes.xs, color: colors.textSecondary },
    dateText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginTop: spacing.xs,
    },
    approvedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
      padding: spacing.sm,
      backgroundColor: '#D1FAE510',
      borderRadius: borderRadius.sm,
    },
    approvedNoticeText: {
      fontSize: typography.fontSizes.xs,
      color: '#059669',
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    deleteText: { fontSize: typography.fontSizes.sm },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    editText: { fontSize: typography.fontSizes.sm },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.lg,
    },
    emptySubtitle: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    emptyCreateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
    },
    emptyCreateText: { color: '#fff', fontSize: typography.fontSizes.md, fontWeight: '600' },
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
