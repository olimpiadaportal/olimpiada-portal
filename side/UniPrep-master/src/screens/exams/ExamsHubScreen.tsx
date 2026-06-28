import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { teacherExamService, RecommendedTeacherCard, SubjectInfo } from '../../services/teacherExamService';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ActionCard, AppPressable, SectionHeader } from '../../components/ui';

export const ExamsHubScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [teachers, setTeachers] = useState<RecommendedTeacherCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const hasLoadedTeachersRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadTeachers();
    }, [user?.id])
  );

  const loadTeachers = async () => {
    if (!user) {
      setTeachers([]);
      setLoading(false);
      return;
    }

    if (!hasLoadedTeachersRef.current) {
      setLoading(true);
    }

    try {
      const data = await teacherExamService.getRecommendedTeacherExams(user.id);
      setTeachers(data);
      hasLoadedTeachersRef.current = true;
    } catch (err) {
      console.error('ExamsHub load error:', err);
      if (!hasLoadedTeachersRef.current) {
        setTeachers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getSubjectName = (subject: SubjectInfo): string => {
    if (i18n.language === 'az') return subject.name_az;
    return subject.name_en || subject.name_az;
  };

  const allSubjects = React.useMemo(() => {
    const seen = new Set<string>();
    const subjects: SubjectInfo[] = [];

    teachers.forEach((teacher) => {
      (teacher.subjects || []).forEach((subject) => {
        if (!seen.has(subject.id)) {
          seen.add(subject.id);
          subjects.push(subject);
        }
      });
    });

    return subjects;
  }, [teachers]);

  const filteredTeachers = selectedSubjectId
    ? teachers.filter((teacher) => teacher.subjects?.some((subject) => subject.id === selectedSubjectId))
    : teachers;

  const renderSubjectFilters = () => {
    if (allSubjects.length === 0) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <AppPressable
          accessibilityLabel={t('common.all')}
          accessibilityState={{ selected: !selectedSubjectId }}
          haptic={false}
          style={[styles.chip, !selectedSubjectId && styles.chipActive]}
          onPress={() => setSelectedSubjectId(null)}
        >
          <Text style={[styles.chipText, !selectedSubjectId && styles.chipTextActive]}>
            {t('common.all')}
          </Text>
        </AppPressable>

        {allSubjects.map((subject) => {
          const isSelected = selectedSubjectId === subject.id;

          return (
            <AppPressable
              key={subject.id}
              accessibilityLabel={getSubjectName(subject)}
              accessibilityState={{ selected: isSelected }}
              haptic={false}
              style={[styles.chip, isSelected && styles.chipActive]}
              onPress={() => setSelectedSubjectId(isSelected ? null : subject.id)}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextActive]} numberOfLines={1}>
                {getSubjectName(subject)}
              </Text>
            </AppPressable>
          );
        })}
      </ScrollView>
    );
  };

  const renderTeacherSkeletons = () => (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <LoadingSkeleton width={52} height={52} borderRadius={26} style={styles.skeletonAvatar} />
          <LoadingSkeleton height={18} width="76%" style={styles.skeletonLine} />
          <LoadingSkeleton height={14} width="88%" style={styles.skeletonLine} />
          <LoadingSkeleton height={14} width="56%" style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <ActionCard
        title={t('examsHub.officialTitle')}
        description={t('examsHub.officialSubtitle')}
        descriptionLines={3}
        icon="school-outline"
        accentColor={colors.primary}
        onPress={() => navigation.navigate('OfficialExamsList')}
        style={styles.officialCard}
      />

      <SectionHeader
        title={t('examsHub.teacherExams')}
        subtitle={t('examsHub.noLeaderboard')}
        style={styles.teacherHeader}
      />

      {renderSubjectFilters()}
      {loading && renderTeacherSkeletons()}
    </View>
  );

  const renderTeacherCard = ({ item }: { item: RecommendedTeacherCard; index: number }) => (
    <View style={styles.teacherCardWrap}>
      <AppPressable
        accessibilityLabel={item.full_name}
        style={styles.teacherCard}
        onPress={() =>
          navigation.navigate('TeacherExamList', {
            teacherId: item.teacher_id,
            teacherName: item.full_name,
          })
        }
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={22} color={colors.textSecondary} />
          </View>
        )}

        <Text style={styles.teacherName} numberOfLines={2}>
          {item.full_name}
        </Text>

        {item.subjects && item.subjects.length > 0 && (
          <Text style={styles.teacherSubjects} numberOfLines={2}>
            {item.subjects.slice(0, 2).map(getSubjectName).join(', ')}
          </Text>
        )}

        <View style={styles.teacherMeta}>
          <View style={styles.teacherMetaItem}>
            <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {item.exam_count} {t('examsHub.exams')}
            </Text>
          </View>

          {item.avg_rating != null && item.avg_rating > 0 && (
            <View style={styles.teacherMetaItem}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.metaText}>{item.avg_rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </AppPressable>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people-outline" size={34} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyText}>{t('examsHub.noTeachers')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tabs.exams')}</Text>
      </View>

      <FlatList
        data={loading ? [] : filteredTeachers}
        renderItem={renderTeacherCard}
        keyExtractor={(item) => item.teacher_id}
        numColumns={2}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={loading ? null : renderEmptyState}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    listContent: {
      paddingBottom: spacing.xxl,
    },
    listHeader: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    officialCard: {
      marginBottom: spacing.xl,
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    teacherHeader: {
      marginBottom: spacing.md,
    },
    chipRow: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
    chip: {
      maxWidth: 180,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    chipText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      fontWeight: typography.fontWeights.medium,
    },
    chipTextActive: {
      color: '#FFFFFF',
    },
    skeletonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    skeletonCard: {
      flexGrow: 1,
      flexBasis: '47%',
      minHeight: 154,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: spacing.md,
    },
    skeletonAvatar: {
      marginBottom: spacing.sm,
    },
    skeletonLine: {
      marginTop: spacing.xs,
    },
    gridRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    teacherCardWrap: {
      flex: 1,
      maxWidth: '48.5%',
    },
    teacherCard: {
      flex: 1,
      minHeight: 166,
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 2,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      marginBottom: spacing.sm,
    },
    avatarPlaceholder: {
      backgroundColor: colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center',
    },
    teacherName: {
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      fontWeight: typography.fontWeights.semibold,
      textAlign: 'center',
      lineHeight: typography.fontSizes.sm * typography.lineHeights.tight,
    },
    teacherSubjects: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: typography.fontSizes.xs * typography.lineHeights.normal,
      marginTop: spacing.xs,
      minHeight: 34,
    },
    teacherMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    teacherMetaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    metaText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl,
      gap: spacing.md,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceVariant,
    },
    emptyText: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: typography.fontSizes.md * typography.lineHeights.normal,
    },
  });
