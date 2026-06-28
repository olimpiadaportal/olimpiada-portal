'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, ArrowLeft, Download, RefreshCw, Trash2, Edit, Send } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCostTrends, getBudgetStatus, getBudgets, deleteBudget } from '@/services/aiAnalyticsService';
import type { CostTrend, BudgetStatus } from '@/services/aiAnalyticsService';
import ExportModal from '@/components/ai/ExportModal';
import BudgetModal from '@/components/ai/BudgetModal';
import AlertHistoryCard from '@/components/ai/AlertHistoryCard';
import { CostOptimizationCard } from '@/components/ai/CostOptimizationCard';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

/**
 * AI Cost Management Page
 * Stage 5.5 - Phase 3
 */

export default function CostManagementPage() {
  const router = useRouter();
  const [costTrends, setCostTrends] = useState<CostTrend[]>([]);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sendingAlert, setSendingAlert] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

      const [trendsRes, budgetsRes] = await Promise.all([
        getCostTrends('daily', days),
        getBudgetStatus(),
      ]);

      if (trendsRes.data) setCostTrends(trendsRes.data);
      if (budgetsRes.data) setBudgets(budgetsRes.data);
    } catch (error) {
      console.error('Error loading cost data:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealTimeUpdates({
    enabled: autoRefresh && !loading,
    interval: 30000,
    onUpdate: loadData,
  });

  const handleDeleteBudget = async (budgetId: string, budgetName: string) => {
    if (!confirm(`Are you sure you want to delete budget "${budgetName}"? This action cannot be undone.`)) {
      return;
    }

    const { error } = await deleteBudget(budgetId);
    if (error) {
      alert('Failed to delete budget: ' + error.message);
    } else {
      await loadData(); // Refresh data
    }
  };

  const handleSendTestAlert = async (budgetId: string, budgetName: string) => {
    if (!confirm(`Send a test alert email for budget "${budgetName}"?`)) {
      return;
    }

    setSendingAlert(budgetId);

    try {
      const response = await fetch('/api/ai/trigger-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetId }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert('✅ Test alert sent successfully! Check your email.');
        await loadData(); // Refresh to show new alert in history
      } else {
        alert('❌ Failed to send test alert: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error sending test alert:', error);
      alert('❌ Failed to send test alert. Check console for details.');
    } finally {
      setSendingAlert(null);
    }
  };

  const totalSpend = costTrends.reduce((sum, day) => sum + (day.cost || 0), 0);
  const avgDailySpend = totalSpend / (costTrends.length || 1);
  const projectedMonthly = avgDailySpend * 30;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push('/ai-management')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to AI Management</span>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Cost Management</h1>
          <p className="text-gray-600 mt-1">Monitor and optimize AI spending</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 border rounded-lg transition-colors ${
              autoRefresh ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 hover:bg-gray-50'
            }`}
            title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
          >
            <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
          </button>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | '90d')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Modals */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        dataType="costs"
        data={costTrends}
      />
      <BudgetModal
        isOpen={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        onSuccess={loadData}
      />

      {/* Cost Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Spend</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${totalSpend.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Last {timeRange === '7d' ? '7' : timeRange === '30d' ? '30' : '90'} days
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Daily Cost</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${avgDailySpend.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Per day average
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Projected Monthly</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ${projectedMonthly.toFixed(2)}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Based on current usage
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Budgets</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {budgets.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <span className={`font-medium ${budgets.some(b => b.status === 'over_budget') ? 'text-red-600' : 'text-green-600'}`}>
              {budgets.some(b => b.status === 'over_budget') ? 'Over Budget' : 'On Track'}
            </span>
          </div>
        </div>
      </div>

      {/* Cost Trends Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Daily Cost Trends</h2>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={costTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="period_date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: any, name: string) => {
                if (name === 'cost') return [`$${Number(value).toFixed(4)}`, 'Cost'];
                if (name === 'avg_cost_per_request') return [`$${Number(value).toFixed(6)}`, 'Avg Cost/Request'];
                return [value, name];
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="cost" stroke="#10b981" strokeWidth={2} name="Daily Cost ($)" />
            <Line type="monotone" dataKey="avg_cost_per_request" stroke="#3b82f6" strokeWidth={2} name="Avg Cost/Request ($)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Budget Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Budget Status</h2>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Budget
          </button>
        </div>

        {budgets.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No budgets configured yet</p>
            <button
              onClick={() => setShowBudgetModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Budget
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {budgets.map((budget) => (
              <div 
                key={budget.budget_id}
                className={`border rounded-lg p-4 ${
                  budget.status === 'over_budget' ? 'border-red-300 bg-red-50' :
                  budget.status === 'warning' ? 'border-yellow-300 bg-yellow-50' :
                  'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{budget.budget_name}</h3>
                    <p className="text-sm text-gray-600 capitalize">{budget.period_type} Budget</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {budget.status === 'over_budget' && (
                        <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          Over Budget
                        </span>
                      )}
                      {budget.status === 'warning' && (
                        <span className="flex items-center gap-1 text-yellow-600 text-sm font-medium">
                          <AlertTriangle className="w-4 h-4" />
                          Warning
                        </span>
                      )}
                      {budget.status === 'normal' && (
                        <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
                          <CheckCircle className="w-4 h-4" />
                          On Track
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSendTestAlert(budget.budget_id, budget.budget_name)}
                        disabled={sendingAlert === budget.budget_id}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Send test alert"
                      >
                        {sendingAlert === budget.budget_id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(budget.budget_id, budget.budget_name)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete budget"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">
                      ${budget.current_spend.toFixed(2)} / ${budget.budget_amount.toFixed(2)}
                    </span>
                    <span className={`font-medium ${
                      budget.percent_used >= 100 ? 'text-red-600' :
                      budget.percent_used >= budget.alert_threshold ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {budget.percent_used.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        budget.percent_used >= 100 ? 'bg-red-600' :
                        budget.percent_used >= budget.alert_threshold ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(budget.percent_used, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Budget Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Remaining</p>
                    <p className="font-semibold text-gray-900">
                      ${budget.remaining.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Days Left</p>
                    <p className="font-semibold text-gray-900">
                      {budget.days_remaining} days
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Projected</p>
                    <p className={`font-semibold ${
                      budget.projected_spend > budget.budget_amount ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      ${budget.projected_spend.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Hard Limit</p>
                    <p className={`font-semibold flex items-center gap-1 ${
                      budget.hard_limit_enabled ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {budget.hard_limit_enabled ? (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          Enabled
                        </>
                      ) : (
                        'Disabled'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Period</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(budget.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(budget.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Breakdown by Period */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost Breakdown</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={costTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="period_date" 
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
              formatter={(value: any) => [`$${Number(value).toFixed(4)}`, 'Cost']}
            />
            <Legend />
            <Bar dataKey="cost" fill="#10b981" name="Daily Cost ($)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Phase 3: Alert History */}
      <AlertHistoryCard days={30} />

      {/* Phase 3: Cost Optimization Analyzer */}
      <CostOptimizationCard />
    </div>
  );
}
