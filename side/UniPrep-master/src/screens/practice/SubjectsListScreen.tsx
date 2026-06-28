import React, { useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { practiceService } from '../../services/practiceService';
import { useAuthStore } from '../../store/authStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { SubjectWithProgress } from '../../types/practice';
import { OfflineScreen } from '../../components/OfflineScreen';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../constants/theme';
import { FadeIn } from '../../components/animated';
import { ActionCard, ErrorState, SectionHeader } from '../../components/ui';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

export const SubjectsListScreen = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { isOnline } = useNetworkStatus();
  const [subjects, setSubjects] = useState<SubjectWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const data = await practiceService.getSubjectsByGroup('I', undefined, user?.id);
      setSubjects(data);
    } catch (error) {
      console.error('Load subjects error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocalizedSubjectName = (subject: SubjectWithProgress): string => {
    if (i18n.language === 'az') {
      return subject.name_az || subject.name_en || 'Fənn';
    }

    if (i18n.language === 'ru') {
      return (subject as { name_ru?: string }).name_ru || subject.name_az || subject.name_en || 'Subject';
    }

    return subject.name_en || subject.name_az || 'Subject';
  };

  const getSubjectDescription = (subject: SubjectWithProgress): string => {
    const questionsLabel = t('practice.subjects.questions');
    const accuracyLabel = t('practice.subjects.accuracy');
    const base = `${subject.practiced_questions}/${subject.total_questions} ${questionsLabel} · ${subject.accuracy}% ${accuracyLabel}`;
    if (!subject.cached_questions) return base;

    return `${base}\n${t('offline.questionsAvailable', { count: subject.cached_questions })}`;
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <SectionHeader
        title={t('practice.modeSelection.standardMode')}
        subtitle={t('practice.subjects.subtitle')}
        icon="book-outline"
        style={styles.headerTitle}
      />
    </View>
  );

  const renderSubjectCard = ({ item, index }: { item: SubjectWithProgress; index: number }) => (
    <FadeIn delay={index * 60} duration={350}>
      <ActionCard
        title={getLocalizedSubjectName(item)}
        description={getSubjectDescription(item)}
        icon="book-outline"
        accentColor={colors.primary}
        onPress={() => (navigation as any).navigate('SubjectDetail', { subject: item })}
        rightContent={
          <View style={styles.cardMeta}>
            {item.is_available_offline ? (
              <View style={styles.offlineBadge}>
                <Ionicons name="cloud-done-outline" size={13} color={colors.success} />
                <Text style={[styles.offlineBadgeText, { color: colors.success }]}>
                  {t('offline.readyShort', 'Offline')}
                </Text>
              </View>
            ) : null}
            <View style={styles.progressBadge}>
              <Text style={[styles.progressValue, { color: colors.primary }]}>
                {item.progress_percentage}%
              </Text>
              <Text style={[styles.progressLabel, { color: colors.textTertiary }]}>
                {t('practice.subjectDetail.progress')}
              </Text>
            </View>
          </View>
        }
        style={styles.subjectCard}
      />
    </FadeIn>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingList}>
      {[0, 1, 2, 3, 4].map(index => (
        <LoadingSkeleton key={index} height={88} style={styles.loadingCard} />
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <ErrorState
      title={t('practice.subjects.title')}
      message={t('practice.subjects.selectSubject')}
      style={styles.emptyContainer}
    />
  );

  if (!isOnline && subjects.length === 0 && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <OfflineScreen
          title={t('offline.practiceTitle', 'Offline Practice')}
          message={t('offline.practiceMessage', 'Download subjects while online to practice offline. Your progress will sync when you reconnect.')}
          showPracticeButton={false}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}

      {loading ? (
        renderLoadingState()
      ) : (
        <FlatList
          data={subjects}
          renderItem={renderSubjectCard}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    marginBottom: 0,
  },
  loadingList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  loadingCard: {
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  subjectCard: {
    marginBottom: spacing.md,
  },
  cardMeta: {
    alignItems: 'center',
    minWidth: 46,
    gap: spacing.xs,
  },
  progressBadge: {
    alignItems: 'center',
  },
  offlineBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  offlineBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    paddingVertical: spacing.xxl * 2,
  },
});
