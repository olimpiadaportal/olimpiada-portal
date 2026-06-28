import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { walletService } from '../../services/walletService';
import { supabase } from '../../services/supabase';
import { Wallet, Transaction } from '../../types/payment';
import { colors as staticColors, typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

type WalletScreenNavigationProp = StackNavigationProp<any, 'Wallet'>;

interface Props {
  navigation: WalletScreenNavigationProp;
}

const TYPE_ICON: Record<string, { icon: string; color: string }> = {
  booking_payment:     { icon: 'card',           color: '#3B82F6' },
  teacher_earning:     { icon: 'trending-up',    color: '#10B981' },
  platform_commission: { icon: 'business',       color: '#8B5CF6' },
  refund:              { icon: 'return-down-back', color: '#EF4444' },
  withdrawal:          { icon: 'arrow-up-circle', color: '#F59E0B' },
  subscription_charge: { icon: 'repeat',         color: '#6366F1' },
  top_up:              { icon: 'add-circle',      color: '#14B8A6' },
};

type LedgerGroup = {
  kind: 'group';
  key: string;
  source: 'booking' | 'subscription';
  payment: Transaction;
  earning?: Transaction;
  commission?: Transaction;
};

type LedgerItem = LedgerGroup | { kind: 'standalone'; tx: Transaction };

export const WalletScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [bankDetails, setBankDetails] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedLedgerKey, setSelectedLedgerKey] = useState<string | null>(null);

  // Group transactions: each unique booking_id with booking_payment becomes one grouped entry.
  // teacher_earning and platform_commission for that booking are sub-items shown in a modal.
  const groupedTransactions = useMemo(() => {
    const bookingMap = new Map<string, { payment: Transaction; earning?: Transaction; commission?: Transaction }>();
    const subscriptionMap = new Map<string, { payment?: Transaction; earning?: Transaction; commission?: Transaction }>();
    const standalone: Transaction[] = [];

    for (const tx of transactions) {
      const subscriptionId = tx.metadata?.teacher_subscription_id;
      if (
        subscriptionId
        && ['subscription_charge', 'teacher_earning', 'platform_commission'].includes(tx.type)
      ) {
        const entry = subscriptionMap.get(subscriptionId) ?? {};
        if (tx.type === 'subscription_charge') entry.payment = tx;
        else if (tx.type === 'teacher_earning') entry.earning = tx;
        else if (tx.type === 'platform_commission') entry.commission = tx;
        subscriptionMap.set(subscriptionId, entry);
        continue;
      }

      const bid = tx.booking_id;
      if (bid && (tx.type === 'booking_payment' || tx.type === 'teacher_earning' || tx.type === 'platform_commission')) {
        const entry: {
          payment?: Transaction;
          earning?: Transaction;
          commission?: Transaction;
        } = bookingMap.get(bid) ?? {};
        if (tx.type === 'booking_payment') entry.payment = tx;
        else if (tx.type === 'teacher_earning') entry.earning = tx;
        else if (tx.type === 'platform_commission') entry.commission = tx;
        bookingMap.set(bid, entry as any);
      } else {
        standalone.push(tx);
      }
    }

    // Build final ordered list: booking groups (only those with a payment row) + standalone
    const bookingGroups: { bookingId: string; payment: Transaction; earning?: Transaction; commission?: Transaction }[] = [];
    bookingMap.forEach((entry, bookingId) => {
      if (entry.payment) {
        bookingGroups.push({ bookingId, ...entry } as any);
      } else {
        // No payment row — fall through as standalone
        if (entry.earning) standalone.push(entry.earning);
        if (entry.commission) standalone.push(entry.commission);
      }
    });
    subscriptionMap.forEach((entry, subscriptionId) => {
      if (entry.payment) {
        bookingGroups.push({
          bookingId: `subscription:${subscriptionId}`,
          payment: entry.payment,
          earning: entry.earning,
          commission: entry.commission,
        });
      } else {
        if (entry.earning) standalone.push(entry.earning);
        if (entry.commission) standalone.push(entry.commission);
      }
    });

    // Sort booking groups by payment date desc, interleave with standalone by date
    const allItems: ({ kind: 'group'; bookingId: string; payment: Transaction; earning?: Transaction; commission?: Transaction } | { kind: 'standalone'; tx: Transaction })[] = [
      ...bookingGroups.map(g => ({ kind: 'group' as const, ...g })),
      ...standalone.map(tx => ({ kind: 'standalone' as const, tx })),
    ];
    allItems.sort((a, b) => {
      const da = a.kind === 'group' ? a.payment.created_at : a.tx.created_at;
      const db = b.kind === 'group' ? b.payment.created_at : b.tx.created_at;
      return new Date(db).getTime() - new Date(da).getTime();
    });
    return allItems;
  }, [transactions]);

  const selectedGroup = useMemo(() => {
    if (!selectedLedgerKey) return null;
    const found = groupedTransactions.find(item => item.kind === 'group' && item.bookingId === selectedLedgerKey);
    return found?.kind === 'group' ? found : null;
  }, [selectedLedgerKey, groupedTransactions]);

  const load = useCallback(async (isRefreshing = false) => {
    if (!user?.id) return;
    try {
      if (isRefreshing) setRefreshing(true);
      else setLoading(true);

      const [walletData, txData] = await Promise.all([
        walletService.getWallet(user.id),
        walletService.getTransactions(user.id, 30),
      ]);
      setWallet(walletData);
      setTransactions(txData);
    } catch (e) {
      console.error('WalletScreen load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handlePayoutRequest = async () => {
    if (!user?.id || !wallet) return;
    const amount = parseFloat(payoutAmount);
    if (!bankDetails.trim()) {
      Alert.alert('', t('wallet.bankDetails'));
      return;
    }
    if (isNaN(amount) || amount <= 0 || amount > wallet.balance) {
      Alert.alert('', t('wallet.insufficientBalance'));
      return;
    }
    try {
      setSubmitting(true);
      // Resolve teacher record ID from auth user ID
      const { data: teacherRow, error: teacherErr } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (teacherErr || !teacherRow) throw new Error('Teacher record not found');
      await walletService.createPayoutRequest(teacherRow.id, {
        amount,
        bank_details_ref: bankDetails.trim(),
      });
      Alert.alert('', t('wallet.payoutSuccess'));
      setShowPayoutForm(false);
      setBankDetails('');
      setPayoutAmount('');
      load();
    } catch (e: any) {
      Alert.alert('', e.message || t('wallet.payoutError'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>{t('wallet.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{t('wallet.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={28} color="#FFFFFF" />
            <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyBadgeText}>{wallet?.currency ?? 'AZN'}</Text>
            </View>
          </View>
          <Text style={styles.balanceAmount}>
            {walletService.formatNumber(wallet?.balance ?? 0)}
          </Text>
          <View style={styles.balanceStats}>
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>{t('wallet.totalEarned')}</Text>
              <Text style={styles.balanceStatValue}>
                {walletService.formatNumber(wallet?.total_earned ?? 0)}
              </Text>
            </View>
            <View style={styles.balanceStatDivider} />
            <View style={styles.balanceStat}>
              <Text style={styles.balanceStatLabel}>{t('wallet.withdrawn')}</Text>
              <Text style={styles.balanceStatValue}>
                {walletService.formatNumber(wallet?.total_withdrawn ?? 0)}
              </Text>
            </View>
          </View>

          {/* Payout button */}
          <TouchableOpacity
            style={[styles.payoutBtn, (wallet?.balance ?? 0) <= 0 && styles.payoutBtnDisabled]}
            onPress={() => setShowPayoutForm(!showPayoutForm)}
            disabled={(wallet?.balance ?? 0) <= 0}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.payoutBtnText}>{t('wallet.payoutRequest')}</Text>
          </TouchableOpacity>
        </View>

        {/* Payout form */}
        {showPayoutForm && (
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('wallet.payoutRequest')}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('wallet.payoutMinimum', { amount: '50' })}
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={t('wallet.bankDetailsPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={bankDetails}
              onChangeText={setBankDetails}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder={`${t('wallet.balance')} (max ${walletService.formatAmount(wallet?.balance ?? 0, wallet?.currency ?? 'EUR')})`}
              placeholderTextColor={colors.textSecondary}
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handlePayoutRequest}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.submitBtnText}>{t('wallet.payoutRequest')}</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Transaction history */}
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('wallet.transactionHistory')}</Text>

          {groupedTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('wallet.noTransactions')}</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('wallet.noTransactionsDesc')}</Text>
            </View>
          ) : (
            groupedTransactions.map((item) => {
              if (item.kind === 'group') {
                const tx = item.payment;
                const paymentType = tx.type === 'subscription_charge'
                  ? 'subscription_charge'
                  : 'booking_payment';
                const typeInfo = TYPE_ICON[paymentType];
                return (
                  <TouchableOpacity
                    key={item.bookingId}
                    style={[styles.txRow, { borderBottomColor: colors.border }]}
                    onPress={() => setSelectedLedgerKey(item.bookingId)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.txIcon, { backgroundColor: typeInfo.color + '20' }]}>
                      <Ionicons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={[styles.txType, { color: colors.text }]}>
                        {t(`wallet.transactionType.${paymentType}`)}
                      </Text>
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {formatDate(tx.created_at)}
                      </Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, { color: colors.text }]}>
                        {walletService.formatAmount(tx.amount, tx.currency)}
                      </Text>
                      <View style={styles.txDetailHint}>
                        <Text style={[styles.txStatus, { color: colors.textSecondary }]}>
                          {t(`wallet.transactionStatus.${tx.status}`, { defaultValue: tx.status })}
                        </Text>
                        <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              } else {
                const tx = item.tx;
                const typeInfo = TYPE_ICON[tx.type] ?? { icon: 'ellipse-outline', color: colors.textSecondary };
                const isCredit = tx.type === 'teacher_earning' || tx.type === 'top_up';
                return (
                  <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.txIcon, { backgroundColor: typeInfo.color + '20' }]}>
                      <Ionicons name={typeInfo.icon as any} size={20} color={typeInfo.color} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={[styles.txType, { color: colors.text }]}>
                        {t(`wallet.transactionType.${tx.type}`, { defaultValue: tx.type })}
                      </Text>
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {formatDate(tx.created_at)}
                      </Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmount, { color: isCredit ? '#10B981' : colors.text }]}>
                        {isCredit ? '+' : ''}{walletService.formatAmount(tx.amount, tx.currency)}
                      </Text>
                      <Text style={[styles.txStatus, { color: colors.textSecondary }]}>
                        {t(`wallet.transactionStatus.${tx.status}`, { defaultValue: tx.status })}
                      </Text>
                    </View>
                  </View>
                );
              }
            })
          )}
        </View>

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>

      {/* Booking detail modal */}
      <Modal
        visible={!!selectedLedgerKey}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedLedgerKey(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedLedgerKey(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            {/* Handle */}
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t(`wallet.transactionType.${
                selectedGroup?.payment.type === 'subscription_charge'
                  ? 'subscription_charge'
                  : 'booking_payment'
              }`)}
            </Text>
            {selectedGroup && (
              <>
                <Text style={[styles.modalDate, { color: colors.textSecondary }]}>
                  {formatDate(selectedGroup.payment.created_at)}
                </Text>

                {/* Divider */}
                <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />

                {/* Gross payment row */}
                <View style={styles.modalRow}>
                  <View style={styles.modalRowLeft}>
                    <View style={[
                      styles.modalRowIcon,
                      {
                        backgroundColor: TYPE_ICON[
                          selectedGroup.payment.type === 'subscription_charge'
                            ? 'subscription_charge'
                            : 'booking_payment'
                        ].color + '20',
                      },
                    ]}>
                      <Ionicons
                        name={TYPE_ICON[
                          selectedGroup.payment.type === 'subscription_charge'
                            ? 'subscription_charge'
                            : 'booking_payment'
                        ].icon as any}
                        size={18}
                        color={TYPE_ICON[
                          selectedGroup.payment.type === 'subscription_charge'
                            ? 'subscription_charge'
                            : 'booking_payment'
                        ].color}
                      />
                    </View>
                    <Text style={[styles.modalRowLabel, { color: colors.text }]}>
                      {t(`wallet.transactionType.${
                        selectedGroup.payment.type === 'subscription_charge'
                          ? 'subscription_charge'
                          : 'booking_payment'
                      }`)}
                    </Text>
                  </View>
                  <Text style={[styles.modalRowAmount, { color: colors.text }]}>
                    {walletService.formatAmount(selectedGroup.payment.amount, selectedGroup.payment.currency)}
                  </Text>
                </View>

                <View style={[styles.modalSubDivider, { backgroundColor: colors.border }]} />

                {/* Session earning */}
                {selectedGroup.earning && (
                  <View style={styles.modalRow}>
                    <View style={styles.modalRowLeft}>
                      <View style={[styles.modalRowIcon, { backgroundColor: TYPE_ICON['teacher_earning'].color + '20' }]}>
                        <Ionicons name={TYPE_ICON['teacher_earning'].icon as any} size={18} color={TYPE_ICON['teacher_earning'].color} />
                      </View>
                      <Text style={[styles.modalRowLabel, { color: colors.text }]}>
                        {t('wallet.transactionType.teacher_earning')}
                      </Text>
                    </View>
                    <Text style={[styles.modalRowAmount, { color: '#10B981' }]}>
                      +{walletService.formatAmount(selectedGroup.earning.amount, selectedGroup.earning.currency)}
                    </Text>
                  </View>
                )}

                {/* Platform fee */}
                {selectedGroup.commission && (
                  <View style={styles.modalRow}>
                    <View style={styles.modalRowLeft}>
                      <View style={[styles.modalRowIcon, { backgroundColor: TYPE_ICON['platform_commission'].color + '20' }]}>
                        <Ionicons name={TYPE_ICON['platform_commission'].icon as any} size={18} color={TYPE_ICON['platform_commission'].color} />
                      </View>
                      <Text style={[styles.modalRowLabel, { color: colors.text }]}>
                        {t('wallet.transactionType.platform_commission')}
                      </Text>
                    </View>
                    <Text style={[styles.modalRowAmount, { color: colors.text }]}>
                      {walletService.formatAmount(selectedGroup.commission.amount, selectedGroup.commission.currency)}
                    </Text>
                  </View>
                )}

                {/* Status badge */}
                <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />
                <View style={styles.modalStatusRow}>
                  <Text style={[styles.modalStatusLabel, { color: colors.textSecondary }]}>
                    {t('wallet.transactionHistory')}
                  </Text>
                  <View style={[styles.modalBadge, { backgroundColor: '#10B98120' }]}>
                    <Text style={[styles.modalBadgeText, { color: '#10B981' }]}>
                      {t(`wallet.transactionStatus.${selectedGroup.payment.status}`, { defaultValue: selectedGroup.payment.status })}
                    </Text>
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSelectedLedgerKey(null)}
            >
              <Text style={styles.modalCloseBtnText}>{t('common.close', 'Close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  navTitle: { fontSize: typography.fontSizes.xl, fontWeight: '700', color: colors.text },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  balanceCard: {
    backgroundColor: '#059669',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  balanceLabel: { fontSize: typography.fontSizes.sm, color: '#D1FAE5', fontWeight: '500' },
  currencyBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: borderRadius.sm,
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  currencyBadgeText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.xs,
    fontWeight: '700',
  },
  balanceAmount: { fontSize: 36, fontWeight: '800', color: '#FFFFFF', marginBottom: spacing.lg },
  balanceStats: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceStatLabel: { fontSize: typography.fontSizes.xs, color: '#D1FAE5', marginBottom: spacing.xs },
  balanceStatValue: { fontSize: typography.fontSizes.md, fontWeight: '700', color: '#FFFFFF' },
  balanceStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.3)' },
  payoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  payoutBtnDisabled: { opacity: 0.4 },
  payoutBtnText: { fontSize: typography.fontSizes.sm, fontWeight: '600', color: '#FFFFFF' },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  sectionTitle: { fontSize: typography.fontSizes.lg, fontWeight: '700', marginBottom: spacing.md },
  hint: { fontSize: typography.fontSizes.xs, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.md,
    marginBottom: spacing.sm,
  },
  submitBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnText: { fontSize: typography.fontSizes.md, fontWeight: '700', color: '#FFFFFF' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { fontSize: typography.fontSizes.md, fontWeight: '600', marginTop: spacing.md },
  emptyDesc: { fontSize: typography.fontSizes.sm, textAlign: 'center', marginTop: spacing.xs },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  txInfo: { flex: 1 },
  txType: { fontSize: typography.fontSizes.sm, fontWeight: '600', marginBottom: 2 },
  txDate: { fontSize: typography.fontSizes.xs },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: typography.fontSizes.md, fontWeight: '700' },
  txStatus: { fontSize: typography.fontSizes.xs, marginTop: 2 },
  txDetailHint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  modalDate: {
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.md,
  },
  modalDivider: { height: 1, marginVertical: spacing.md },
  modalSubDivider: { height: 1, marginLeft: 46, marginBottom: spacing.xs },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  modalRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  modalRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  modalRowLabel: { fontSize: typography.fontSizes.sm, fontWeight: '500', flex: 1 },
  modalRowAmount: { fontSize: typography.fontSizes.md, fontWeight: '700' },
  modalStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalStatusLabel: { fontSize: typography.fontSizes.sm },
  modalBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm },
  modalBadgeText: { fontSize: typography.fontSizes.xs, fontWeight: '600' },
  modalCloseBtn: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: typography.fontSizes.md, fontWeight: '700', color: '#FFFFFF' },
});
