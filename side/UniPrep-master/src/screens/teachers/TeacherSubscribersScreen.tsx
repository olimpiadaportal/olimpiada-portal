import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StackScreenProps } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import type { ActivityStackParamList } from '../../navigation/ActivityStack';
import { useTheme } from '../../contexts/ThemeContext';
import {
  TeacherSubscriber,
  teacherSubscriptionService,
} from '../../services/teacherSubscriptionService';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { MetricCard, StatusBadge } from '../../components/ui';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';

type Props = StackScreenProps<ActivityStackParamList, 'Subscribers'>;
const activeStatuses = new Set(['active', 'trialing']);

export const TeacherSubscribersScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [subscribers, setSubscribers] = useState<TeacherSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (showLoader = false) => {
    try {
      if (showLoader || !hasLoadedRef.current) setLoading(true);
      setSubscribers(await teacherSubscriptionService.getMySubscribers());
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Load teacher subscribers error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasLoadedRef.current) void load(false);
    });
    return unsubscribe;
  }, [load, navigation]);

  const currentCount = subscribers.filter(
    item => activeStatuses.has(item.status)
      && (!item.current_period_end || new Date(item.current_period_end) > new Date())
  ).length;
  const lifetimeCount = new Set(subscribers.map(item => item.student_id)).size;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={t('teacherSubscriptions.teacherTitle')} onBack={() => navigation.goBack()} />
        <View style={styles.loadingContent}>
          <View style={styles.metricRow}>
            <LoadingSkeleton width="48%" height={110} borderRadius={borderRadius.lg} />
            <LoadingSkeleton width="48%" height={110} borderRadius={borderRadius.lg} />
          </View>
          {[1, 2].map(item => (
            <LoadingSkeleton key={item} width="100%" height={160} borderRadius={borderRadius.lg} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title={t('teacherSubscriptions.teacherTitle')} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(false);
            }}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={styles.intro}>{t('teacherSubscriptions.teacherIntro')}</Text>
        <View style={styles.metricRow}>
          <MetricCard
            label={t('teachers.profile.currentStudents')}
            value={currentCount}
            icon="people-outline"
            accentColor={colors.success}
            labelLines={2}
            style={styles.metric}
          />
          <MetricCard
            label={t('teachers.profile.totalStudents')}
            value={lifetimeCount}
            icon="time-outline"
            accentColor={colors.primary}
            labelLines={2}
            style={styles.metric}
          />
        </View>

        {subscribers.length === 0 ? (
          <View style={[styles.emptyCard, shadows.sm]}>
            <Ionicons name="people-outline" size={36} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('teacherSubscriptions.emptyTeacher')}</Text>
            <Text style={styles.emptyMessage}>{t('teacherSubscriptions.emptyTeacherDesc')}</Text>
          </View>
        ) : (
          subscribers.map(item => {
            const periodDate = item.current_period_end
              ? formatShortDate(item.current_period_end, t('common.locale'))
              : null;
            const active = activeStatuses.has(item.status);
            return (
              <View key={item.subscription_id} style={[styles.card, shadows.sm]}>
                <View style={styles.identityRow}>
                  <View style={styles.avatar}>
                    {item.student_avatar_url ? (
                      <Image source={{ uri: item.student_avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person" size={28} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.identityCopy}>
                    <Text style={styles.name} numberOfLines={2}>{item.student_name}</Text>
                    <Text style={styles.amount}>
                      {item.monthly_amount.toFixed(2)} {item.currency} / {t('teacherSubscriptions.month')}
                    </Text>
                  </View>
                  <StatusBadge
                    label={t(`teachers.profile.subscription.status.${item.status}`)}
                    variant={active ? 'success' : item.status === 'cancelled' ? 'error' : 'warning'}
                  />
                </View>

                {periodDate ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.detailText}>
                      {item.cancel_at_period_end
                        ? t('teacherSubscriptions.studentAccessEnds', { date: periodDate })
                        : t('teacherSubscriptions.nextBilling', { date: periodDate })}
                    </Text>
                  </View>
                ) : null}

                {item.last_payment_at ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                    <Text style={styles.detailText}>
                      {t('teacherSubscriptions.lastPayment', {
                        date: formatShortDate(item.last_payment_at, t('common.locale')),
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Header = ({ title, onBack }: { title: string; onBack: () => void }) => {
  const { colors } = useTheme();
  return (
    <View style={[baseStyles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack} style={baseStyles.backButton}>
        <Ionicons name="arrow-back" size={25} color={colors.text} />
      </TouchableOpacity>
      <Text style={[baseStyles.headerTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={baseStyles.headerSpacer} />
    </View>
  );
};

const baseStyles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.md,
  },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
});

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  loadingContent: { gap: spacing.md, padding: spacing.md },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  intro: { color: colors.textSecondary, fontSize: typography.fontSizes.sm, lineHeight: 21 },
  metricRow: { flexDirection: 'row', gap: spacing.sm },
  metric: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.md,
  },
  identityRow: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    marginRight: spacing.sm,
    overflow: 'hidden',
    width: 52,
  },
  avatarImage: { height: '100%', width: '100%' },
  identityCopy: { flex: 1, marginRight: spacing.sm },
  name: { color: colors.text, fontSize: typography.fontSizes.md, fontWeight: typography.fontWeights.bold },
  amount: { color: colors.primary, fontSize: typography.fontSizes.sm, marginTop: 3 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  detailText: { color: colors.textSecondary, flex: 1, fontSize: typography.fontSizes.sm },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: { color: colors.text, fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold },
  emptyMessage: { color: colors.textSecondary, fontSize: typography.fontSizes.sm, lineHeight: 20, textAlign: 'center' },
});
