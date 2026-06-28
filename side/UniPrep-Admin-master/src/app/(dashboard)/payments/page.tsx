'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type TransactionType =
  | 'booking_payment' | 'teacher_earning' | 'platform_commission'
  | 'refund' | 'withdrawal' | 'subscription_charge' | 'top_up';

type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

interface Transaction {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  booking_id: string | null;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  external_payment_id: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  description: string | null;
  created_at: string;
  completed_at: string | null;
  idempotency_key: string | null;
  from_profile?: { full_name: string } | null;
  to_profile?: { full_name: string } | null;
}

interface PayoutRequest {
  id: string;
  teacher_id: string;
  amount: number;
  currency: string;
  bank_details_ref: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
  processed_by: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  teacher_profile?: { full_name: string; email: string } | null;
}

interface TeacherSubscription {
  id: string;
  status: string;
  monthly_amount: number;
  currency: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_payment_at: string | null;
  last_payment_failed_at: string | null;
  teacher_name: string;
  student_name: string;
}

const TYPE_LABELS: Record<TransactionType, { label: string; color: string }> = {
  booking_payment:     { label: 'Booking',    color: 'bg-blue-100 text-blue-700' },
  teacher_earning:     { label: 'Earning',    color: 'bg-green-100 text-green-700' },
  platform_commission: { label: 'Commission', color: 'bg-purple-100 text-purple-700' },
  refund:              { label: 'Refund',     color: 'bg-red-100 text-red-700' },
  withdrawal:          { label: 'Withdrawal', color: 'bg-orange-100 text-orange-700' },
  subscription_charge: { label: 'Subscription', color: 'bg-indigo-100 text-indigo-700' },
  top_up:              { label: 'Top-up',     color: 'bg-teal-100 text-teal-700' },
};

const STATUS_LABELS: Record<TransactionStatus, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700' },
  completed:  { label: 'Completed',  color: 'bg-green-100 text-green-700' },
  failed:     { label: 'Failed',     color: 'bg-red-100 text-red-700' },
  refunded:   { label: 'Refunded',   color: 'bg-gray-100 text-gray-600' },
};

