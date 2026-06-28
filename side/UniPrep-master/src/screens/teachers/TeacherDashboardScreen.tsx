import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'react-native-chart-kit';
import { teacherService } from '../../services/teacherService';
import { bookingService } from '../../services/bookingService';
import { availabilityService, TeacherTimeOff } from '../../services/availabilityService';
import { TeacherAvailability } from '../../types/teacher';
import { TeacherStats, BookingWithDetails } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useMessagingStore } from '../../store/messagingStore';
import { supabase } from '../../services/supabase';
import { DashboardStatsSkeleton } from '../../components/skeletons/DashboardStatsSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { WALKTHROUGH_TARGET_IDS } from '../../types/walkthrough';
import { translateSubject } from '../../utils/subjectTranslation';
import { formatBookingDate } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';
import { FadeIn } from '../../components/animated';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { teacherExamService, TeacherExamSummary } from '../../services/teacherExamService';
import { ActionCard, AppPressable, MetricCard, SectionHeader, StatusBadge } from '../../components/ui';

type TeacherDashboardScreenNavigationProp = StackNavigationProp<any, 'TeacherDashboard'>;

interface Props {
  navigation: TeacherDashboardScreenNavigationProp;
}

const screenWidth = Dimensions.get('window').width;

export const TeacherDashboardScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { unreadCount } = useMessagingStore();
  const { colors } = useTheme();
  const { showError } = useAlert();
  const { enabled: isAvailabilityEnabled } = useFeatureFlag('teacher_availability');
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<BookingWithDetails[]>([]);
  const [pendingRequests, setPendingRequests] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  
  // Messaging states
  const [teacherId, setTeacherId] = useState<string | null>(null);

  // Availability state
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [activeTimeOff, setActiveTimeOff] = useState<TeacherTimeOff | null>(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = React.useRef(true);

  // My Exams preview (last 3)
  const [myExams, setMyExams] = useState<TeacherExamSummary[]>([]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (user?.id && isMountedRef.current) {
      loadDashboardData();
    }
  }, [user?.id]);

  // Reload notification count when screen comes into focus (lightweight refresh)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.id) {
        loadNotificationUnreadCount(user.id);
      }
    });

    return unsubscribe;
  }, [navigation, user?.id]);

  // Real-time subscription for notification badge
  useEffect(() => {
    if (!user?.id) return;

    // Create channel with unique name per user
    const channelName = `teacher-notifications-${user.id}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotificationUnreadCount(prev => prev + 1);
          } else if (payload.eventType === 'UPDATE') {
            const newRecord = payload.new as { is_read?: boolean };
            const oldRecord = payload.old as { is_read?: boolean };
            if (newRecord?.is_read && !oldRecord?.is_read) {
              setNotificationUnreadCount(prev => Math.max(0, prev - 1));
            }
          } else if (payload.eventType === 'DELETE') {
            loadNotificationUnreadCount(user.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadDashboardData = async () => {
    if (!user?.id || !isMountedRef.current) {
      if (isMountedRef.current) setLoading(false);
      return;
    }

    try {
      if (isMountedRef.current) setLoading(true);

      // Get teacher record ID from user ID
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (teacherError || !teacher) {
        console.error('Teacher record not found:', teacherError);
        showError('Error', 'Teacher profile not found. Please contact support.');
        return;
      }

      const [statsData, bookingsData] = await Promise.all([
        teacherService.getTeacherStats(teacher.id),
        bookingService.getTeacherBookings(teacher.id),
        loadNotificationUnreadCount(user.id),
      ]);

      // Guard against unmount during async operations
      if (!isMountedRef.current) return;
      
      // Force re-render by creating new object
      setStats(statsData ? { ...statsData } : null);

      // Filter bookings
      const now = new Date();
      const upcoming = bookingsData.filter(b => {
        const bookingDate = new Date(b.scheduled_date);
        return b.status === 'confirmed' && bookingDate >= now;
      }).slice(0, 3);

      const pending = bookingsData.filter(b => b.status === 'pending').slice(0, 3);

      if (isMountedRef.current) {
        setUpcomingSessions(upcoming);
        setPendingRequests(pending);
        // Store teacher ID (messaging already initialized at app level)
        setTeacherId(teacher.id);
      }

      // Load availability + my exams in parallel
      const [avail, timeOff, myExamsData] = await Promise.all([
        availabilityService.getAvailability(teacher.id),
        availabilityService.getTimeOff(teacher.id),
        teacherExamService.getMyExams(teacher.id),
      ]);
      if (isMountedRef.current) {
        setAvailability(avail);
        const today = new Date().toISOString().split('T')[0];
        const active = timeOff.find(t => today >= t.start_date && today <= t.end_date) || null;
        setActiveTimeOff(active);
        setMyExams(myExamsData.slice(0, 3));
      }
    } catch (error) {
      console.error('Load dashboard data error:', error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const loadNotificationUnreadCount = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (!error && count !== null && isMountedRef.current) {
        setNotificationUnreadCount(count);
      }
    } catch (error) {
      console.error('Load notification unread count error:', error);
    }
  };

  const handleNotificationPress = () => {
    navigation.navigate('NotificationCenter' as never);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  }, []);

  const renderBookingItem = (booking: BookingWithDetails, tab: 'pending' | 'upcoming') => (
    <AppPressable
      accessibilityLabel={booking.student.full_name}
      key={booking.id}
      style={styles.bookingItem}
      onPress={() => navigation.navigate('TeacherBookings', { initialTab: tab })}
    >
      <View style={styles.bookingInfo}>
        <Text style={styles.bookingStudent}>{booking.student.full_name}</Text>
        <Text style={styles.bookingDetails}>
          {translateSubject(booking.subject_name, t)} - {formatBookingDate(booking.scheduled_date, t('common.locale'), false)} {t('teacherDashboard.at')}{' '}
          {booking.scheduled_time}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </AppPressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          <DashboardStatsSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Empty state - no stats
  if (!stats) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="stats-chart-outline"
          title={t('teacherDashboard.noDataTitle')}
          description={t('teacherDashboard.noDataDescription')}
        />
      </SafeAreaView>
    );
  }

  const nextSession = upcomingSessions[0];
  const availabilityStatus = activeTimeOff
    ? {
        label: t('teacherDashboard.availabilityTimeOff'),
        variant: 'warning' as const,
        icon: 'ban-outline' as const,
      }
    : availability.length > 0
      ? {
          label: t('teacherDashboard.availabilityReady'),
          variant: 'success' as const,
          icon: 'checkmark-circle-outline' as const,
        }
      : {
          label: t('teacherDashboard.availabilityNotSet'),
          variant: 'neutral' as const,
          icon: 'calendar-outline' as const,
        };

  return (
    <SafeAreaView style={styles.container}>
      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AppPressable
            accessibilityLabel={t('profileTab.title')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={() => navigation.navigate('Profile')}
            style={styles.avatarContainer}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {user?.full_name?.charAt(0)?.toUpperCase() || 'T'}
              </Text>
            </View>
          </AppPressable>
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>{t('teacherDashboard.welcomeBack')}</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.full_name?.split(' ')[0] || 'Teacher'}
            </Text>
          </View>
        </View>
        <View style={styles.headerIcons}>
          {/* Notifications Icon */}
          <AppPressable
            accessibilityLabel={t('notifications.title')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.headerIconButton, { backgroundColor: colors.card }]}
            onPress={handleNotificationPress}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {notificationUnreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.badgeText}>
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </Text>
              </View>
            )}
          </AppPressable>

          {/* Messages Icon */}
          <AppPressable
            accessibilityLabel={t('messaging.conversations.title')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.headerIconButton, { backgroundColor: colors.card }]}
            onPress={() => navigation.navigate('ConversationsList')}
          >
            <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </AppPressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Today Panel */}
        <FadeIn duration={400}>
          <View style={styles.todayCard} nativeID={WALKTHROUGH_TARGET_IDS.TEACHER_STATS}>
            <View style={styles.todayHeader}>
              <View style={styles.todayTitleBlock}>
                <Text style={styles.todayEyebrow}>{t('teacherDashboard.todayTitle')}</Text>
                <Text style={styles.todayTitle}>{t('teacherDashboard.todaySubtitle')}</Text>
              </View>
              <StatusBadge
                label={availabilityStatus.label}
                variant={availabilityStatus.variant}
                icon={availabilityStatus.icon}
                style={styles.availabilityBadge}
              />
            </View>

            {nextSession ? (
              <ActionCard
                title={nextSession.student.full_name}
                description={`${translateSubject(nextSession.subject_name, t)} - ${formatBookingDate(nextSession.scheduled_date, t('common.locale'), false)} ${t('teacherDashboard.at')} ${nextSession.scheduled_time}`}
                descriptionLines={2}
                icon="videocam-outline"
                accentColor={colors.primary}
                onPress={() => navigation.navigate('TeacherBookings', { initialTab: 'upcoming' })}
                style={styles.todayAction}
              />
            ) : (
              <ActionCard
                title={pendingRequests.length > 0 ? t('teacherDashboard.pendingWaiting') : t('teacherDashboard.noUpcomingSession')}
                description={
                  pendingRequests.length > 0
                    ? t('teacherDashboard.pendingWaitingDescription', { count: pendingRequests.length })
                    : t('teacherDashboard.noUpcomingSessionDescription')
                }
                descriptionLines={2}
                icon={pendingRequests.length > 0 ? 'time-outline' : 'calendar-outline'}
                accentColor={pendingRequests.length > 0 ? colors.warning : colors.primary}
                onPress={() => navigation.navigate('TeacherBookings', { initialTab: pendingRequests.length > 0 ? 'pending' : 'upcoming' })}
                style={styles.todayAction}
              />
            )}
          </View>
        </FadeIn>

        {/* Business Health */}
        <FadeIn delay={200} duration={400}>
          <View style={styles.sectionBlock}>
            <SectionHeader
              title={t('teacherDashboard.businessHealth')}
              subtitle={t('teacherDashboard.businessHealthSubtitle')}
              icon="analytics-outline"
            />
            <View style={styles.metricsGrid}>
              <MetricCard
                label={t('teacherDashboard.completedSessions')}
                value={stats.completed_sessions || 0}
                icon="checkmark-circle-outline"
                accentColor={colors.success}
                labelLines={2}
                style={styles.metricCell}
              />
              <MetricCard
                label={t('teacherDashboard.upcomingBookings')}
                value={stats.active_bookings || 0}
                icon="calendar-outline"
                accentColor={colors.primary}
                labelLines={2}
                style={styles.metricCell}
              />
              <MetricCard
                label={t('teacherDashboard.myReviews')}
                value={stats.average_rating ? stats.average_rating.toFixed(1) : '0.0'}
                helper={`${stats.total_reviews || 0} ${t('teacherDashboard.reviews')}`}
                icon="star-outline"
                accentColor={colors.warning}
                labelLines={2}
                onPress={() => navigation.navigate('TeacherReviews' as never)}
                style={styles.metricCell}
              />
              <MetricCard
                label={t('teacherDashboard.monthlyEarnings')}
                value={`${stats.monthly_earnings || 0} AZN`}
                icon="wallet-outline"
                accentColor={colors.accent}
                labelLines={2}
                style={styles.metricCell}
              />
            </View>
          </View>
        </FadeIn>

        {/* My Exams Section */}
        <FadeIn delay={250} duration={400}>
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>{t('teacherDashboard.myExams')}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppPressable
                accessibilityLabel={t('teacherExams.createFirst')}
                onPress={() => navigation.navigate('TeacherBuildExam' as never)}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </AppPressable>
              <AppPressable
                accessibilityLabel={t('teacherDashboard.seeAll')}
                onPress={() => navigation.navigate('TeacherMyExams' as never)}
              >
                <Text style={styles.seeAllText}>{t('teacherDashboard.seeAll')}</Text>
              </AppPressable>
            </View>
          </View>
          {myExams.length === 0 ? (
            <AppPressable
              accessibilityLabel={t('teacherExams.createFirst')}
              style={styles.examEmptyRow}
              onPress={() => navigation.navigate('TeacherBuildExam' as never)}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.examEmptyText}>{t('teacherDashboard.noExamsYet')}</Text>
            </AppPressable>
          ) : (
            myExams.map(exam => (
              <View key={exam.id} style={styles.examItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examItemTitle} numberOfLines={1}>{exam.title}</Text>
                  <Text style={styles.examItemMeta}>
                    {exam.question_count}/{exam.total_questions} {t('teacherExams.questions')}
                  </Text>
                </View>
                <View style={[
                  styles.examStatusBadge,
                  { backgroundColor: exam.is_approved ? colors.successLight : colors.warningLight },
                ]}>
                  <Text style={[
                    styles.examStatusText,
                    { color: exam.is_approved ? colors.success : colors.warning },
                  ]}>
                    {t(exam.is_approved ? 'teacherExams.status.approved' : 'teacherExams.status.pending')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
        </FadeIn>

        {/* Sessions Trend Chart */}
        {stats && stats.earnings_trend.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartCardTitle}>{t('teacherDashboard.sessionsTrend')}</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  labels: stats.earnings_trend.map(t => t.month.split('-')[1]),
                  datasets: [
                    {
                      data: stats.earnings_trend.map(t => t.sessions || 0),
                    },
                  ],
                }}
                width={screenWidth - spacing.lg * 2}
                height={200}
                chartConfig={{
                  backgroundColor: colors.card,
                  backgroundGradientFrom: colors.card,
                  backgroundGradientTo: colors.card,
                  decimalPlaces: 0,
                  color: () => colors.primary,
                  labelColor: () => colors.textSecondary,
                  style: {
                    borderRadius: borderRadius.md,
                  },
                  propsForDots: {
                    r: '4',
                    strokeWidth: '2',
                    stroke: colors.primary,
                  },
                }}
                bezier
                style={styles.chart}
              />
            </View>
          </View>
        )}

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.sectionCard} nativeID={WALKTHROUGH_TARGET_IDS.TEACHER_BOOKINGS}>
            <View style={styles.sectionCardHeader}>
              <Text style={styles.sectionCardTitle}>{t('teacherDashboard.pendingRequests')}</Text>
              <AppPressable
                accessibilityLabel={t('teacherDashboard.seeAll')}
                onPress={() => navigation.navigate('TeacherBookings', { initialTab: 'pending' })}
              >
                <Text style={styles.seeAllText}>{t('teacherDashboard.seeAll')}</Text>
              </AppPressable>
            </View>
            <View style={styles.bookingsList}>
              {pendingRequests.map(b => renderBookingItem(b, 'pending'))}
            </View>
          </View>
        )}

        {/* Upcoming Sessions */}
        {upcomingSessions.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionCardHeader}>
              <Text style={styles.sectionCardTitle}>{t('teacherDashboard.upcomingSessions')}</Text>
              <AppPressable
                accessibilityLabel={t('teacherDashboard.seeAll')}
                onPress={() => navigation.navigate('TeacherBookings', { initialTab: 'upcoming' })}
              >
                <Text style={styles.seeAllText}>{t('teacherDashboard.seeAll')}</Text>
              </AppPressable>
            </View>
            <View style={styles.bookingsList}>
              {upcomingSessions.map(b => renderBookingItem(b, 'upcoming'))}
            </View>
          </View>
        )}

        {/* Availability Section */}
        {isAvailabilityEnabled && (
        <FadeIn delay={300} duration={400}>
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Text style={styles.sectionCardTitle}>{t('availability.title')}</Text>
            <AppPressable
              accessibilityLabel={t('availability.manage')}
              onPress={() => navigation.navigate('AvailabilityManagement')}
            >
              <Text style={styles.seeAllText}>{t('availability.manage')}</Text>
            </AppPressable>
          </View>
          {activeTimeOff ? (
            <View style={styles.availTimeOffBanner}>
              <Ionicons name="ban" size={18} color="#EF4444" />
              <Text style={styles.availTimeOffText}>
                {t('availability.currentlyOnTimeOff')}
                {activeTimeOff.reason ? ` - ${activeTimeOff.reason}` : ''}
              </Text>
            </View>
          ) : availability.length === 0 ? (
            <AppPressable
              accessibilityLabel={t('availability.manage')}
              style={styles.availEmptyRow}
              onPress={() => navigation.navigate('AvailabilityManagement')}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.availEmptyText}>{t('availability.tapToSet')}</Text>
            </AppPressable>
          ) : (
            <View style={styles.availDaysRow}>
              {([1,2,3,4,5,6,0] as const).map(day => {
                const slot = availability.find(a => a.day_of_week === day);
                const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'] as const;
                const dayLabel = t(`availability.days.${dayKeys[day]}`);
                return (
                  <View key={day} style={[styles.availDayChip, slot ? styles.availDayChipActive : styles.availDayChipInactive]}>
                    <Text
                      style={[styles.availDayLabel, slot ? styles.availDayLabelActive : styles.availDayLabelInactive]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                    >
                      {dayLabel}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        </FadeIn>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
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
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  greetingContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  sectionBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  todayCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  todayTitleBlock: {
    flex: 1,
  },
  todayEyebrow: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  todayTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    lineHeight: typography.fontSizes.xl * 1.2,
  },
  availabilityBadge: {
    maxWidth: 150,
  },
  todayAction: {
    minHeight: 92,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCell: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  section: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  seeAllText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  sessionOverviewCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sessionOverviewTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  sessionStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  sessionStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sessionStatValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sessionStatLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ratingCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ratingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingLeft: {
    flex: 1,
  },
  ratingValue: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  reviewsCount: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  ratingRight: {
    marginLeft: spacing.lg,
    alignItems: 'center',
  },
  ratingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ratingCardTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  chartCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartCardTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionCardTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    borderRadius: borderRadius.md,
  },
  bookingsList: {
    gap: spacing.sm,
  },
  bookingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingStudent: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  bookingDetails: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  // My Exams section
  examEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  examEmptyText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  examItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  examItemTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    color: colors.text,
  },
  examItemMeta: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  examStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  examStatusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  actionCard: {
    width: '48%',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  availTimeOffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  availTimeOffText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: '#EF4444',
    fontWeight: '600',
  },
  availEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  availEmptyText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  availDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginTop: spacing.xs,
  },
  availDayChip: {
    minWidth: 38,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  availDayChipActive: {
    backgroundColor: colors.primary,
  },
  availDayChipInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
  },
  availDayLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '700',
  },
  availDayLabelActive: {
    color: '#fff',
  },
  availDayLabelInactive: {
    color: colors.textSecondary,
  },
});
