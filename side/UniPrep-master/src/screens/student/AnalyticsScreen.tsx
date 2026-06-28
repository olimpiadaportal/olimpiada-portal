import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { analyticsService, TimingPerformanceRow } from '../../services/analyticsService';
import { statisticsService } from '../../services/statisticsService';
import { Card } from '../../components/Card';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { typography, spacing, borderRadius } from '../../constants/theme';
import type { StudentStats, TimePeriod, PerformanceInsight } from '../../types/analytics';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineScreen } from '../../components/OfflineScreen';
import { AnimatedNumber, AnimatedProgress, FadeIn, Stagger } from '../../components/animated';
import {
  scorePredictionService,
  PredictionResult,
} from '../../services/scorePredictionService';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AppPressable, SectionHeader, StatusBadge } from '../../components/ui';

type AnalyticsCacheEntry = {
  stats: StudentStats;
  insights: PerformanceInsight[];
  chartData: any;
  prediction: PredictionResult | null;
  timingPerformance: TimingPerformanceRow[];
  studentId: string;
  timestamp: number;
  dataVersion: number;
};

const ANALYTICS_CACHE_MS = 60_000;
const analyticsCache = new Map<string, AnalyticsCacheEntry>();

/**
 * Industry-standard chart label formatting for time series data
 * Uses intelligent label sampling to prevent overlapping labels on x-axis
 *
 * Best practices applied:
 * - Maximum 7 labels visible at any time to prevent crowding
 * - Strategic placement: first, last, and evenly distributed middle points
 * - Compact date formats that scale with interval length
 * - Empty strings for non-labeled points (chart library handles spacing)
 */
const formatChartLabels = (
  data: { date: string; value: number; label?: string }[],
  timePeriod: TimePeriod,
  locale: string = 'en-US'
): string[] => {
  const dataLength = data.length;

  // Calculate optimal label interval to show max 7 labels
  const maxLabels = 7;
  const labelInterval = Math.max(1, Math.ceil(dataLength / maxLabels));

  if (timePeriod === '7D') {
    // For 7 days, show abbreviated day names (Mon, Tue, etc.)
    return data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString(locale, { weekday: 'short' }).substring(0, 3);
    });
  }

  if (timePeriod === '30D') {
    // For 30 days (showing ~14 data points), show ~5-7 labels
    // Use compact "D/M" format for clarity
    return data.map((d, index) => {
      const isFirst = index === 0;
      const isLast = index === dataLength - 1;
      const isLabelPoint = index % labelInterval === 0;

      if (isFirst || isLast || isLabelPoint) {
        const date = new Date(d.date);
        // Compact format: day/month (e.g., "15/1" for Jan 15)
        return `${date.getDate()}/${date.getMonth() + 1}`;
      }
      return '';
    });
  }

  // For 90D (showing ~30 data points), show ~5-7 labels with month context
  // Use "D Mon" format for longer intervals
  return data.map((d, index) => {
    const isFirst = index === 0;
    const isLast = index === dataLength - 1;
    const isLabelPoint = index % labelInterval === 0;

    if (isFirst || isLast || isLabelPoint) {
      const date = new Date(d.date);
      const day = date.getDate();
      const month = date.toLocaleDateString(locale, { month: 'short' }).substring(0, 3);
      return `${day} ${month}`;
    }
    return '';
  });
};

