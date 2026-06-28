import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Image, View, StyleSheet, ScrollView, RefreshControl, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../types';
import { PracticeStackParamList } from '../../navigation/PracticeStack';
import { ExamsStackParamList } from '../../navigation/ExamsStack';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../services/supabase';
import { practiceService } from '../../services/practiceService';
import { spacing } from '../../constants/theme';
import { notificationService } from '../../services/notificationService';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOffline } from '../../contexts/OfflineContext';
import { OfflineScreen } from '../../components/OfflineScreen';
import { useWalkthrough } from '../../contexts/WalkthroughContext';
import { WALKTHROUGH_TARGET_IDS } from '../../types/walkthrough';
import { ActionCard, AppPressable, ErrorState, SectionHeader } from '../../components/ui';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  CompositeNavigationProp<
    StackNavigationProp<PracticeStackParamList>,
    StackNavigationProp<ExamsStackParamList>
  >
>;
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AddDeadlineModal } from '../../components/AddDeadlineModal';

// Stage 9.1 Components
import {
  RecommendedTopicsCard,
  RecentActivityFeed,
  UpcomingDeadlinesCard,
  AIInsightsSection,
  DailyGoalCard,
  StudyPlanPreview,
  ScorePredictionCard,
} from '../../components/home';

// Stage 9.1 Services
import { recommendationService, Recommendation } from '../../services/recommendationService';
import { activityService, Activity } from '../../services/activityService';
import { deadlineService, Deadline } from '../../services/deadlineService';
import { useAlert } from '../../components/AlertProvider';
import { analyticsService } from '../../services/analyticsService';
import { streakService } from '../../services/streakService';
import { AnimatedNumber, FadeIn } from '../../components/animated';

