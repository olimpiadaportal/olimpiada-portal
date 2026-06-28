import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { leaderboardService, LeaderboardEntry, StudentRank, RankType, LeaderboardScope } from '../../services/leaderboardService';
import { referenceDataService } from '../../services/referenceDataService';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { LeaderboardUserDetailsModal } from '../../components/LeaderboardUserDetailsModal';
import { FadeIn, AnimatedNumber } from '../../components/animated';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { StatusBadge } from '../../components/ui';

export const LeaderboardScreen = () => {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors: themeColors } = useTheme();
  const styles = React.useMemo(() => createStyles(themeColors), [themeColors]);

  // State
  const [scope, setScope] = useState<LeaderboardScope>('city');
  const [rankType, setRankType] = useState<RankType>('score');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [studentRank, setStudentRank] = useState<StudentRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentCity, setStudentCity] = useState<string>('');
  const [cities, setCities] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSeason, setActiveSeason] = useState<any>(null);

  // Load student city and cities data
  useEffect(() => {
    loadStudentCity();
    loadCities();
    loadActiveSeason();
  }, []);

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadActiveSeason = async () => {
    try {
      const { data, error } = await leaderboardService.supabase
        .from('leaderboard_seasons')
        .select('*')
        .eq('is_active', true)
        .single();

      if (!error && data) {
        setActiveSeason(data);
      }
    } catch (error) {
      console.error('Error loading active season:', error);
    }
  };

  // Helper to get Azerbaijani city name for display
  const getCityDisplayName = (englishName: string): string => {
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  const loadStudentCity = async () => {
    if (!user?.id) return;
    try {
      const { data: student } = await leaderboardService.supabase
        .from('students')
        .select('city')
        .eq('user_id', user.id)
        .single();

      if (student) {
        setStudentCity(student.city);
      }
    } catch (error) {
      console.error('Error loading student city:', error);
    }
  };

  const loadLeaderboard = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      if (!options.silent) {
        setLoading(true);
      }

      // Get student ID first
      const { data: student } = await leaderboardService.supabase
        .from('students')
        .select('id, city')
        .eq('user_id', user.id)
        .single();

      if (!student) {
        console.error('Student not found');
        return;
      }

      // Fetch leaderboard
      let data: LeaderboardEntry[] = [];
      if (scope === 'city') {
        data = await leaderboardService.fetchCityLeaderboard(
          student.city,
          rankType
        );
      } else {
        data = await leaderboardService.fetchNationalLeaderboard(rankType);
      }

      setLeaderboard(data);

      // Fetch student rank
      const rank = await leaderboardService.getStudentRank(
        student.id,
        rankType,
        scope
      );
      setStudentRank(rank);

    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [rankType, scope, user?.id]);

  // Load data on mount and when filters change.
  useEffect(() => {
    if (isFocused) {
      loadLeaderboard({ silent: leaderboard.length > 0 });
    }
  }, [scope, rankType, isFocused, loadLeaderboard, leaderboard.length]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard({ silent: true });
    setRefreshing(false);
  };

  const handleUserPress = (item: LeaderboardEntry) => {
    setSelectedStudent({ id: item.id, name: item.display_name });
    setModalVisible(true);
  };

  const renderLeaderboardItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isCurrentUser = item.id === user?.id;
    const isTopThree = item.rank <= 3;

    return (
      <FadeIn delay={index * 40} duration={250}>
      <TouchableOpacity onPress={() => handleUserPress(item)} activeOpacity={0.7}>
        <View style={[styles.item, isCurrentUser && styles.currentUserItem]}>
        <View style={styles.itemContent}>
          {/* Rank */}
          <View style={[styles.rankContainer, isTopThree && styles.topRankContainer]}>
            <Ionicons
              name={isTopThree ? 'trophy' : 'ribbon-outline'}
              size={18}
              color={isTopThree ? themeColors.warning : themeColors.textSecondary}
            />
            <Text style={[styles.rank, isTopThree && styles.topRank]}>#{item.rank}</Text>
          </View>

          {/* Student Info */}
          <View style={styles.studentInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.studentName, isCurrentUser && styles.currentUserName]}>
                {item.display_name}
              </Text>
              {isCurrentUser && (
                <StatusBadge label={t('leaderboard.you')} variant="info" style={styles.youBadge} />
              )}
            </View>
            <View style={styles.cityRow}>
              <Ionicons name="location" size={12} color={themeColors.textSecondary} />
              <Text style={styles.studentCity}>{item.city}</Text>
            </View>
          </View>

          {/* Value */}
          <View style={styles.valueContainer}>
            <AnimatedNumber
              value={rankType === 'score'
                ? Number(item.monthly_score ?? item.score ?? 0)
                : item.streak}
              style={[styles.value, isCurrentUser && styles.currentUserValue]}
              formatFn={(value) => Math.round(value).toLocaleString()}
              duration={450}
            />
            <Text style={styles.valueLabel}>
              {rankType === 'score' ? t('leaderboard.points') : t('leaderboard.days')}
            </Text>
          </View>
        </View>
      </View>
      </TouchableOpacity>
      </FadeIn>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingHeader}>
            <LoadingSkeleton width={44} height={44} borderRadius={22} />
            <View style={styles.loadingHeaderText}>
              <LoadingSkeleton width="55%" height={28} />
              <LoadingSkeleton width="75%" height={14} style={styles.loadingLine} />
            </View>
          </View>
          <LoadingSkeleton width="100%" height={96} borderRadius={borderRadius.lg} style={styles.loadingBlock} />
          <LoadingSkeleton width="100%" height={92} borderRadius={borderRadius.lg} style={styles.loadingBlock} />
          {[0, 1, 2, 3, 4].map((item) => (
            <LoadingSkeleton
              key={item}
              width="100%"
              height={76}
              borderRadius={borderRadius.lg}
              style={styles.loadingBlock}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>{t('leaderboard.title')}</Text>
          <Text style={styles.subtitle}>{t('leaderboard.subtitle')}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Active Season Banner */}
      {activeSeason && (
        <View style={styles.seasonBanner}>
          <View style={styles.seasonContent}>
            <View style={styles.seasonIcon}>
              <Ionicons name="trophy" size={20} color={themeColors.primary} />
            </View>
            <View style={styles.seasonInfo}>
              <Text style={styles.seasonName}>{activeSeason.name}</Text>
              {activeSeason.description && (
                <Text style={styles.seasonDescription}>{activeSeason.description}</Text>
              )}
            </View>
            <StatusBadge label={t('leaderboard.activeSeason')} variant="success" />
          </View>
        </View>
      )}

      {/* Scope Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, scope === 'city' && styles.activeTab]}
          onPress={() => setScope('city')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="business"
            size={20}
            color={scope === 'city' ? '#FFFFFF' : themeColors.text}
          />
          <Text style={[styles.tabText, scope === 'city' && styles.activeTabText]}>
            {t('leaderboard.myCity')}
          </Text>
          {studentCity && (
            <Text style={[styles.tabSubtext, { color: scope === 'city' ? 'rgba(255,255,255,0.7)' : themeColors.textSecondary }]}>
              {getCityDisplayName(studentCity)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, scope === 'national' && styles.activeTab]}
          onPress={() => setScope('national')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="globe"
            size={20}
            color={scope === 'national' ? '#FFFFFF' : themeColors.text}
          />
          <Text style={[styles.tabText, scope === 'national' && styles.activeTabText]}>
            {t('leaderboard.national')}
          </Text>
          <Text style={[styles.tabSubtext, { color: scope === 'national' ? 'rgba(255,255,255,0.7)' : themeColors.textSecondary }]}>
            {t('leaderboard.azerbaijan')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Rank Type Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filter, rankType === 'score' && styles.activeFilter]}
          onPress={() => setRankType('score')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="trophy"
            size={18}
            color={rankType === 'score' ? themeColors.primary : themeColors.textSecondary}
          />
          <View>
            <Text style={[styles.filterText, rankType === 'score' && styles.activeFilterText]}>
              {t('leaderboard.score')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filter, rankType === 'streak' && styles.activeFilter]}
          onPress={() => setRankType('streak')}
          activeOpacity={0.7}
        >
          <Ionicons
            name="flame"
            size={18}
            color={rankType === 'streak' ? themeColors.primary : themeColors.textSecondary}
          />
          <Text style={[styles.filterText, rankType === 'streak' && styles.activeFilterText]}>
            {t('leaderboard.streak')}
          </Text>
        </TouchableOpacity>
      </View>

      {rankType === 'score' && (
        <View style={styles.officialNote}>
          <Ionicons name="shield-checkmark-outline" size={18} color={themeColors.primary} />
          <Text style={styles.officialNoteText}>{t('leaderboard.officialOnlyNote')}</Text>
        </View>
      )}

      {/* Current User Rank Card */}
      {studentRank && (
        <FadeIn delay={200}>
        <View style={styles.rankCard}>
          <View>
            <View style={styles.rankContent}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankNumber}>#{studentRank.rank}</Text>
              </View>
              <View style={styles.rankInfo}>
                <Text style={styles.rankLabel}>{t('leaderboard.yourRank')}</Text>
                <Text style={styles.rankValue}>
                  {rankType === 'score'
                    ? `${Number(studentRank.value).toLocaleString()} ${t('leaderboard.points')}`
                    : `${studentRank.value} ${t('leaderboard.days')}`}
                </Text>
                <Text style={styles.rankTotal}>
                  {t('leaderboard.outOf', { total: studentRank.total })}
                </Text>
              </View>
              <View style={styles.rankIcon}>
                <Ionicons
                  name={rankType === 'score' ? 'trophy' : 'flame'}
                  size={32}
                  color="#3B82F6"
                />
              </View>
            </View>
          </View>
        </View>
        </FadeIn>
      )}

      {/* Leaderboard List */}
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.id}
        renderItem={renderLeaderboardItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[themeColors.primary]}
            tintColor={themeColors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={64} color={themeColors.textSecondary} />
            <Text style={styles.emptyTitle}>{t('leaderboard.noRankingsYet')}</Text>
            <Text style={styles.emptyText}>
              {rankType === 'score'
                ? t('leaderboard.completeExamsToAppear')
                : t('leaderboard.startStreakToAppear')}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* User Details Modal */}
      <LeaderboardUserDetailsModal
        visible={modalVisible}
        studentId={selectedStudent?.id || null}
        studentName={selectedStudent?.name || ''}
        onClose={() => setModalVisible(false)}
      />
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
    padding: spacing.md,
    paddingTop: spacing.lg,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  loadingHeaderText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  loadingLine: {
    marginTop: spacing.sm,
  },
  loadingBlock: {
    marginBottom: spacing.md,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  activeTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
  },
  activeTabText: {
    color: colors.white,
    fontWeight: 'bold',
  },
  tabSubtext: {
    fontSize: 11,
    color: colors.white + 'AA',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  filter: {
    flex: 1,
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeFilter: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: typography.fontWeights.medium,
    color: colors.textSecondary,
  },
  filterSubText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  activeFilterText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  officialNote: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  officialNoteText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
  },
  rankCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.primary + '15',
    padding: spacing.lg,
  },
  rankContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rankBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  rankNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
  },
  rankInfo: {
    flex: 1,
  },
  rankLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rankValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.xs,
  },
  rankTotal: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  rankIcon: {
    opacity: 0.3,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  item: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  currentUserItem: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + '20',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rankContainer: {
    width: 56,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  topRankContainer: {
    backgroundColor: colors.warningLight,
  },
  medal: {
    fontSize: 36,
  },
  rank: {
    fontSize: 13,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginTop: 2,
  },
  topRank: {
    color: colors.warning,
  },
  studentInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  studentName: {
    fontSize: 16,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    flexShrink: 1,
  },
  currentUserName: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  youBadge: {
    flexShrink: 0,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  studentCity: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  valueContainer: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  value: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  currentUserValue: {
    color: colors.primary,
  },
  valueLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  seasonBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primaryLight + '20',
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  seasonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  seasonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonInfo: {
    flex: 1,
  },
  seasonName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  seasonDescription: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  seasonBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  seasonBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.white,
  },
});