export const AnalyticsScreen = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();
  const { flags } = useFeatureFlags();
  const { isOnline } = useNetworkStatus();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(themeColors, windowWidth), [themeColors, windowWidth]);
  const chartWidth = Math.max(280, windowWidth - spacing.lg * 4);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30D');
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [insights, setInsights] = useState<PerformanceInsight[]>([]);
  const [chartData, setChartData] = useState<any>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [timingPerformance, setTimingPerformance] = useState<TimingPerformanceRow[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Reload analytics when screen is focused or time period changes
  useEffect(() => {
    if (isFocused) {
      loadAnalytics();
    }
  }, [timePeriod, isFocused, isOnline]);

  const loadAnalytics = async (isRefreshing = false, force = false) => {
    if (!user?.id) return;
    if (!isOnline) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cacheKey = `${user.id}:${timePeriod}`;
    const cached = analyticsCache.get(cacheKey);
    const hasFreshCache = cached && Date.now() - cached.timestamp < ANALYTICS_CACHE_MS;
    const hasCurrentDataVersion = cached?.dataVersion === analyticsService.getAnalyticsDataVersion();

    if (!force && cached && hasCurrentDataVersion) {
      setStats(cached.stats);
      setInsights(cached.insights);
      setChartData(cached.chartData);
      setPrediction(cached.prediction);
      setTimingPerformance(cached.timingPerformance);
      setStudentId(cached.studentId);
      setLoading(false);

      if (!hasFreshCache) {
        void loadAnalytics(false, true);
      }
      return;
    }

    try {
      if (isRefreshing) {
        setRefreshing(true);
      } else if (!cached) {
        setLoading(true);
      }

      // Get student ID
      const studentId = await analyticsService.getStudentIdFromUserId(user.id);
      if (!studentId) {
        setLoading(false);
        return;
      }
      setStudentId(studentId);

      // Fetch stats
      const studentStats = await analyticsService.fetchStudentStats(studentId, timePeriod);
      setStats(studentStats);

      // Generate insights
      const performanceInsights = await statisticsService.generateInsights(
        studentId,
        studentStats.overallAccuracy,
        studentStats.currentStreak,
        studentStats.totalQuestionsAttempted
      );
      setInsights(performanceInsights);

      // Prepare chart data
      const endDate = new Date();
      const startDate = new Date();
      const days = timePeriod === '7D' ? 7 : timePeriod === '30D' ? 30 : 90;
      startDate.setDate(endDate.getDate() - days);

      const dailyStats = await analyticsService.fetchDailyStats(
        studentId,
        startDate,
        endDate
      );

      const studyTimeData = analyticsService.prepareStudyTimeChartData(dailyStats, t('common.locale'));
      let nextChartData = null;

      // Only show chart if there's actual data
      if (studyTimeData.length > 0) {
        // Prepare data for chart based on selected time period
        // Show last 7 days for 7D, last 14 days for 30D, last 30 days for 90D
        const dataPointsToShow = timePeriod === '7D' ? 7 : timePeriod === '30D' ? 14 : 30;
        const recentData = studyTimeData.slice(-dataPointsToShow);

        // Industry-standard approach: Show sparse labels for longer intervals
        // This prevents overlapping/unreadable labels on the x-axis
        const labels = formatChartLabels(recentData, timePeriod, t('common.locale'));

        nextChartData = {
          labels,
          datasets: [{
            data: recentData.map(d => d.value),
          }],
        };
        setChartData(nextChartData);
      } else {
        setChartData(null); // No data, don't show chart
      }

      // Phase 6: Load score prediction
      let nextPrediction: PredictionResult | null = null;
      try {
        const pred = await scorePredictionService.predictScoreForUser(user.id, studentId);
        nextPrediction = pred;
        setPrediction(nextPrediction);
      } catch (predErr) {
        console.warn('Score prediction load error (non-fatal):', predErr);
      }

      const timingRows = await analyticsService.fetchTimingPerformance(studentId, timePeriod);
      setTimingPerformance(timingRows);

      analyticsCache.set(cacheKey, {
        stats: studentStats,
        insights: performanceInsights,
        chartData: nextChartData,
        prediction: nextPrediction,
        timingPerformance: timingRows,
        studentId,
        timestamp: Date.now(),
        dataVersion: analyticsService.getAnalyticsDataVersion(),
      });

      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadAnalytics(true, true);
  };

  const getTimePeriodLabel = (period: TimePeriod): string => {
    const labels = {
      '7D': t('analytics.timePeriod.7D'),
      '30D': t('analytics.timePeriod.30D'),
      '90D': t('analytics.timePeriod.90D'),
    };
    return labels[period];
  };

  const renderTimePeriodSelector = () => (
    <View style={styles.periodSelector}>
      {(['7D', '30D', '90D'] as TimePeriod[]).map((period) => (
        <AppPressable
          key={period}
        accessibilityLabel={getTimePeriodLabel(period)}
          accessibilityState={{ selected: timePeriod === period }}
          haptic={false}
          style={[
            styles.periodButton,
            timePeriod === period && styles.periodButtonActive,
          ]}
          onPress={() => setTimePeriod(period)}
        >
          <Text
            style={[
              styles.periodButtonText,
              timePeriod === period && styles.periodButtonTextActive,
            ]}
          >
            {getTimePeriodLabel(period)}
          </Text>
        </AppPressable>
      ))}
    </View>
  );

  const renderOverviewMetric = (
    icon: string,
    label: string,
    value: string | number,
    color: string,
    helper?: string
  ) => (
    <View style={styles.overviewMetricRow}>
      <View style={[styles.metricIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={color} />
      </View>
      <View style={styles.overviewMetricText}>
        <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
        {helper && <Text style={styles.metricSubtitle} numberOfLines={2}>{helper}</Text>}
      </View>
      <Text
        style={styles.metricValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {value}
      </Text>
    </View>
  );

  const renderOverviewCard = (currentStats: StudentStats) => (
    <Card style={styles.overviewCard}>
      <View style={styles.overviewHeader}>
        <View style={styles.overviewTitleBlock}>
          <Text style={styles.overviewEyebrow}>{t('analytics.overview.eyebrow')}</Text>
          <Text style={styles.overviewTitle}>{t('analytics.overview.title')}</Text>
        </View>
        <View style={[styles.overviewAccuracyBadge, { backgroundColor: themeColors.primaryLight }]}>
          <AnimatedNumber
            value={currentStats.overallAccuracy}
            suffix="%"
            duration={500}
            style={[styles.overviewAccuracyText, { color: themeColors.primary }]}
          />
        </View>
      </View>

      <AnimatedProgress
        progress={currentStats.overallAccuracy / 100}
        color={themeColors.primary}
        trackColor={themeColors.border}
        height={7}
        borderRadius={4}
        style={styles.overviewProgress}
      />

      <View style={styles.overviewMetrics}>
        {renderOverviewMetric(
          'document-text',
          t('analytics.metrics.questions'),
          currentStats.totalQuestionsAttempted,
          themeColors.primary,
          `${currentStats.totalQuestionsCorrect}/${currentStats.totalQuestionsAttempted} ${t('analytics.performanceSummary.correctAnswers').toLowerCase()}`
        )}
        {renderOverviewMetric(
          'time',
          t('analytics.metrics.studyTime'),
          `${currentStats.totalStudyTimeMinutes}${t('analytics.metrics.minutes')}`,
          themeColors.secondary,
          `${currentStats.avgDailyStudyTime}${t('analytics.metrics.minutes')}${t('analytics.metrics.perDay')}`
        )}
        {renderOverviewMetric(
          'flame',
          t('analytics.metrics.streak'),
          currentStats.currentStreak,
          themeColors.warning,
          `${t('analytics.metrics.best')}: ${currentStats.bestStreak} ${t('common.days')}`
        )}
      </View>
    </Card>
  );

  const renderLeaderboardEntry = () => {
    if (!flags.leaderboards) return null;

    return (
      <AppPressable
        accessibilityLabel={t('analytics.leaderboardEntry.title')}
        style={styles.leaderboardEntry}
        onPress={() => navigation.navigate('Leaderboard' as never)}
      >
        <View style={[styles.leaderboardIcon, { backgroundColor: themeColors.warningLight }]}>
          <Ionicons name="trophy" size={20} color={themeColors.warning} />
        </View>
        <View style={styles.leaderboardTextBlock}>
          <Text style={styles.leaderboardTitle} numberOfLines={1}>
            {t('analytics.leaderboardEntry.title')}
          </Text>
          <Text style={styles.leaderboardDescription} numberOfLines={2}>
            {t('analytics.leaderboardEntry.description')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={themeColors.textTertiary} />
      </AppPressable>
    );
  };

  const renderPredictionCard = () => {
    if (!prediction || !prediction.has_sufficient_data) {
      return (
        <FadeIn delay={500} duration={400}>
          <AppPressable
            accessibilityLabel={t('scorePrediction.title')}
            style={styles.predictionEmptyCard}
            onPress={() => navigation.navigate('ScorePrediction' as never)}
          >
            <View style={[styles.predictionEmptyIcon, { backgroundColor: themeColors.primaryLight }]}>
              <Ionicons name="analytics-outline" size={22} color={themeColors.primary} />
            </View>
            <View style={styles.predictionEmptyText}>
              <Text style={styles.sectionTitle}>{t('scorePrediction.title')}</Text>
              <Text style={styles.predDisclaimer} numberOfLines={3}>
                {prediction
                  ? t('scorePrediction.notEnoughDataDesc')
                  : t('analytics.predictionEvidence.noPrediction')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={themeColors.textTertiary} />
          </AppPressable>
        </FadeIn>
      );
    }

    const confidenceKey = `scorePrediction.confidence.${prediction.confidence}`;
    const confidenceVariant =
      prediction.confidence === 'high'
        ? 'success'
        : prediction.confidence === 'medium'
          ? 'info'
          : 'warning';

    return (
      <FadeIn delay={500} duration={400}>
        <AppPressable
          accessibilityLabel={t('scorePrediction.title')}
          style={styles.predictionCard}
          onPress={() => navigation.navigate('ScorePrediction' as never)}
        >
          <View style={styles.predictionHeader}>
            <View style={styles.predictionTitleBlock}>
              <Text style={styles.sectionTitle}>{t('scorePrediction.title')}</Text>
              <Text style={styles.predDisclaimer}>
                {t('scorePrediction.disclaimer')}
              </Text>
            </View>
            <StatusBadge
              label={t(confidenceKey)}
              icon="analytics-outline"
              variant={confidenceVariant}
            />
          </View>
          <View style={styles.predictionRow}>
            <View style={styles.predictionScoreBlock}>
              <AnimatedNumber
                value={prediction.predicted_score}
                duration={550}
                style={[styles.predictionScore, { color: themeColors.text }]}
              />
              <Text style={[styles.predictionMax, { color: themeColors.textSecondary }]}>
                /{prediction.max_possible_score}
              </Text>
            </View>
            <Text style={[styles.predictionPct, { color: themeColors.accent }]}>
              {prediction.predicted_percentage}%
            </Text>
          </View>
          <AnimatedProgress
            progress={prediction.predicted_percentage / 100}
            color={themeColors.accent}
            trackColor={themeColors.border}
            height={7}
            borderRadius={4}
            style={styles.predictionProgress}
          />
          <View style={styles.predictionEvidenceRow}>
            <View style={styles.predictionEvidenceItem}>
              <Text style={styles.predictionEvidenceLabel}>{t('analytics.predictionEvidence.answers')}</Text>
              <Text style={styles.predictionEvidenceValue}>
                {prediction.total_questions_correct}/{prediction.total_questions_attempted}
              </Text>
            </View>
            <View style={styles.predictionEvidenceItem}>
              <Text style={styles.predictionEvidenceLabel}>{t('analytics.predictionEvidence.improvement')}</Text>
              <Text style={styles.predictionEvidenceValue}>
                {prediction.improvement_areas[0]?.subject_name ?? t('analytics.predictionEvidence.stable')}
              </Text>
            </View>
          </View>
          <View style={styles.predictionFooter}>
            <Text style={styles.predictionFooterText}>
              {t('analytics.predictionEvidence.openDetails')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={themeColors.textTertiary} />
          </View>
        </AppPressable>
      </FadeIn>
    );
  };

  const renderInsightCard = (insight: PerformanceInsight) => {
    const iconColors = {
      strength: themeColors.success,
      weakness: themeColors.error,
      improvement: themeColors.secondary,
      recommendation: themeColors.primary,
    };

    return (
      <Card key={insight.title} style={styles.insightCard}>
        <View style={styles.insightHeader}>
          <Text style={styles.insightIcon}>{insight.icon}</Text>
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>{insight.title}</Text>
            <Text style={styles.insightDescription}>{insight.description}</Text>
          </View>
        </View>
      </Card>
    );
  };

  const renderTimingPerformanceCard = () => {
    const language = i18n.language?.split('-')[0] || 'en';
    const getLocalizedSubjectName = (row: TimingPerformanceRow) => {
      if (language === 'az' || language === 'ru') {
        return row.subject_name_az || row.subject_name_en || row.subject_name;
      }
      return row.subject_name_en || row.subject_name;
    };

    const totals = timingPerformance.reduce(
      (acc, row) => {
        acc.fast += Number(row.fast_count || 0);
        acc.normal += Number(row.normal_count || 0);
        acc.slow += Number(row.slow_count || 0);
        acc.verySlow += Number(row.very_slow_count || 0);
        acc.answered += Number(row.answered_attempts || 0);
        return acc;
      },
      { fast: 0, normal: 0, slow: 0, verySlow: 0, answered: 0 }
    );

    const getTimingRatio = (row: TimingPerformanceRow) => {
      const expectedSeconds = Number(row.avg_expected_seconds || 0);
      const averageSeconds = Number(row.avg_time_seconds || 0);
      return expectedSeconds > 0 ? averageSeconds / expectedSeconds : averageSeconds;
    };

    const slowRows = [...timingPerformance]
      .filter(row => Number(row.answered_attempts || 0) > 0 && Number(row.avg_time_seconds || 0) > 0)
      .sort((a, b) => {
        const ratioDiff = getTimingRatio(b) - getTimingRatio(a);
        if (ratioDiff !== 0) return ratioDiff;
        return new Date(b.last_attempted || 0).getTime() - new Date(a.last_attempted || 0).getTime();
      })
      .slice(0, 3);

    if (totals.answered === 0) {
      return (
        <FadeIn delay={800} duration={400}>
          <Card style={styles.timingCard}>
            <SectionHeader
              title={t('analytics.timing.title')}
              subtitle={t('analytics.timing.empty')}
              icon="speedometer-outline"
              style={styles.timingHeader}
            />
          </Card>
        </FadeIn>
      );
    }

    const pieData = [
      {
        name: t('analytics.timing.fast'),
        population: totals.fast,
        color: themeColors.success,
        legendFontColor: themeColors.textSecondary,
        legendFontSize: 12,
      },
      {
        name: t('analytics.timing.normal'),
        population: totals.normal,
        color: themeColors.primary,
        legendFontColor: themeColors.textSecondary,
        legendFontSize: 12,
      },
      {
        name: t('analytics.timing.slow'),
        population: totals.slow,
        color: themeColors.warning,
        legendFontColor: themeColors.textSecondary,
        legendFontSize: 12,
      },
      {
        name: t('analytics.timing.verySlow'),
        population: totals.verySlow,
        color: themeColors.error,
        legendFontColor: themeColors.textSecondary,
        legendFontSize: 12,
      },
    ].filter(item => item.population > 0);

    return (
      <FadeIn delay={800} duration={400}>
        <Card style={styles.timingCard}>
          <SectionHeader
            title={t('analytics.timing.title')}
            subtitle={t('analytics.timing.subtitle')}
            icon="speedometer-outline"
            style={styles.timingHeader}
          />
          <PieChart
            data={pieData}
            width={chartWidth}
            height={174}
            chartConfig={{
              color: () => themeColors.text,
              labelColor: () => themeColors.textSecondary,
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="0"
            absolute
          />
          <View style={styles.timingSummaryRow}>
            <Text style={styles.timingSummaryLabel}>{t('analytics.timing.answered')}</Text>
            <Text style={styles.timingSummaryValue}>{totals.answered}</Text>
          </View>
          <Text style={styles.timingBenchmarkNote}>{t('analytics.timing.benchmarkNote')}</Text>
          {slowRows.length > 0 && (
            <View style={styles.slowTopics}>
              <Text style={styles.slowTopicsTitle}>{t('analytics.timing.slowestAreas')}</Text>
              {slowRows.map((row, index) => {
                const subjectName = getLocalizedSubjectName(row);
                const label = row.subtopic_name || row.topic_name || subjectName;
                return (
                  <View key={`${row.subject_id}-${row.topic_name}-${row.subtopic_id}-${index}`} style={styles.slowTopicRow}>
                    <View style={styles.slowTopicText}>
                      <Text style={styles.slowTopicTitle} numberOfLines={2}>{label}</Text>
                      <Text style={styles.slowTopicMeta} numberOfLines={1}>
                        {subjectName} · {Number(row.accuracy || 0).toFixed(0)}%
                      </Text>
                    </View>
                    <Text style={styles.slowTopicTime}>{Math.round(Number(row.avg_time_seconds || 0))}s</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </FadeIn>
    );
  };

  const renderAnalyticsSkeleton = () => (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.skeletonHeaderText}>
            <LoadingSkeleton width={170} height={28} />
            <LoadingSkeleton width={230} height={16} />
          </View>
          <LoadingSkeleton width={44} height={44} borderRadius={22} />
        </View>

        <View style={styles.periodSelector}>
          <LoadingSkeleton width={72} height={36} borderRadius={18} />
          <LoadingSkeleton width={72} height={36} borderRadius={18} />
          <LoadingSkeleton width={72} height={36} borderRadius={18} />
        </View>

        <View style={[styles.overviewCard, styles.skeletonPanel, { backgroundColor: themeColors.card }]}>
          <View style={styles.skeletonOverviewHeader}>
            <View style={styles.skeletonHeaderText}>
              <LoadingSkeleton width={96} height={14} />
              <LoadingSkeleton width={150} height={22} />
            </View>
            <LoadingSkeleton width={74} height={38} borderRadius={19} />
          </View>
          <LoadingSkeleton width="100%" height={7} borderRadius={4} />
          {[0, 1, 2].map((item) => (
            <LoadingSkeleton key={item} width="100%" height={48} borderRadius={borderRadius.md} />
          ))}
        </View>

        <View style={[styles.leaderboardEntry, { backgroundColor: themeColors.card }]}>
          <LoadingSkeleton width={44} height={44} borderRadius={borderRadius.md} />
          <View style={styles.skeletonHeaderText}>
            <LoadingSkeleton width={140} height={18} />
            <LoadingSkeleton width={220} height={14} />
          </View>
        </View>

        <View style={[styles.summaryCard, styles.skeletonPanel, { backgroundColor: themeColors.card }]}>
          <LoadingSkeleton width="48%" height={22} />
          <LoadingSkeleton width="100%" height={140} borderRadius={borderRadius.md} />
        </View>

        <View style={[styles.summaryCard, styles.skeletonPanel, { backgroundColor: themeColors.card }]}>
          <LoadingSkeleton width="58%" height={22} />
          <LoadingSkeleton width="100%" height={18} />
          <LoadingSkeleton width="92%" height={18} />
          <LoadingSkeleton width="80%" height={18} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // Analytics depends on fresh server-backed data; keep the offline state explicit.
  if (!isOnline) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <OfflineScreen
          title={t('offline.analyticsTitle', 'Analytics Unavailable')}
          message={t('offline.analyticsMessage', 'Connect to the internet to view your learning analytics. You can still practice with downloaded questions.')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="stats-chart-outline"
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return renderAnalyticsSkeleton();
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="analytics-outline" size={64} color={themeColors.disabled} />
          <Text style={styles.emptyTitle}>{t('analytics.noData')}</Text>
          <Text style={styles.emptyText}>
            {t('analytics.noDataDesc')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[themeColors.primary]}
            tintColor={themeColors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t('analytics.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('analytics.subtitle')}</Text>
          </View>
        </View>

        {/* Time Period Selector */}
        {renderTimePeriodSelector()}

        <Stagger delay={80} initialDelay={100} distance={16}>
          {renderOverviewCard(stats)}
          {renderLeaderboardEntry()}
        </Stagger>

        {renderPredictionCard()}

        {/* Study Time Chart */}
        {chartData && chartData.datasets[0].data.length > 0 ? (
          <FadeIn delay={650} duration={400}>
          <Card style={styles.chartCard}>
            <SectionHeader
              title={`${t('analytics.charts.studyTime')} (${timePeriod})`}
              subtitle={t('analytics.charts.studyTimeSubtitle')}
              style={styles.chartHeader}
            />
            <LineChart
              data={chartData}
              width={chartWidth}
              height={220}
              chartConfig={{
                backgroundColor: themeColors.card,
                backgroundGradientFrom: themeColors.card,
                backgroundGradientTo: themeColors.card,
                decimalPlaces: 0,
                color: (opacity = 1) => themeColors.primary,
                labelColor: (opacity = 1) => themeColors.textSecondary,
                style: {
                  borderRadius: borderRadius.md,
                },
                propsForDots: {
                  r: '4',
                  strokeWidth: '2',
                  stroke: themeColors.primary,
                },
              }}
              bezier
              style={styles.chart}
            />
          </Card>
          </FadeIn>
        ) : (
          <FadeIn delay={650} duration={400}>
            <Card style={styles.chartEmptyCard}>
              <View style={[styles.chartEmptyIcon, { backgroundColor: themeColors.primaryLight }]}>
                <Ionicons name="bar-chart-outline" size={22} color={themeColors.secondary} />
              </View>
              <View style={styles.chartEmptyText}>
                <Text style={styles.sectionTitle}>{t('analytics.charts.studyTime')}</Text>
                <Text style={styles.predDisclaimer}>
                  {t('analytics.charts.noStudyTime')}
                </Text>
              </View>
            </Card>
          </FadeIn>
        )}

        {renderTimingPerformanceCard()}

        {/* Performance Summary */}
        <FadeIn delay={750} duration={400}>
        <Card style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>{t('analytics.performanceSummary.title')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('analytics.performanceSummary.practiceSessions')}</Text>
            <Text style={styles.summaryValue}>{stats.practiceSessions}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('analytics.performanceSummary.mockExams')}</Text>
            <Text style={styles.summaryValue}>{stats.mockExamsCompleted}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('analytics.performanceSummary.activeDays')}</Text>
            <Text style={styles.summaryValue}>{stats.activeDays}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('analytics.performanceSummary.correctAnswers')}</Text>
            <Text style={styles.summaryValue}>
              {stats.totalQuestionsCorrect}/{stats.totalQuestionsAttempted}
            </Text>
          </View>
        </Card>
        </FadeIn>

        {/* Insights */}
        {insights.length > 0 && (
          <FadeIn delay={850} duration={400}>
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>{t('analytics.insightsRecommendations.title')}</Text>
            {insights.map(renderInsightCard)}
          </View>
          </FadeIn>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, screenWidth: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  skeletonHeaderText: {
    gap: spacing.sm,
  },
  skeletonMetricCard: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  skeletonPanel: {
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  skeletonOverviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  leaderboardButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  periodButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  metricCard: {
    width: (screenWidth - spacing.lg * 2 - spacing.md) / 2,
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  metricValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  metricLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  metricSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  chartCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  chartEmptyCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  chartEmptyIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  chartEmptyText: {
    flex: 1,
  },
  chartHeader: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chartTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  chart: {
    marginVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  timingCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  timingHeader: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  timingSummaryRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  timingSummaryLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
  },
  timingSummaryValue: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  timingBenchmarkNote: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    lineHeight: 17,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  slowTopics: {
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  slowTopicsTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  slowTopicRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  slowTopicText: {
    flex: 1,
  },
  slowTopicTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: 18,
  },
  slowTopicMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    marginTop: 2,
  },
  slowTopicTime: {
    color: colors.warning,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  insightsSection: {
    paddingHorizontal: spacing.lg,
  },
  insightCard: {
    marginBottom: spacing.md,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  insightIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  insightDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  predictionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  predictionScoreBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  predictionScore: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  predictionMax: {
    fontSize: typography.fontSizes.md,
    fontWeight: '500',
  },
  predictionBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full ?? 999,
  },
  predictionPct: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
  },
  predBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  predBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
  },
  predDisclaimer: {
    fontSize: typography.fontSizes.xs,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  overviewCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  overviewHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  overviewTitleBlock: {
    flex: 1,
  },
  overviewEyebrow: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  overviewTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.lg * typography.lineHeights.tight,
  },
  overviewAccuracyBadge: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    minWidth: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  overviewAccuracyText: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '800',
  },
  overviewProgress: {
    marginTop: spacing.md,
  },
  overviewMetrics: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  overviewMetricRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 62,
    paddingTop: spacing.sm,
  },
  overviewMetricText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  leaderboardEntry: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 78,
    padding: spacing.md,
  },
  leaderboardIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 44,
  },
  leaderboardTextBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  leaderboardTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: 2,
  },
  leaderboardDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  predictionCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  predictionEmptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    minHeight: 96,
    padding: spacing.md,
  },
  predictionEmptyIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  predictionEmptyText: {
    flex: 1,
  },
  predictionTitleBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  predictionProgress: {
    marginBottom: spacing.md,
  },
  predictionEvidenceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  predictionEvidenceItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    flex: 1,
    minHeight: 66,
    padding: spacing.sm,
  },
  predictionEvidenceLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    marginBottom: 4,
  },
  predictionEvidenceValue: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  predictionFooter: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  predictionFooterText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
});