export const HomeScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { user, liveStreak, streakMilestone } = useAuthStore();
  const { colors } = useTheme();
  const { flags } = useFeatureFlags();
  const { isOnline } = useNetworkStatus();
  const { lastSyncTime } = useOffline();
  const { showSuccess, showError, showInfo } = useAlert();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Data state
  const [streak, setStreak] = useState(0);
  const [streakLost, setStreakLost] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  // Loading states
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingDeadlines, setLoadingDeadlines] = useState(false);
  const [openingSubjectId, setOpeningSubjectId] = useState<string | null>(null);
  
  // Error state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatar_url]);

  // Modal state
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);

  // Phase 1: Refresh trigger for goal/plan components
  const [goalRefreshTrigger, setGoalRefreshTrigger] = useState(0);

  useEffect(() => {
    loadAllData();
  }, [user]);

  // Refresh quietly when screen comes into focus. Already-rendered Home sections
  // should stay visible instead of replaying every loading state on tab switches.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.id && studentId && isOnline) {
        loadRecommendations(studentId, false);
        loadDeadlines(studentId, false);
        loadActivity(user.id, studentId, false);
        loadProgressData(studentId);
        loadUnreadCount(user.id); // Refresh notification badge on focus
        setGoalRefreshTrigger(prev => prev + 1);
      }
    });

    return unsubscribe;
  }, [navigation, user?.id, studentId, isOnline]);

  // When an offline practice session syncs while the user is already on Home,
  // reload the data that should reflect that new canonical practice session.
  useEffect(() => {
    if (!lastSyncTime || !user?.id || !studentId || !isOnline) return;

    loadActivity(user.id, studentId, false);
    loadRecommendations(studentId, false);
    loadDeadlines(studentId, false);
    loadProgressData(studentId);
    setGoalRefreshTrigger(prev => prev + 1);
  }, [lastSyncTime, user?.id, studentId, isOnline]);

  // Note: Streak subscription removed - StreakIndicator component handles its own real-time updates
  // This prevents duplicate Supabase channels and improves performance

  // Reactively update the quick-stat streak counter when any activity completes.
  // liveStreak is pushed by streakService → authStore so the AnimatedNumber
  // plays the count-up as soon as the student returns to Home.
  useEffect(() => {
    if (liveStreak > 0 && liveStreak !== streak) {
      setStreak(liveStreak);
    }
  }, [liveStreak]);

  // Detect streak lost from milestone status
  useEffect(() => {
    if (streakMilestone?.status === 'lost') {
      setStreakLost(true);
      setTimeout(() => setStreakLost(false), 3000);
    }
  }, [streakMilestone]);

  // Real-time subscription for notification badge
  useEffect(() => {
    if (!user?.id) return;

    // Create channel with unique name per user
    const channelName = `home-notifications-${user.id}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // New notification arrived
            setUnreadCount(prev => prev + 1);
          } else if (payload.eventType === 'UPDATE') {
            // Check if notification was marked as read
            const newRecord = payload.new as { is_read?: boolean };
            const oldRecord = payload.old as { is_read?: boolean };
            if (newRecord?.is_read && !oldRecord?.is_read) {
              setUnreadCount(prev => Math.max(0, prev - 1));
            }
          } else if (payload.eventType === 'DELETE') {
            // Reload count on delete to be accurate
            loadUnreadCount(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadAllData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) {
        throw new Error('Failed to load student data');
      }

      if (!student) {
        setError('Student profile not found. Please complete your profile.');
        setLoading(false);
        return;
      }

      setStudentId(student.id);

      // Load all data in parallel
      await Promise.all([
        loadProgressData(student.id),
        loadRecommendations(student.id),
        loadActivity(user.id, student.id), // Pass both user_id and student_id
        loadDeadlines(student.id),
        loadSubjects(student.id),
        loadUnreadCount(user.id),
      ]);
    } catch (error: any) {
      console.error('Load all data error:', error);
      setError(error.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadProgressData = async (studentId: string) => {
    try {
      // Get analytics stats
      const stats = await analyticsService.fetchStudentStats(studentId, '30D');
      const streakStatus = await streakService.getStreakStatus().catch(() => null);

      const dbStreak = streakStatus?.currentStreak ?? stats.currentStreak ?? 0;
      // Take the max of DB value and live store value so the counter never
      // animates backwards if an activity already pushed it higher. When the
      // authoritative status is lost, allow the display to reset immediately.
      const { liveStreak: currentLive, setLiveStreak } = useAuthStore.getState();
      const hadStreakToLose = (stats.currentStreak ?? 0) > 0 || (currentLive || 0) > 0;
      const displayStreak = streakStatus?.status === 'lost'
        ? dbStreak
        : Math.max(dbStreak, currentLive || 0);
      setStreak(displayStreak);
      setStreakLost(streakStatus?.status === 'lost' && hadStreakToLose);
      if (displayStreak !== (currentLive || 0)) setLiveStreak(displayStreak);

      setAccuracy(Math.round(stats.overallAccuracy || 0));
      setTotalQuestions(stats.totalQuestionsAttempted || 0);

    } catch (error) {
      console.error('Load progress data error:', error);
    }
  };

  const loadRecommendations = async (studentId: string, showLoader = true) => {
    try {
      if (showLoader) setLoadingRecommendations(true);
      const recs = await recommendationService.getRecommendations(studentId, 5);
      setRecommendations(recs);
    } catch (error) {
      console.error('Load recommendations error:', error);
    } finally {
      if (showLoader) setLoadingRecommendations(false);
    }
  };

  const loadActivity = async (userId: string, studentId: string, showLoader = true) => {
    try {
      if (showLoader) setLoadingActivity(true);
      // Get only latest practice and exam results
      // practice_sessions uses user_id, student_exam_attempts uses student_id
      const activities = await activityService.getLatestResults(userId, studentId);
      setRecentActivity(activities);
    } catch (error) {
      console.error('Load activity error:', error);
    } finally {
      if (showLoader) setLoadingActivity(false);
    }
  };

  const loadDeadlines = async (studentId: string, showLoader = true) => {
    try {
      if (showLoader) setLoadingDeadlines(true);
      const upcomingDeadlines = await deadlineService.getUpcomingDeadlines(studentId, 5);
      setDeadlines(upcomingDeadlines);
    } catch (error) {
      console.error('Load deadlines error:', error);
    } finally {
      if (showLoader) setLoadingDeadlines(false);
    }
  };

  const loadSubjects = async (studentId: string) => {
    try {
      // Subject analytics removed - now shown in Analytics tab
    } catch (error) {
      console.error('Load subjects error:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, [user]);

  // Navigation handlers
  const handleAvatarPress = () => {
    navigation.navigate('Profile');
  };

  const handleTopicPress = async (subjectId: string, subjectName: string) => {
    if (openingSubjectId) return;

    setOpeningSubjectId(subjectId);

    try {
      const subjects = await practiceService.getSubjectsByGroup('I', undefined, user?.id);
      const subject = subjects.find(item => item.id === subjectId);

      if (subject) {
        navigation.navigate('Practice', {
          screen: 'SubjectDetail',
          params: { subject },
        });
        setOpeningSubjectId(null);
        return;
      }

      console.warn('Recommended subject was not found in practice subjects:', subjectId, subjectName);
    } catch (error) {
      console.error('Resolve recommended subject error:', error);
    }

    // Safe fallback: never send partial params to SubjectDetail.
    navigation.navigate('Practice', { screen: 'SubjectsList' });
    setOpeningSubjectId(null);
  };

  const handleActivityPress = (activity: Activity) => {
    // Navigate based on activity type
    switch (activity.type) {
      case 'quiz':
        // Navigate to Practice tab, then to QuizResult screen
        navigation.navigate('Practice', {
          screen: 'QuizResult',
          params: { sessionId: activity.id },
        });
        break;
      case 'exam':
        // Navigate to MockExams tab, then to ExamResults screen
        navigation.navigate('MockExams', {
          screen: 'ExamResults',
          params: { attemptId: activity.id },
        });
        break;
      case 'achievement':
        // Show achievement details
        break;
      default:
        break;
    }
  };

  const handleDeadlinePress = (deadline: Deadline) => {
    // Navigate to AllDeadlines screen - user can find and edit the deadline there
    navigation.navigate('AllDeadlines' as never);
  };

  const handleAddDeadline = () => {
    setShowDeadlineModal(true);
  };

  const handleSaveDeadline = async (
    title: string,
    date: Date,
    type: 'exam' | 'assignment' | 'goal' | 'custom'
  ) => {
    if (!studentId) return;

    try {
      await deadlineService.createDeadline(studentId, {
        title,
        description: null,
        date: date.toISOString().split('T')[0],
        time: null,
        type,
        priority: 'medium',
      });

      // Reload deadlines
      await loadDeadlines(studentId);
    } catch (error) {
      console.error('Save deadline error:', error);
    }
  };

  // Load unread notification count for bell badge
  const loadUnreadCount = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadCount(count);
      }
    } catch (error) {
      console.error('Load unread count error:', error);
    }
  };

  const handleNotificationPress = () => {
    navigation.navigate('NotificationCenter' as never);
  };

  const primaryRecommendation = recommendations[0];
  const hasPracticeHistory = totalQuestions > 0;
  const isOpeningTodayAction = !!primaryRecommendation && openingSubjectId === primaryRecommendation.subjectId;

  const handleTodayActionPress = () => {
    if (primaryRecommendation) {
      handleTopicPress(primaryRecommendation.subjectId, primaryRecommendation.subject);
      return;
    }

    if (!hasPracticeHistory) {
      navigation.navigate('Practice', { screen: 'ModeSelection' });
      return;
    }

    navigation.navigate('MockExams', { screen: 'ExamsHub' });
  };

  const todayAction = primaryRecommendation
    ? {
        title: t('home.todayAction.recommendationTitle', {
          subject: primaryRecommendation.subject,
          defaultValue: 'Practice {{subject}} today',
        }),
        description: t('home.todayAction.recommendationDescription', {
          accuracy: Math.round(primaryRecommendation.accuracy),
          time: primaryRecommendation.estimatedTime,
          defaultValue: '{{accuracy}}% accuracy so far. A focused {{time}} session should help most.',
        }),
        icon: 'bulb-outline' as const,
      }
    : hasPracticeHistory
      ? {
          title: t('home.todayAction.examTitle', 'Take an official exam'),
          description: t(
            'home.todayAction.examDescription',
            'Use your recent practice evidence to measure progress under exam conditions.'
          ),
          icon: 'document-text-outline' as const,
        }
      : {
          title: t('home.todayAction.practiceTitle', 'Start with a practice session'),
          description: t(
            'home.todayAction.practiceDescription',
            'Answer a few subject questions so Elmly can build your first recommendations.'
          ),
          icon: 'book-outline' as const,
        };

  const handleTestNotification = async () => {
    try {
      const success = await notificationService.sendImmediateNotification(
        '📚 Study Reminder',
        'Time to practice! Keep your streak going! 🔥'
      );
      
      if (success) {
        showSuccess(
          'Notification Sent!',
          'Check your notification panel. Tap the notification to test navigation (coming soon).'
        );
      } else {
        showInfo(
          'Permission Required',
          'Please enable notifications in your device settings to test this feature.'
        );
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      showError('Error', 'Failed to send notification. Check console for details.');
    }
  };

  const renderQuickStat = (
    label: string,
    value: number,
    helper: string | undefined,
    icon: keyof typeof Ionicons.glyphMap,
    accentColor: string,
    suffix = ''
  ) => (
    <View style={styles.quickStatRow}>
      <View style={[styles.quickStatIcon, { backgroundColor: accentColor + '18' }]}>
        <Ionicons name={icon} size={20} color={accentColor} />
      </View>
      <View style={styles.quickStatTextBlock}>
        <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        {helper && (
          <Text style={[styles.quickStatHelper, { color: colors.textTertiary }]}>
            {helper}
          </Text>
        )}
      </View>
      <AnimatedNumber
        value={value}
        duration={850}
        delay={160}
        suffix={suffix}
        style={[styles.quickStatValue, { color: colors.text }]}
      />
    </View>
  );


  // Show offline screen when offline and no data
  if (!isOnline && error && !loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <OfflineScreen 
          title={t('offline.homeTitle', 'You are offline')}
          message={t('offline.homeMessage', 'Connect to the internet to see your dashboard. You can still practice with downloaded questions in Standard Mode.')}
          showPracticeButton={true}
          showRetryButton={true}
        />
      </SafeAreaView>
    );
  }

  // Show error state (when online but error occurred)
  if (error && !loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <ErrorState
            title={t('home.errorLoading')}
            message={t('errors.loadFailed', 'Failed to load data. Please try again.')}
            actionLabel={t('home.retry')}
            onAction={loadAllData}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show loading skeleton on initial load
  if (loading && !studentId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={{ padding: spacing.md }}>
            <LoadingSkeleton height={80} style={{ marginBottom: spacing.md }} />
            <LoadingSkeleton height={120} style={{ marginBottom: spacing.md }} />
            <LoadingSkeleton height={160} style={{ marginBottom: spacing.md }} />
            <LoadingSkeleton height={100} style={{ marginBottom: spacing.md }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AppPressable
              accessibilityLabel={t('profileTab.title')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              onPress={handleAvatarPress}
              style={styles.avatarContainer}
            >
              {user?.avatar_url && !avatarLoadFailed ? (
                <Image
                  accessibilityIgnoresInvertColors
                  accessible={false}
                  onError={() => setAvatarLoadFailed(true)}
                  source={{ uri: user.avatar_url }}
                  style={[styles.avatar, styles.avatarImage, { borderColor: colors.primary }]}
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
                  <Ionicons name="school" size={24} color={colors.primary} />
                </View>
              )}
            </AppPressable>
            <View style={styles.greetingContainer}>
              <Text style={[styles.greetingText, { color: colors.textSecondary }]}>
                {new Date().getHours() < 12 ? t('home.goodMorning') : new Date().getHours() < 18 ? t('home.goodAfternoon') : t('home.goodEvening')}
              </Text>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                {user?.full_name?.split(' ')[0] || 'Student'}
              </Text>
            </View>
          </View>
          <AppPressable
            accessibilityLabel={t('notifications.title')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={handleNotificationPress}
            style={[styles.bellContainer, { backgroundColor: colors.card }]}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </AppPressable>
        </View>

        <SectionHeader
          title={t('home.sections.today', 'Today')}
          subtitle={t('home.sections.todaySubtitle', 'Your next best step')}
          icon="sparkles-outline"
          style={[styles.sectionHeader, { borderTopColor: colors.border }]}
        />
        <FadeIn delay={80}>
          <ActionCard
            title={isOpeningTodayAction ? t('home.todayAction.openingTitle', 'Opening practice') : todayAction.title}
            description={isOpeningTodayAction ? t('home.todayAction.openingDescription', 'Preparing the recommended subject...') : todayAction.description}
            icon={todayAction.icon}
            accentColor={colors.primary}
            disabled={!!openingSubjectId}
            onPress={handleTodayActionPress}
            rightContent={isOpeningTodayAction ? <ActivityIndicator color={colors.primary} /> : undefined}
            style={styles.todayActionCard}
          />
        </FadeIn>

        {/* Quick Stats Row */}
        <FadeIn delay={120}>
        <View
          style={[
            styles.quickStatsPanel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {renderQuickStat(
            t('home.stats.dayStreak'),
            streak,
            t('home.stats.days'),
            streakLost ? 'heart-dislike' : streak === 0 ? 'flame-outline' : 'flame',
            streakLost ? '#EF4444' : streak === 0 ? '#9CA3AF' : '#F97316'
          )}
          <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
          {renderQuickStat(
            t('home.stats.accuracy'),
            accuracy,
            undefined,
            'checkmark-circle',
            '#3B82F6',
            '%'
          )}
          <View style={[styles.quickStatDivider, { backgroundColor: colors.border }]} />
          {renderQuickStat(
            t('home.stats.questions'),
            totalQuestions,
            t('home.stats.questionsAttempted'),
            'help-circle',
            '#8B5CF6'
          )}
        </View>
        </FadeIn>

        {/* Daily Goal Card - Phase 1 */}
        {studentId && flags.goal_setting !== false && (
          <FadeIn delay={250}>
            <DailyGoalCard
              studentId={studentId}
              onSetGoals={() => navigation.navigate('GoalSetting' as never)}
              onViewDetails={() => navigation.navigate('GoalSetting' as never)}
              refreshTrigger={goalRefreshTrigger}
            />
          </FadeIn>
        )}

        <SectionHeader
          title={t('home.sections.learningDirection', 'Learning Direction')}
          subtitle={t('home.sections.learningDirectionSubtitle', 'Plans, topics, and insights')}
          icon="compass-outline"
          style={[styles.sectionHeader, { borderTopColor: colors.border }]}
        />

        {/* Study Plan Preview - Phase 1 */}
        {studentId && flags.study_plans !== false && (
          <FadeIn delay={280}>
            <StudyPlanPreview
              studentId={studentId}
              onViewPlan={() => navigation.navigate('StudyPlan' as never)}
              onCreatePlan={() => navigation.navigate('GoalSetting' as never)}
              refreshTrigger={goalRefreshTrigger}
            />
          </FadeIn>
        )}

        {/* Recommended Topics */}
        <FadeIn delay={400}>
        <RecommendedTopicsCard
          recommendations={recommendations}
          loading={loadingRecommendations}
          onTopicPress={handleTopicPress}
          openingSubjectId={openingSubjectId}
          hasPracticeData={totalQuestions > 0}
        />
        </FadeIn>

        {/* AI Insights Section - Controlled by feature flag */}
        <FadeIn delay={430}>
        {studentId && flags.ai_insights && (
          <AIInsightsSection
            studentId={studentId}
            onViewAll={() => navigation.navigate('AllInsights' as never)}
            refreshTrigger={goalRefreshTrigger}
          />
        )}
        </FadeIn>

        <SectionHeader
          title={t('home.sections.evidence', 'Evidence')}
          subtitle={t('home.sections.evidenceSubtitle', 'Score estimate and progress signal')}
          icon="analytics-outline"
          style={[styles.sectionHeader, { borderTopColor: colors.border }]}
        />

        {/* Score Prediction Card - Phase 6 */}
        {studentId && user?.id && (
          <FadeIn delay={460}>
            <ScorePredictionCard
              userId={user.id}
              studentId={studentId}
              onViewDetails={() => navigation.navigate('ScorePrediction' as never)}
              refreshTrigger={goalRefreshTrigger}
            />
          </FadeIn>
        )}

        <SectionHeader
          title={t('home.sections.history', 'History')}
          subtitle={t('home.sections.historySubtitle', 'Recent results and deadlines')}
          icon="time-outline"
          style={[styles.sectionHeader, { borderTopColor: colors.border }]}
        />

        {/* Recent Activity */}
        <FadeIn delay={500}>
        <RecentActivityFeed
          activities={recentActivity}
          loading={loadingActivity}
          onActivityPress={handleActivityPress}
          onViewAll={() => navigation.navigate('AllActivity' as never)}
        />
        </FadeIn>

        {/* Upcoming Deadlines */}
        <FadeIn delay={600}>
        <UpcomingDeadlinesCard
          deadlines={deadlines}
          loading={loadingDeadlines}
          onDeadlinePress={handleDeadlinePress}
          onAddDeadline={handleAddDeadline}
          onViewAll={() => navigation.navigate('AllDeadlines' as never)}
        />
        </FadeIn>

        {/* Bottom spacing */}
        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* Add Deadline Modal */}
      <AddDeadlineModal
        visible={showDeadlineModal}
        onClose={() => setShowDeadlineModal(false)}
        onAdd={handleSaveDeadline}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  todayActionCard: {
    marginBottom: spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    backgroundColor: 'transparent',
    resizeMode: 'cover',
  },
  greetingContainer: {
    flex: 1,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  bellContainer: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  quickStatsPanel: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  quickStatRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  quickStatIcon: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  quickStatTextBlock: {
    flex: 1,
  },
  quickStatLabel: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  quickStatHelper: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    minWidth: 72,
    textAlign: 'right',
  },
  quickStatDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
});
