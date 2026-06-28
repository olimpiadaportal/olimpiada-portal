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
import { useTheme } from '../../contexts/ThemeContext';
import type { RootStackParamList } from '../../types';
import {
  StudentTeacherSubscription,
  TeacherSubscriptionPayment,
  teacherSubscriptionService,
} from '../../services/teacherSubscriptionService';
import { useAlert } from '../../components/AlertProvider';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { StatusBadge } from '../../components/ui';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';

type Props = StackScreenProps<RootStackParamList, 'MySubscriptions'>;

const activeStatuses = new Set(['active', 'trialing']);
const paymentStatuses = new Set(['incomplete', 'past_due', 'unpaid']);

export const MySubscriptionsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors, shadows } = useTheme();
  const { showConfirm, showError, showSuccess } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [subscriptions, setSubscriptions] = useState<StudentTeacherSubscription[]>([]);
  const [payments, setPayments] = useState<TeacherSubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'plans' | 'payments'>('plans');
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (showLoader = false) => {
    try {
      if (showLoader || !hasLoadedRef.current) setLoading(true);
      let subscriptionRows = await teacherSubscriptionService.getMySubscriptions();

      const missingPeriod = subscriptionRows.filter(
        item => activeStatuses.has(item.status) && !item.current_period_end
      );
      if (missingPeriod.length > 0) {
        await Promise.allSettled(
          missingPeriod.map(item => teacherSubscriptionService.reconcile(item.teacher_id))
        );
        subscriptionRows = await teacherSubscriptionService.getMySubscriptions();
      }

      const paymentRows = await teacherSubscriptionService.getMyPayments();
      setSubscriptions(subscriptionRows);
      setPayments(paymentRows);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Load my teacher subscriptions error:', error);
      showError(t('common.error'), t('teacherSubscriptions.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showError, t]);

  useEffect(() => {
    void load(true);
    const unsubscribe = navigation.addListener('focus', () => {
      if (hasLoadedRef.current) void load(false);
    });
    return unsubscribe;
  }, [load, navigation]);

  const openTeacher = (teacherId: string) => {
    navigation.navigate('SubscriptionTeacherProfile', { teacherId });
  };

  const cancelRenewal = (item: StudentTeacherSubscription) => {
    if (actingId) return;
    showConfirm(
      t('teachers.profile.subscription.cancelTitle'),
      t('teachers.profile.subscription.cancelMessage'),
      async () => {
        setActingId(item.subscription_id);
        try {
          await teacherSubscriptionService.cancelAtPeriodEnd(item.teacher_id);
          await load(false);
          showSuccess(t('common.success'), t('teachers.profile.subscription.cancelScheduled'));
        } catch {
          showError(t('common.error'), t('teachers.profile.subscription.cancelFailed'));
        } finally {
          setActingId(null);
        }
      }
    );
  };

  const resumeRenewal = async (item: StudentTeacherSubscription) => {
    if (actingId) return;
    setActingId(item.subscription_id);
    try {
      await teacherSubscriptionService.resumeRenewal(item.teacher_id);
      await load(false);
      showSuccess(t('common.success'), t('teachers.profile.subscription.resumeSuccess'));
    } catch {
      showError(t('common.error'), t('teachers.profile.subscription.resumeFailed'));
    } finally {
      setActingId(null);
    }
  };

  const abandonUnpaid = (item: StudentTeacherSubscription) => {
    if (actingId) return;
    showConfirm(
      t('teacherSubscriptions.removeUnpaidTitle'),
      t('teacherSubscriptions.removeUnpaidMessage'),
      async () => {
        setActingId(item.subscription_id);
        try {
          await teacherSubscriptionService.abandonUnpaid(item.subscription_id);
          await load(false);
          showSuccess(t('common.success'), t('teacherSubscriptions.removeUnpaidSuccess'));
        } catch {
          showError(t('common.error'), t('teacherSubscriptions.removeUnpaidFailed'));
        } finally {
          setActingId(null);
        }
      }
    );
  };

  const statusVariant = (status: string) => {
    if (activeStatuses.has(status)) return 'success' as const;
    if (paymentStatuses.has(status)) return 'warning' as const;
    if (status === 'cancelled' || status === 'incomplete_expired') return 'error' as const;
    return 'neutral' as const;
  };
  const visiblePlans = subscriptions.filter(item => !(
    ['cancelled', 'incomplete_expired'].includes(item.status)
    && !item.last_payment_at
  ));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title={t('teacherSubscriptions.studentTitle')} onBack={() => navigation.goBack()} />
        <View style={styles.loadingContent}>
          {[1, 2].map(item => (
            <LoadingSkeleton key={item} width="100%" height={220} borderRadius={borderRadius.lg} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title={t('teacherSubscriptions.studentTitle')} onBack={() => navigation.goBack()} />
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
        <Text style={styles.intro}>{t('teacherSubscriptions.studentIntro')}</Text>

        <View style={styles.segmentedControl}>
          {(['plans', 'payments'] as const).map(view => (
            <TouchableOpacity
              key={view}
              style={[
                styles.segmentButton,
                selectedView === view && styles.segmentButtonActive,
              ]}
              onPress={() => setSelectedView(view)}
            >
              <Text
                style={[
                  styles.segmentText,
                  selectedView === view && styles.segmentTextActive,
                ]}
              >
                {t(`teacherSubscriptions.tabs.${view}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedView === 'plans' && visiblePlans.length === 0 ? (
          <View style={[styles.emptyCard, shadows.sm]}>
            <Ionicons name="repeat-outline" size={36} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('teacherSubscriptions.emptyStudent')}</Text>
            <Text style={styles.emptyMessage}>{t('teacherSubscriptions.emptyStudentDesc')}</Text>
          </View>
        ) : selectedView === 'plans' ? (
          [...visiblePlans]
            .sort((a, b) => {
              const rank = (item: StudentTeacherSubscription) => {
                if (paymentStatuses.has(item.status)) return 0;
                if (activeStatuses.has(item.status)) return 1;
                return 2;
              };
              return rank(a) - rank(b);
            })
            .map(item => {
            const isActive = activeStatuses.has(item.status);
            const paymentRequired = paymentStatuses.has(item.status);
            const periodDate = item.current_period_end
              ? formatShortDate(item.current_period_end, t('common.locale'))
              : null;

            return (
              <View key={item.subscription_id} style={[styles.card, shadows.sm]}>
                <TouchableOpacity
                  style={styles.identityRow}
                  onPress={() => openTeacher(item.teacher_id)}
                  activeOpacity={0.82}
                >
                  <View style={styles.avatar}>
                    {item.teacher_avatar_url ? (
                      <Image source={{ uri: item.teacher_avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person" size={28} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.identityCopy}>
                    <Text style={styles.name} numberOfLines={2}>{item.teacher_name}</Text>
                    <Text style={styles.amount}>
                      {item.monthly_amount.toFixed(2)} {item.currency} / {t('teacherSubscriptions.month')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                </TouchableOpacity>

                <View style={styles.statusRow}>
                  <StatusBadge
                    label={t(`teachers.profile.subscription.status.${item.status}`)}
                    variant={statusVariant(item.status)}
                  />
                  {item.cancel_at_period_end ? (
                    <StatusBadge
                      label={t('teacherSubscriptions.renewalOff')}
                      variant="warning"
                    />
                  ) : null}
                </View>

                <Text style={styles.relationshipCopy}>
                  {t('teacherSubscriptions.relationshipDescription')}
                </Text>

                {periodDate ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.detailText}>
                      {item.cancel_at_period_end
                        ? t('teachers.profile.subscription.endsOn', { date: periodDate })
                        : t('teachers.profile.subscription.renewsOn', { date: periodDate })}
                    </Text>
                  </View>
                ) : null}

                {item.last_payment_at ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="card-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.detailText}>
                      {t('teacherSubscriptions.lastPayment', {
                        date: formatShortDate(item.last_payment_at, t('common.locale')),
                      })}
                    </Text>
                  </View>
                ) : null}

                {paymentRequired ? (
                  <View style={styles.actionStack}>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => openTeacher(item.teacher_id)}
                    >
                      <Text style={styles.primaryButtonText}>
                        {t('teachers.profile.subscription.completePayment')}
                      </Text>
                    </TouchableOpacity>
                    {!item.last_payment_at ? (
                      <TouchableOpacity
                        style={styles.removeButton}
                        disabled={actingId === item.subscription_id}
                        onPress={() => abandonUnpaid(item)}
                      >
                        <Text style={styles.removeButtonText}>
                          {t('teacherSubscriptions.removeUnpaidAction')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                {isActive && item.cancel_at_period_end ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    disabled={actingId === item.subscription_id}
                    onPress={() => void resumeRenewal(item)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {t('teachers.profile.subscription.resumeAction')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {isActive && !item.cancel_at_period_end ? (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    disabled={actingId === item.subscription_id}
                    onPress={() => cancelRenewal(item)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t('teachers.profile.subscription.cancelAction')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        ) : payments.length > 0 ? (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>
              {t('teacherSubscriptions.paymentHistory')}
            </Text>
            {payments.map(payment => (
              <View key={payment.id} style={[styles.paymentRow, shadows.sm]}>
                <View style={styles.paymentIcon}>
                  <Ionicons name="receipt-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.paymentCopy}>
                  <Text style={styles.paymentTitle}>
                    {payment.type === 'refund' ? '- ' : ''}
                    {payment.amount.toFixed(2)} {payment.currency}
                  </Text>
                  <Text style={styles.paymentDate}>
                    {[
                      subscriptions.find(
                        item => item.subscription_id === payment.subscriptionId
                      )?.teacher_name,
                      formatShortDate(
                        payment.completedAt || payment.createdAt,
                        t('common.locale')
                      ),
                    ].filter(Boolean).join(' - ')}
                  </Text>
                </View>
                <StatusBadge
                  label={
                    payment.type === 'refund'
                      ? t('teacherSubscriptions.paymentStatus.refunded')
                      : t(`teacherSubscriptions.paymentStatus.${payment.status}`)
                  }
                  variant={payment.type === 'refund' ? 'info' : payment.status === 'completed' ? 'success' : 'neutral'}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCard, shadows.sm]}>
            <Ionicons name="receipt-outline" size={36} color={colors.primary} />
            <Text style={styles.emptyTitle}>{t('teacherSubscriptions.noPayments')}</Text>
            <Text style={styles.emptyMessage}>{t('teacherSubscriptions.noPaymentsDesc')}</Text>
          </View>
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
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
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
  intro: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    lineHeight: 21,
  },
  segmentedControl: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentButtonActive: { backgroundColor: colors.card },
  segmentText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  segmentTextActive: { color: colors.primary },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  identityRow: { alignItems: 'center', flexDirection: 'row' },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
    width: 56,
  },
  avatarImage: { height: '100%', width: '100%' },
  identityCopy: { flex: 1 },
  name: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
  },
  amount: { color: colors.primary, fontSize: typography.fontSizes.sm, marginTop: 3 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  relationshipCopy: { color: colors.textSecondary, fontSize: typography.fontSizes.sm, lineHeight: 20 },
  detailRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  detailText: { color: colors.textSecondary, flex: 1, fontSize: typography.fontSizes.sm },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: typography.fontSizes.md, fontWeight: typography.fontWeights.bold },
  actionStack: { gap: spacing.xs },
  removeButton: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  removeButtonText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: { color: colors.error, fontSize: typography.fontSizes.md, fontWeight: typography.fontWeights.semibold },
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
  historySection: { gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold },
  paymentRow: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: spacing.md,
  },
  paymentIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    height: 40,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 40,
  },
  paymentCopy: { flex: 1 },
  paymentTitle: { color: colors.text, fontSize: typography.fontSizes.md, fontWeight: typography.fontWeights.semibold },
  paymentDate: { color: colors.textSecondary, fontSize: typography.fontSizes.xs, marginTop: 2 },
});
