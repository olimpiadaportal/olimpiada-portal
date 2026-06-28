'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { walletService } from '@/services/walletService';
import { Wallet, Transaction, PayoutRequest } from '@/types/payment';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  TrendingUp, Wallet as WalletIcon, Clock, CheckCircle,
  XCircle, RefreshCw, ArrowUpRight, ArrowLeft, X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ProfileDrawer } from '@/components/shared/ProfileDrawer';

export default function TeacherEarningsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [earnings, setEarnings] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState(false);
  const [selectedEarning, setSelectedEarning] = useState<Transaction | null>(null);
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: teacher } = await db
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!teacher) return;
      setTeacherId(teacher.id);

      const [w, txs, pr] = await Promise.all([
        walletService.getWallet(user.id),
        walletService.getEarnings(user.id, 50),
        walletService.getPayoutRequests(teacher.id),
      ]);

      setWallet(w);
      setEarnings(txs);
      setPayouts(pr);
    } catch (err) {
      console.error('Load earnings error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePayoutRequest() {
    if (!teacherId) return;
    setSubmitting(true);
    setPayoutError(null);
    try {
      await walletService.createPayoutRequest(teacherId, {
        amount: parseFloat(payoutAmount),
        bank_details_ref: bankRef,
      });
      setPayoutSuccess(true);
      setShowPayoutForm(false);
      setPayoutAmount('');
      setBankRef('');
      await loadData();
    } catch (err: unknown) {
      setPayoutError(err instanceof Error ? err.message : t('teacher.earnings.payoutSubmitted'));
    } finally {
      setSubmitting(false);
    }
  }

  const fmt = (amount: number, currency = 'AZN') =>
    new Intl.NumberFormat(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      style: 'currency',
      currency,
    }).format(amount);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const PAYOUT_STATUS: Record<string, { label: string; badgeClass: string; icon: React.ReactNode }> = {
    pending:    { label: t('teacher.earnings.payoutStatus.pending'),    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', icon: <Clock className="w-3 h-3" /> },
    approved:   { label: t('teacher.earnings.payoutStatus.approved'),   badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',       icon: <CheckCircle className="w-3 h-3" /> },
    processing: { label: t('teacher.earnings.payoutStatus.processing'), badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400', icon: <RefreshCw className="w-3 h-3" /> },
    completed:  { label: t('teacher.earnings.payoutStatus.completed'),  badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',    icon: <CheckCircle className="w-3 h-3" /> },
    rejected:   { label: t('teacher.earnings.payoutStatus.rejected'),   badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',            icon: <XCircle className="w-3 h-3" /> },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/teacher/dashboard')}
              className="text-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('teacher.earnings.title')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('teacher.earnings.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter userId={userId} />
            <ProfileDrawer userType="teacher" />
          </div>
        </div>

        {/* Success Banner */}
        {payoutSuccess && (
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5 shrink-0" />
            {t('teacher.earnings.payoutSubmitted')}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: t('teacher.earnings.availableBalance'),
              value: fmt(wallet?.balance ?? 0, wallet?.currency),
              icon: <WalletIcon className="w-5 h-5 text-blue-500" />,
              highlight: true,
            },
            {
              label: t('teacher.earnings.totalEarned'),
              value: fmt(wallet?.total_earned ?? 0, wallet?.currency),
              icon: <TrendingUp className="w-5 h-5 text-green-500" />,
              highlight: false,
            },
            {
              label: t('teacher.earnings.totalWithdrawn'),
              value: fmt(wallet?.total_withdrawn ?? 0, wallet?.currency),
              icon: <ArrowUpRight className="w-5 h-5 text-purple-500" />,
              highlight: false,
            },
            {
              label: t('teacher.earnings.earningsRecords'),
              value: String(earnings.length),
              icon: <Clock className="w-5 h-5 text-gray-400" />,
              highlight: false,
            },
          ].map((s) => (
            <Card
              key={s.label}
              className={`p-4 ${s.highlight
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {s.icon}
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{s.label}</p>
              </div>
              <p className={`text-xl font-bold ${s.highlight ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                {s.value}
              </p>
            </Card>
          ))}
        </div>

        {/* Request Payout Button */}
        {(wallet?.balance ?? 0) > 0 && !showPayoutForm && (
          <div className="flex justify-end">
            <Button
              onClick={() => { setShowPayoutForm(true); setPayoutSuccess(false); setPayoutError(null); }}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              <ArrowUpRight className="w-4 h-4" />
              {t('teacher.earnings.requestPayout')}
            </Button>
          </div>
        )}

        {/* Payout Request Form */}
        {showPayoutForm && (
          <Card className="p-5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              {t('teacher.earnings.formTitle')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('teacher.earnings.amountLabel')}{' '}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    — {t('teacher.earnings.available')}: {fmt(wallet?.balance ?? 0, wallet?.currency)}
                  </span>
                </label>
                <input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="e.g. 100"
                  min="1"
                  max={wallet?.balance ?? 0}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('teacher.earnings.bankRefLabel')}{' '}
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                    ({t('teacher.earnings.bankRefHint')})
                  </span>
                </label>
                <input
                  type="text"
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder={t('teacher.earnings.bankRefPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {t('teacher.earnings.bankRefNote')}
                </p>
              </div>
              {payoutError && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {payoutError}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPayoutForm(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handlePayoutRequest}
                  disabled={!payoutAmount || !bankRef || submitting}
                >
                  {submitting ? t('teacher.earnings.submitting') : t('teacher.earnings.submitRequest')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Payout History */}
        {payouts.length > 0 && (
          <Card className="p-5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              {t('teacher.earnings.payoutHistory')}
            </h2>
            <div className="space-y-3">
              {payouts.map((p) => {
                const s = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.pending;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 ${s.badgeClass}`}>
                          {s.icon}
                          {s.label}
                        </Badge>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(p.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[200px] sm:max-w-[280px]">
                        {p.bank_details_ref}
                      </p>
                      {p.rejection_reason && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                          {t('teacher.earnings.reason')}: {p.rejection_reason}
                        </p>
                      )}
                    </div>
                    <p className="font-bold text-gray-900 dark:text-white ml-4 shrink-0">
                      {fmt(p.amount, p.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Earnings History */}
        <Card className="p-5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.earnings.earningsHistory')}
          </h2>
          {earnings.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('teacher.earnings.noEarnings')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {earnings.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => setSelectedEarning(tx)}
                  className="w-full flex items-center justify-between py-3 gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {tx.description || t('teacher.earnings.bookingEarning')}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmtDate(tx.created_at)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-green-600 dark:text-green-400">
                      +{fmt(tx.amount, tx.currency)}
                    </p>
                    {tx.commission_amount && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        -{fmt(tx.commission_amount, tx.currency)} {t('teacher.earnings.commission')}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Earning Detail Modal */}
      <Dialog open={!!selectedEarning} onOpenChange={(open) => !open && setSelectedEarning(null)}>
        <DialogContent className="sm:max-w-[420px] bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              {selectedEarning?.description || t('teacher.earnings.bookingEarning')}
            </DialogTitle>
          </DialogHeader>
          {selectedEarning && (
            <div className="space-y-4 pt-2">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  +{fmt(selectedEarning.amount, selectedEarning.currency)}
                </p>
                {selectedEarning.commission_amount && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    -{fmt(selectedEarning.commission_amount, selectedEarning.currency)} {t('teacher.earnings.commission')}
                  </p>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">{t('common.status')}</span>
                  <Badge className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 text-xs">
                    {selectedEarning.type}
                  </Badge>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">{t('common.booking')}</span>
                  <span className="text-gray-900 dark:text-white font-mono text-xs">
                    {selectedEarning.booking_id?.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500 dark:text-gray-400">{t('teacher.bookings.date')}</span>
                  <span className="text-gray-900 dark:text-white">
                    {fmtDate(selectedEarning.created_at)}
                  </span>
                </div>
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => setSelectedEarning(null)}
              >
                {t('common.close')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
