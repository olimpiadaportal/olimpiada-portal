'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { walletService } from '@/services/walletService';
import { subscriptionService } from '@/services/subscriptionService';
import { Wallet, Transaction, SubscriptionTier, UserSubscription } from '@/types/payment';
import { CreditCard, TrendingDown, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  booking_payment:     { label: 'Booking',      color: 'bg-blue-100 text-blue-700' },
  refund:              { label: 'Refund',        color: 'bg-green-100 text-green-700' },
  subscription_charge: { label: 'Subscription', color: 'bg-purple-100 text-purple-700' },
  top_up:              { label: 'Top-up',        color: 'bg-teal-100 text-teal-700' },
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed:  <CheckCircle className="w-4 h-4 text-green-500" />,
  pending:    <Clock className="w-4 h-4 text-yellow-500" />,
  failed:     <XCircle className="w-4 h-4 text-red-500" />,
  refunded:   <RefreshCw className="w-4 h-4 text-gray-400" />,
  processing: <Clock className="w-4 h-4 text-blue-500" />,
};

export default function StudentPaymentsPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [w, txs, sub, tierList] = await Promise.all([
        walletService.getWallet(user.id),
        walletService.getSpending(user.id, 50),
        subscriptionService.getUserSubscription(user.id),
        subscriptionService.getTiers(),
      ]);

      setWallet(w);
      setTransactions(txs);
      setSubscription(sub);
      setTiers(tierList);
    } catch (err) {
      console.error('Load payments error:', err);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (amount: number, currency = 'EUR') =>
    new Intl.NumberFormat('en-EU', { style: 'currency', currency }).format(amount);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const currentTierName = subscription?.tier?.name ?? 'free';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments & Subscription</h1>
        <p className="text-sm text-gray-500 mt-1">Your spending history and subscription plan</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-gray-500">Total Spent</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {fmt(wallet?.total_spent ?? 0, wallet?.currency ?? 'EUR')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-purple-500" />
            <p className="text-xs text-gray-500">Current Plan</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 capitalize">{currentTierName}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-green-500" />
            <p className="text-xs text-gray-500">Transactions</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{transactions.length}</p>
        </div>
      </div>

      {/* Subscription Plans */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Subscription Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tiers.map((tier) => {
            const isCurrent = tier.name === currentTierName;
            return (
              <div
                key={tier.id}
                className={`rounded-xl border-2 p-4 transition-all ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-900">{tier.display_name}</p>
                  {isCurrent && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xl font-bold text-gray-900">
                  {tier.price_monthly === 0 ? 'Free' : `€${tier.price_monthly}/mo`}
                </p>
                <ul className="mt-3 space-y-1.5 text-xs text-gray-600">
                  <li>
                    {tier.max_bookings_per_month === null
                      ? '✓ Unlimited bookings'
                      : `✓ ${tier.max_bookings_per_month} bookings/month`}
                  </li>
                  <li>
                    {tier.ai_explanations_limit === null
                      ? '✓ Unlimited AI explanations'
                      : `✓ ${tier.ai_explanations_limit} AI explanations/month`}
                  </li>
                  {tier.has_score_prediction && <li>✓ Score prediction</li>}
                  {tier.has_priority_matching && <li>✓ Priority teacher matching</li>}
                  {tier.has_advanced_analytics && <li>✓ Advanced analytics</li>}
                </ul>
                {!isCurrent && tier.price_monthly > 0 && (
                  <button
                    disabled
                    className="mt-3 w-full py-1.5 text-xs bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed"
                    title="Subscription billing coming soon"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Subscription billing will be activated in a future update. All features are currently available for free.
        </p>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Payment History</h2>
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No payments yet. Teacher bookings are currently free.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {transactions.map((tx) => {
              const typeInfo = TYPE_LABELS[tx.type] ?? { label: tx.type, color: 'bg-gray-100 text-gray-600' };
              return (
                <div key={tx.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      {STATUS_ICONS[tx.status] ?? <Clock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <p className="text-sm text-gray-700 truncate">{tx.description || '—'}</p>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(tx.created_at)}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-semibold text-gray-900">
                    -{fmt(tx.amount, tx.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
