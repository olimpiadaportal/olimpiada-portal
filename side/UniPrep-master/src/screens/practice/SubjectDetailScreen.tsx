import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { practiceService } from '../../services/practiceService';
import { offlineService } from '../../services/offlineService';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAuthStore } from '../../store/authStore';
import { usePracticeStore } from '../../store/practiceStore';
import { SubjectWithProgress } from '../../types/practice';
import { TopicSelectionModal, TopicSelection } from '../../components/TopicSelectionModal';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../constants/theme';
import { FadeIn } from '../../components/animated';
import { useAlert } from '../../components/AlertProvider';
import { ActionCard, ErrorState, LoadingState, MetricCard, SectionHeader } from '../../components/ui';

interface Props {
  route: any;
  navigation: any;
}

export const SubjectDetailScreen = ({ route, navigation }: Props) => {
  const { t } = useTranslation();
  const routeParams = route.params ?? {};
  const { returnTo } = routeParams;
  const { colors: themeColors } = useTheme();
  const { showInfo } = useAlert();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const { user } = useAuthStore();
  const { setLoadingQuestions, startSession, isLoadingQuestions } = usePracticeStore();
  const { isOnline } = useNetworkStatus();
  const routeSubject = (routeParams as { subject?: Partial<SubjectWithProgress> })?.subject;
  const subject = routeSubject?.id
    ? ({
        id: routeSubject.id,
        name_en: routeSubject.name_en || routeSubject.name_az || 'Subject',
        name_az: routeSubject.name_az || routeSubject.name_en || 'Fənn',
        exam_group: routeSubject.exam_group || 'I',
        total_questions: routeSubject.total_questions ?? 0,
        practiced_questions: routeSubject.practiced_questions ?? 0,
        accuracy: routeSubject.accuracy ?? 0,
        progress_percentage: routeSubject.progress_percentage ?? 0,
        last_practiced: routeSubject.last_practiced,
        cached_questions: routeSubject.cached_questions,
        is_available_offline: routeSubject.is_available_offline,
        offline_last_sync: routeSubject.offline_last_sync,
      } as SubjectWithProgress)
    : null;
  
  // Topic selection modal state
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'practice' | 'quiz'>('practice');
  const [cacheInfo, setCacheInfo] = useState({
    hasCached: !!subject?.is_available_offline,
    cachedCount: subject?.cached_questions || 0,
    lastSync: subject?.offline_last_sync || null,
    isFresh: !!subject?.is_available_offline,
  });

  useEffect(() => {
    if (!subject?.id) return;

    let mounted = true;
    offlineService.getQuestionCacheInfo(subject.id).then(info => {
      if (mounted) setCacheInfo(info);
    });

    return () => {
      mounted = false;
    };
  }, [subject?.id]);

  if (!subject) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: themeColors.background }} edges={['top']}>
        <ErrorState
          title={t('errors.loadFailed')}
          actionLabel={t('common.back')}
          onAction={() => navigation.navigate('SubjectsList')}
          style={styles.missingSubjectState}
        />
      </SafeAreaView>
    );
  }

  const localizedSubjectName = i18n.language === 'az'
    ? (subject.name_az || subject.name_en)
    : (subject.name_en || subject.name_az);

  const handleStartPractice = () => {
    setSelectedMode('practice');
    setShowTopicModal(true);
  };

  const handleStartQuiz = () => {
    setSelectedMode('quiz');
    setShowTopicModal(true);
  };

  const handleTopicConfirm = async (selection: TopicSelection) => {
    setShowTopicModal(false);

    if (selectedMode === 'practice') {
      await startPracticeMode(selection);
    } else {
      await startQuizMode(selection);
    }
  };

  const startPracticeMode = async (
    selection: TopicSelection = { topicNames: [], subtopicIds: [] },
  ) => {
    if (!user?.id) return;
    const { topicNames, subtopicIds } = selection;
    const hasSelection = topicNames.length > 0 || subtopicIds.length > 0;

    setLoadingQuestions(true);
    try {
      // Get 10 questions - either by topics/subtopics or random
      // Pass userId for smart question selection (prioritizes unanswered/incorrect questions)
      const questions = hasSelection
        ? await practiceService.getQuestionsByTopics(subject.id, topicNames, 10, user.id, subtopicIds)
        : await practiceService.getRandomQuestions(subject.id, 10, [], user.id);
      
      if (questions.length === 0) {
        // Show appropriate message based on online status
        const message = isOnline 
          ? t('errors.noQuestionsAvailable')
          : t('errors.noQuestionsOffline');
        showInfo(t('common.alert'), message);
        setLoadingQuestions(false);
        return;
      }

      // Create practice session
      const questionIds = questions.map(q => q.id);
      const sessionId = await practiceService.createPracticeSession(
        user.id,
        subject.id,
        'practice',
        questions.length,
        questionIds
      );

      if (sessionId) {
        startSession(sessionId, 'practice', subject.id, subject.name_az, questions);
        navigation.navigate('QuestionPractice' as never);
      }
    } catch (error) {
      console.error('Start practice error:', error);
      showInfo(t('common.error'), t('errors.loadFailed'));
    } finally {
      setLoadingQuestions(false);
    }
  };

  const startQuizMode = async (
    selection: TopicSelection = { topicNames: [], subtopicIds: [] },
  ) => {
    if (!user?.id) return;
    const { topicNames, subtopicIds } = selection;
    const hasSelection = topicNames.length > 0 || subtopicIds.length > 0;

    setLoadingQuestions(true);
    try {
      // Get 30 questions - either by topics/subtopics or random
      // Pass userId for smart question selection (prioritizes unanswered/incorrect questions)
      const questions = hasSelection
        ? await practiceService.getQuestionsByTopics(subject.id, topicNames, 30, user.id, subtopicIds)
        : await practiceService.getQuizQuestions(subject.id, user.id);
      
      if (questions.length < 30) {
        const message = t('practice.notEnoughQuestions', { found: questions.length, needed: 30 });
        showInfo(t('common.alert'), message);
        setLoadingQuestions(false);
        return;
      }

      // Create quiz session
      const questionIds = questions.map(q => q.id);
      const sessionId = await practiceService.createPracticeSession(
        user.id,
        subject.id,
        'quiz',
        questions.length,
        questionIds
      );

      if (sessionId) {
        startSession(sessionId, 'quiz', subject.id, subject.name_az, questions);
        navigation.navigate('QuestionPractice' as never);
      }
    } catch (error) {
      console.error('Start quiz error:', error);
      const message = !isOnline && error instanceof Error && error.message.includes('No cached')
        ? t('errors.noQuestionsOffline')
        : t('errors.loadFailed');
      showInfo(t('common.error'), message);
    } finally {
      setLoadingQuestions(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.backButton}
            onPress={() => {
              if (returnTo) {
                navigation.navigate(returnTo as never);
              } else {
                navigation.goBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <SectionHeader
            title={localizedSubjectName}
            subtitle={t('practice.subjectDetail.choosePracticeMode')}
            icon="book-outline"
            style={styles.headerTitle}
          />
        </View>

        <FadeIn delay={100}>
          <View style={styles.statsContainer}>
            <MetricCard
              label={t('practice.subjectDetail.questionsPracticed')}
              value={subject.practiced_questions}
              icon="checkmark-circle-outline"
              accentColor={themeColors.success}
              labelLines={2}
              style={styles.statCard}
            />
            <MetricCard
              label={t('practice.subjectDetail.accuracy')}
              value={`${subject.accuracy}%`}
              icon="trending-up-outline"
              accentColor={themeColors.primary}
              labelLines={2}
              style={styles.statCard}
            />
            <MetricCard
              label={t('practice.subjectDetail.progress')}
              value={`${subject.progress_percentage}%`}
              icon="bar-chart-outline"
              accentColor={themeColors.secondary}
              labelLines={2}
              style={styles.statCard}
            />
          </View>
        </FadeIn>

        <FadeIn delay={250}>
          <View style={styles.section}>
            <SectionHeader
              title={t('practice.subjectDetail.choosePracticeMode')}
              icon="options-outline"
              style={styles.sectionHeading}
            />

            <View style={[
              styles.offlineStatus,
              {
                backgroundColor: cacheInfo.hasCached ? themeColors.success + '12' : themeColors.surface,
                borderColor: cacheInfo.hasCached ? themeColors.success + '44' : themeColors.border,
              },
            ]}>
              <Ionicons
                name={cacheInfo.hasCached ? 'cloud-done-outline' : 'cloud-download-outline'}
                size={18}
                color={cacheInfo.hasCached ? themeColors.success : themeColors.textSecondary}
              />
              <View style={styles.offlineStatusCopy}>
                <Text style={[styles.offlineStatusTitle, { color: themeColors.text }]}>
                  {cacheInfo.hasCached
                    ? t('offline.readyTitle', 'Ready for offline practice')
                    : t('offline.notReadyTitle', 'Not downloaded yet')}
                </Text>
                <Text style={[styles.offlineStatusText, { color: themeColors.textSecondary }]}>
                  {cacheInfo.hasCached
                    ? t('offline.questionsAvailable', { count: cacheInfo.cachedCount })
                    : t('offline.downloadHint', 'Open this subject while online so Elmly can prepare questions for offline use.')}
                </Text>
              </View>
            </View>

            <ActionCard
              title={t('practice.subjectDetail.practiceMode')}
              description={t('practice.subjectDetail.practiceModeDesc')}
              descriptionLines={4}
              icon="book-outline"
              accentColor={themeColors.primary}
              disabled={isLoadingQuestions}
              onPress={handleStartPractice}
              rightContent={
                isLoadingQuestions && selectedMode === 'practice'
                  ? <ActivityIndicator color={themeColors.primary} />
                  : undefined
              }
              style={styles.modeCard}
            />

            <ActionCard
              title={t('practice.subjectDetail.quizMode')}
              description={t('practice.subjectDetail.quizModeDesc')}
              descriptionLines={4}
              icon="timer-outline"
              accentColor={themeColors.secondary}
              disabled={isLoadingQuestions}
              onPress={handleStartQuiz}
              rightContent={
                isLoadingQuestions && selectedMode === 'quiz'
                  ? <ActivityIndicator color={themeColors.secondary} />
                  : undefined
              }
              style={styles.modeCard}
            />
          </View>
        </FadeIn>
      </ScrollView>

      {/* Topic Selection Modal */}
      <TopicSelectionModal
        visible={showTopicModal}
        onClose={() => setShowTopicModal(false)}
        onConfirm={handleTopicConfirm}
        subjectId={subject.id}
        subjectName={localizedSubjectName}
        mode={selectedMode}
        questionCount={selectedMode === 'practice' ? 10 : 30}
      />

      <Modal
        visible={isLoadingQuestions}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <LoadingState title={t('practice.preparingQuestions', 'Preparing questions...')} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  missingSubjectState: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    flex: 1,
    marginBottom: 0,
  },
  statsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    minHeight: 88,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    marginBottom: spacing.md,
  },
  offlineStatus: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  offlineStatusCopy: {
    flex: 1,
  },
  offlineStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  offlineStatusText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  modeCard: {
    marginBottom: spacing.md,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    minWidth: 200,
  },
});