const PAYOUT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: 'Approved',   color: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', color: 'bg-indigo-100 text-indigo-700' },
  completed:  { label: 'Completed',  color: 'bg-green-100 text-green-700' },
  rejected:   { label: 'Rejected',   color: 'bg-red-100 text-red-700' },
};

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<'transactions' | 'subscriptions' | 'payouts'>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<TeacherSubscription[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCommission: 0,
    pendingPayouts: 0,
    pendingPayoutCount: 0,
    activeSubscriptions: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      setTransactions((txData as Transaction[]) || []);

      const { data: subscriptionRaw } = await supabase
        .from('teacher_subscriptions')
        .select('*, teachers!teacher_id(user_id), students!student_id(user_id)')
        .order('created_at', { ascending: false })
        .limit(200);

      const subscriptionUserIds = [...new Set(
        (subscriptionRaw || []).flatMap((row: any) => [
          row.teachers?.user_id,
          row.students?.user_id,
        ]).filter(Boolean)
      )];
      let subscriptionProfileMap: Record<string, string> = {};
      if (subscriptionUserIds.length > 0) {
        const { data: subscriptionProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', subscriptionUserIds);
        subscriptionProfileMap = Object.fromEntries(
          (subscriptionProfiles || []).map((profile: any) => [profile.id, profile.full_name])
        );
      }
      const mappedSubscriptions = (subscriptionRaw || []).map((row: any) => ({
        ...row,
        monthly_amount: Number(row.monthly_amount || 0),
        teacher_name: subscriptionProfileMap[row.teachers?.user_id] || 'Unknown teacher',
        student_name: subscriptionProfileMap[row.students?.user_id] || 'Unknown student',
      })) as TeacherSubscription[];
      setSubscriptions(mappedSubscriptions);

      // Load payout requests — two-step to avoid ambiguous FK join errors
      const { data: payoutRaw } = await supabase
        .from('payout_requests')
        .select('*, teachers!teacher_id(user_id)')
        .order('created_at', { ascending: false });

      // Collect unique teacher user_ids and fetch their profiles
      const teacherUserIds = [...new Set(
        (payoutRaw || []).map((p: any) => p.teachers?.user_id).filter(Boolean)
      )];

      let profileMap: Record<string, { full_name: string; email: string }> = {};
      if (teacherUserIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', teacherUserIds);
        for (const prof of profileRows || []) {
          profileMap[(prof as any).id] = { full_name: (prof as any).full_name, email: (prof as any).email };
        }
      }

      const mappedPayouts: PayoutRequest[] = (payoutRaw || []).map((p: any) => ({
        ...p,
        teacher_profile: profileMap[p.teachers?.user_id] ?? null,
      }));
      setPayouts(mappedPayouts);

      // Compute stats
      const completed = (txData || []).filter((t: any) => t.status === 'completed');
      const totalRevenue = completed
        .filter((t: any) => ['booking_payment', 'subscription_charge'].includes(t.type))
        .reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalCommission = completed
        .filter((t: any) => t.type === 'platform_commission')
        .reduce((s: number, t: any) => s + Number(t.amount), 0);
      const pendingPayoutRows = mappedPayouts.filter((p) => p.status === 'pending');
      setStats({
        totalRevenue,
        totalCommission,
        pendingPayouts: pendingPayoutRows.reduce((s, p) => s + Number(p.amount), 0),
        pendingPayoutCount: pendingPayoutRows.length,
        activeSubscriptions: mappedSubscriptions.filter(
          row => ['active', 'trialing'].includes(row.status)
        ).length,
      });
    } catch (err) {
      console.error('Load payments error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (payoutId: string) => {
    setProcessingId(payoutId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('payout_requests')
        .update({
          status: 'approved',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payoutId);
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('payout_requests')
        .update({
          status: 'rejected',
          processed_by: user?.id,
          processed_at: new Date().toISOString(),
          rejection_reason: rejectModal.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rejectModal.id);
      setRejectModal(null);
      await loadData();
    } finally {
      setProcessingId(null);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  const fmt = (amount: number, currency = 'EUR') =>
    new Intl.NumberFormat('en-EU', { style: 'currency', currency }).format(amount);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-1">Transaction ledger and teacher payout requests</p>
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Revenue', value: fmt(stats.totalRevenue), icon: '💰', color: 'blue' },
          { label: 'Platform Commission', value: fmt(stats.totalCommission), icon: '📊', color: 'purple' },
          { label: 'Pending Payouts', value: fmt(stats.pendingPayouts), icon: '⏳', color: 'yellow' },
          { label: 'Payout Requests', value: `${stats.pendingPayoutCount} pending`, icon: '📤', color: 'orange' },
          { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: '↻', color: 'indigo' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{s.icon}</span>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex border-b border-gray-200">
          {(['transactions', 'subscriptions', 'payouts'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'payouts'
                ? `Payout Requests${stats.pendingPayoutCount > 0 ? ` (${stats.pendingPayoutCount})` : ''}`
                : tab === 'subscriptions'
                  ? `Teacher Subscriptions (${subscriptions.length})`
                  : 'Transactions'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* ── Transactions Tab ── */}
          {activeTab === 'transactions' && (
            <>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="all">All Types</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <span className="ml-auto text-sm text-gray-500 self-center">
                  {filteredTransactions.length} records
                </span>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">💳</p>
                  <p className="text-sm">No transactions yet. They will appear here once payments go live.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Date</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Type</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Amount</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Description</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Stripe ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTransactions.map((tx) => {
                        const typeInfo = TYPE_LABELS[tx.type];
                        const statusInfo = STATUS_LABELS[tx.status];
                        return (
                          <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap text-xs">
                              {fmtDate(tx.created_at)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                {typeInfo.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-gray-900">
                              {fmt(tx.amount, tx.currency)}
                              {tx.commission_amount && (
                                <span className="ml-1 text-xs text-gray-400">
                                  (comm: {fmt(tx.commission_amount, tx.currency)})
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-gray-600 max-w-[200px] truncate">
                              {tx.description || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-gray-400 font-mono text-xs max-w-[120px] truncate">
                              {tx.external_payment_id || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Payout Requests Tab ── */}
          {activeTab === 'subscriptions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-3 pr-4">Teacher</th>
                    <th className="py-3 pr-4">Student</th>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Current period</th>
                    <th className="py-3">Last payment</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map(subscription => (
                    <tr key={subscription.id} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {subscription.teacher_name}
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{subscription.student_name}</td>
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {fmt(subscription.monthly_amount, subscription.currency)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          ['active', 'trialing'].includes(subscription.status)
                            ? 'bg-green-100 text-green-700'
                            : ['incomplete', 'past_due', 'unpaid'].includes(subscription.status)
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {subscription.status}
                          {subscription.cancel_at_period_end ? ' · renewal off' : ''}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {subscription.current_period_end
                          ? `Ends ${fmtDate(subscription.current_period_end)}`
                          : 'Not available'}
                      </td>
                      <td className="py-3 text-gray-600">
                        {subscription.last_payment_at
                          ? fmtDate(subscription.last_payment_at)
                          : subscription.last_payment_failed_at
                            ? `Failed ${fmtDate(subscription.last_payment_failed_at)}`
                            : 'No successful payment'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {subscriptions.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-500">
                  No teacher subscriptions found.
                </div>
              )}
            </div>
          )}

          {activeTab === 'payouts' && (
            <>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : payouts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">📤</p>
                  <p className="text-sm">No payout requests yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {payouts.map((payout) => {
                    const statusInfo = PAYOUT_STATUS_LABELS[payout.status];
                    const isPending = payout.status === 'pending';
                    return (
                      <div
                        key={payout.id}
                        className={`border rounded-xl p-4 ${isPending ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900">
                                {payout.teacher_profile?.full_name || 'Unknown Teacher'}
                              </p>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {payout.teacher_profile?.email || ''}
                            </p>
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                              <div>
                                <span className="text-gray-500 text-xs">Amount</span>
                                <p className="font-bold text-gray-900">{fmt(payout.amount, payout.currency)}</p>
                              </div>
                              <div>
                                <span className="text-gray-500 text-xs">Requested</span>
                                <p className="text-gray-700">{fmtDate(payout.created_at)}</p>
                              </div>
                              <div>
                                <span className="text-gray-500 text-xs">Bank Ref</span>
                                <p className="text-gray-700 font-mono text-xs truncate max-w-[150px]">
                                  {payout.bank_details_ref}
                                </p>
                              </div>
                            </div>
                            {payout.rejection_reason && (
                              <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                                Rejection reason: {payout.rejection_reason}
                              </p>
                            )}
                            {payout.admin_notes && (
                              <p className="mt-1 text-xs text-gray-500 italic">{payout.admin_notes}</p>
                            )}
                          </div>

                          {isPending && (
                            <div className="flex flex-col gap-2 shrink-0">
                              <button
                                onClick={() => handleApprove(payout.id)}
                                disabled={processingId === payout.id}
                                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                {processingId === payout.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                onClick={() => setRejectModal({ id: payout.id, reason: '' })}
                                disabled={processingId === payout.id}
                                className="px-4 py-1.5 text-sm bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Payout Request</h3>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              rows={3}
              placeholder="Explain why this payout is being rejected..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectModal.reason.trim() || processingId !== null}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {processingId ? 'Rejecting...' : 'Reject Payout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
