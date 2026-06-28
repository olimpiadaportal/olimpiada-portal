import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BarChart } from 'react-native-chart-kit';
import { teacherService } from '../../services/teacherService';
import { walletService } from '../../services/walletService';
import { TeacherStats } from '../../types/teacher';
import { Wallet } from '../../types/payment';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { FadeIn } from '../../components/animated';
import { ActionCard, MetricCard, SectionHeader } from '../../components/ui';

type TeacherActivityScreenNavigationProp = StackNavigationProp<any, 'TeacherActivity'>;

interface Props {
  navigation: TeacherActivityScreenNavigationProp;
}

const screenWidth = Dimensions.get('window').width;

export const TeacherEarningsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'all'>('all');
  const hasLoadedRef = useRef(false);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = React.useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isMountedRef.current) loadActivityData({ showLoader: true });
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasLoadedRef.current) {
        loadActivityData({ showLoader: false });
      }
    });

    return unsubscribe;
  }, [navigation]);

  const loadActivityData = useCallback(async (options: { showLoader?: boolean } = {}) => {
    if (!isMountedRef.current) return;
    
    try {
      if (isMountedRef.current && (options.showLoader ?? !hasLoadedRef.current)) {
        setLoading(true);
      }
      
      // Get teacher record ID from user ID
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      if (error || !teacher) {
        console.error('Teacher not found:', error);
        if (isMountedRef.current) setLoading(false);
        return;
      }

      const [data, walletData] = await Promise.all([
        teacherService.getTeacherStats(teacher.id),
        walletService.getWallet(user?.id || ''),
      ]);
      if (isMountedRef.current) setStats(data);
      if (isMountedRef.current) setWallet(walletData);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Load activity data error:', error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActivityData({ showLoader: false });
    setRefreshing(false);
  };

  const renderLoadingSkeleton = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('teacherActivity.title')}</Text>
      </View>
      <View style={styles.skeletonContent}>
        <LoadingSkeleton width="100%" height={132} borderRadius={borderRadius.lg} />
        <LoadingSkeleton width="100%" height={54} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
        <View style={styles.skeletonGrid}>
          {[1, 2, 3].map(item => (
            <LoadingSkeleton key={item} width="31%" height={104} borderRadius={borderRadius.lg} />
          ))}
        </View>
        <LoadingSkeleton width="100%" height={236} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
        <LoadingSkeleton width="100%" height={260} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
      </View>
    </SafeAreaView>
  );

  if (loading) {
    return renderLoadingSkeleton();
  }

  // Calculate current month sessions
  const getCurrentMonthSessions = () => {
    if (!stats?.earnings_trend || stats.earnings_trend.length === 0) return 0;
    return stats.earnings_trend[stats.earnings_trend.length - 1]?.sessions || 0;
  };
  const walletCurrency = wallet?.currency ?? 'AZN';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('teacherActivity.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Wallet summary row */}
        <FadeIn duration={300}>
        <TouchableOpacity
          style={styles.walletCard}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.85}
        >
          <View style={styles.walletHeader}>
            <Ionicons name="wallet" size={24} color="#FFFFFF" />
            <Text style={styles.walletTitle} numberOfLines={1}>
              {t('teacherActivity.wallet')} · {walletCurrency}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.walletChevronText} numberOfLines={1}>{t('teacherActivity.walletButton')}</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
          </View>
          <View style={styles.walletStats}>
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel} numberOfLines={2}>{t('teacherActivity.walletBalance')}</Text>
              <Text style={styles.walletStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {walletService.formatNumber(wallet?.balance ?? 0)}
              </Text>
            </View>
            <View style={styles.walletStatDivider} />
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel} numberOfLines={2}>{t('teacherActivity.walletTotalEarned')}</Text>
              <Text style={styles.walletStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {walletService.formatNumber(wallet?.total_earned ?? 0)}
              </Text>
            </View>
            <View style={styles.walletStatDivider} />
            <View style={styles.walletStatItem}>
              <Text style={styles.walletStatLabel} numberOfLines={2}>{t('teacherActivity.walletWithdrawn')}</Text>
              <Text style={styles.walletStatValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {walletService.formatNumber(wallet?.total_withdrawn ?? 0)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        </FadeIn>

        {/* Period Selector */}
        <FadeIn delay={80} duration={300}>
        <View style={styles.periodSelector}>
          <TouchableOpacity
            style={[styles.periodButton, selectedPeriod === 'month' && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod('month')}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === 'month' && styles.periodButtonTextActive,
              ]}
            >
              {t('teacherActivity.thisMonth')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, selectedPeriod === 'all' && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod('all')}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === 'all' && styles.periodButtonTextActive,
              ]}
            >
              {t('teacherActivity.allTime')}
            </Text>
          </TouchableOpacity>
        </View>
        </FadeIn>

        <FadeIn delay={120} duration={300}>
          <ActionCard
            title={t('teacherActivity.subscribersTitle')}
            description={t('teacherActivity.subscribersSubtitle')}
            icon="people-outline"
            accentColor={colors.primary}
            onPress={() => navigation.navigate('Subscribers')}
            rightContent={
              <View style={styles.subscriberAction}>
                <Text style={styles.subscriberActionText}>
                  {t('teacherActivity.viewSubscribers')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            }
            style={styles.subscriberCard}
          />
        </FadeIn>

        {/* Activity Overview Card */}
        <FadeIn delay={140} duration={300}>
          <View style={styles.sectionBlock}>
            <SectionHeader
              title={t('teacherActivity.activityOverview')}
              icon="pulse-outline"
            />
            <View style={styles.metricsGrid}>
              <MetricCard
                label={t('teacherActivity.sessions')}
                value={selectedPeriod === 'month' ? getCurrentMonthSessions() : stats?.completed_sessions || 0}
                icon="checkmark-circle-outline"
                accentColor={colors.success}
                labelLines={2}
                style={styles.metricCell}
              />
              <MetricCard
                label={t('teacherActivity.rating')}
                value={stats?.average_rating.toFixed(1) || '0.0'}
                helper={t('teacherActivity.averageRatingDesc', { count: stats?.total_reviews || 0 })}
                icon="star-outline"
                accentColor={colors.warning}
                labelLines={2}
                style={styles.metricCell}
              />
            </View>
          </View>
        </FadeIn>

        {/* Sessions Chart */}
        {stats && stats.earnings_trend.length > 0 && (
          <FadeIn delay={200} duration={300}>
          <View style={styles.section}>
            <SectionHeader
              title={t('teacherActivity.sessionsOverTime')}
              icon="bar-chart-outline"
              style={styles.cardHeader}
            />
            <View style={styles.chartContainer}>
              <BarChart
                data={{
                  labels: stats.earnings_trend.map(t => {
                    const month = t.month.split('-')[1];
                    return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][parseInt(month) - 1];
                  }),
                  datasets: [
                    {
                      data: stats.earnings_trend.map(t => t.sessions || 0),
                    },
                  ],
                }}
                width={screenWidth - spacing.lg * 2}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: colors.card,
                  backgroundGradientFrom: colors.card,
                  backgroundGradientTo: colors.card,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(0, 146, 200, ${opacity})`,
                  labelColor: () => colors.textSecondary,
                  style: {
                    borderRadius: borderRadius.md,
                  },
                }}
                style={styles.chart}
                showValuesOnTopOfBars
              />
            </View>
          </View>
          </FadeIn>
        )}

        {/* Statistics Breakdown */}
        <FadeIn delay={260} duration={300}>
        <View style={styles.section}>
          <SectionHeader
            title={t('teacherActivity.statistics')}
            icon="list-outline"
            style={styles.cardHeader}
          />
          
          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statLabel}>{t('teacherActivity.completedSessions')}</Text>
              <Text style={styles.statDescription}>{t('teacherActivity.completedSessionsDesc')}</Text>
            </View>
            <Text style={styles.statValue}>{stats?.completed_sessions || 0}</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="calendar" size={24} color={colors.primary} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statLabel}>{t('teacherActivity.activeBookings')}</Text>
              <Text style={styles.statDescription}>{t('teacherActivity.activeBookingsDesc')}</Text>
            </View>
            <Text style={styles.statValue}>{stats?.active_bookings || 0}</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="time" size={24} color="#F59E0B" />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statLabel}>{t('teacherActivity.pendingRequests')}</Text>
              <Text style={styles.statDescription}>{t('teacherActivity.pendingRequestsDesc')}</Text>
            </View>
            <Text style={styles.statValue}>{stats?.pending_requests || 0}</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statIconContainer, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="people" size={24} color={colors.accent} />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statLabel}>{t('teacherActivity.totalStudents')}</Text>
              <Text style={styles.statDescription}>{t('teacherActivity.totalStudentsDesc')}</Text>
            </View>
            <Text style={styles.statValue}>{stats?.total_students || 0}</Text>
          </View>

          <View style={[styles.statItem, { borderBottomWidth: 0 }]}>
            <View style={[styles.statIconContainer, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="star" size={24} color="#F59E0B" />
            </View>
            <View style={styles.statInfo}>
              <Text style={styles.statLabel}>{t('teacherActivity.averageRating')}</Text>
              <Text style={styles.statDescription}>
                {t('teacherActivity.averageRatingDesc', { count: stats?.total_reviews || 0 })}
              </Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.ratingValue}>{stats?.average_rating.toFixed(1) || '0.0'}</Text>
            </View>
          </View>
        </View>
        </FadeIn>

        {/* Info Box */}
        <FadeIn delay={320} duration={300}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#1E40AF" />
          <Text style={styles.infoText}>
            {t('teacherActivity.infoMessage')}
          </Text>
        </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  skeletonContent: {
    padding: spacing.lg,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
  },
  periodButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: colors.card,
  },
  sectionBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  subscriberCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  subscriberAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    marginLeft: spacing.sm,
  },
  subscriberActionText: {
    color: colors.primary,
    fontSize: typography.fontSizes.xs,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  metricCell: {
    width: '100%',
  },
  section: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  cardHeader: {
    marginBottom: spacing.md,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    borderRadius: borderRadius.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  statLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  statValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  ratingValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: '#92400E',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    margin: spacing.lg,
  },
  infoText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.sm,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 20,
  },
  walletCard: {
    backgroundColor: '#059669',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  walletTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  walletChevronText: {
    fontSize: typography.fontSizes.xs,
    color: 'rgba(255,255,255,0.8)',
    marginRight: spacing.xs,
  },
  walletStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  walletStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  walletStatLabel: {
    fontSize: typography.fontSizes.xs,
    color: '#D1FAE5',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  walletStatValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  walletStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
});
