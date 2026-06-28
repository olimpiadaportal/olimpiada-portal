'use client';

import { useState } from 'react';
import { X, DollarSign } from 'lucide-react';
import { createBudget } from '@/services/aiAnalyticsService';

/**
 * Budget Creation Modal
 * Create and configure AI budgets with alert settings
 * Stage 5.5 - Phase 3
 */

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BudgetModal({ isOpen, onClose, onSuccess }: BudgetModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    period_type: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    budget_usd: '',
    alert_threshold_percent: '80',
    hard_limit: false,
    // Phase 3: Alert configuration
    alert_enabled: true,
    alert_email: '',
    alert_threshold_1: '80',
    alert_threshold_2: '95',
    alert_threshold_3: '100',
    hard_limit_enabled: false,
    grace_period_hours: '24',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      // Calculate period dates
      const now = new Date();
      let periodStart = new Date();
      let periodEnd = new Date();

      switch (formData.period_type) {
        case 'daily':
          periodStart = new Date(now.setHours(0, 0, 0, 0));
          periodEnd = new Date(now.setHours(23, 59, 59, 999));
          break;
        case 'weekly':
          const dayOfWeek = now.getDay();
          periodStart = new Date(now.setDate(now.getDate() - dayOfWeek));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodEnd.getDate() + 6);
          periodEnd.setHours(23, 59, 59, 999);
          break;
        case 'monthly':
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case 'quarterly':
          const quarter = Math.floor(now.getMonth() / 3);
          periodStart = new Date(now.getFullYear(), quarter * 3, 1);
          periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
          break;
        case 'yearly':
          periodStart = new Date(now.getFullYear(), 0, 1);
          periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
      }

      const { error: createError } = await createBudget({
        name: formData.name,
        description: formData.description || undefined,
        period_type: formData.period_type,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        budget_usd: parseFloat(formData.budget_usd),
        alert_threshold_percent: parseInt(formData.alert_threshold_percent),
        hard_limit: formData.hard_limit,
        // Phase 3: Alert configuration
        alert_enabled: formData.alert_enabled,
        alert_email: formData.alert_email || undefined,
        alert_threshold_1: parseInt(formData.alert_threshold_1),
        alert_threshold_2: parseInt(formData.alert_threshold_2),
        alert_threshold_3: parseInt(formData.alert_threshold_3),
        hard_limit_enabled: formData.hard_limit_enabled,
        grace_period_hours: parseInt(formData.grace_period_hours),
      });

      if (createError) throw createError;

      // Reset form
      setFormData({
        name: '',
        description: '',
        period_type: 'monthly',
        budget_usd: '',
        alert_threshold_percent: '80',
        hard_limit: false,
        alert_enabled: true,
        alert_email: '',
        alert_threshold_1: '80',
        alert_threshold_2: '95',
        alert_threshold_3: '100',
        hard_limit_enabled: false,
        grace_period_hours: '24',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create budget');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Create Budget</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Budget Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Monthly AI Budget"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Period Type and Budget Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Period Type *
              </label>
              <select
                value={formData.period_type}
                onChange={(e) => setFormData({ ...formData, period_type: e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Budget Amount (USD) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.budget_usd}
                onChange={(e) => setFormData({ ...formData, budget_usd: e.target.value })}
                placeholder="100.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Alert Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alert Threshold (%) *
            </label>
            <input
              type="number"
              required
              min="0"
              max="100"
              value={formData.alert_threshold_percent}
              onChange={(e) => setFormData({ ...formData, alert_threshold_percent: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-600 mt-1">
              You'll receive an alert when spending reaches this percentage of the budget
            </p>
          </div>

          {/* Phase 3: Alert Configuration */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📧 Alert Configuration</h3>
            
            {/* Alert Enabled Toggle */}
            <div className="flex items-start gap-3 mb-4">
              <input
                type="checkbox"
                id="alert_enabled"
                checked={formData.alert_enabled}
                onChange={(e) => setFormData({ ...formData, alert_enabled: e.target.checked })}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <label htmlFor="alert_enabled" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Enable Email Alerts
                </label>
                <p className="text-sm text-gray-600 mt-1">
                  Receive email notifications when budget thresholds are reached
                </p>
              </div>
            </div>

            {formData.alert_enabled && (
              <>
                {/* Alert Email */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alert Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={formData.alert_email}
                    onChange={(e) => setFormData({ ...formData, alert_email: e.target.value })}
                    placeholder="admin@example.com (defaults to your account email)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Leave empty to use your account email
                  </p>
                </div>

                {/* Alert Thresholds */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Warning 1 (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.alert_threshold_1}
                      onChange={(e) => setFormData({ ...formData, alert_threshold_1: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Warning 2 (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.alert_threshold_2}
                      onChange={(e) => setFormData({ ...formData, alert_threshold_2: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Critical (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.alert_threshold_3}
                      onChange={(e) => setFormData({ ...formData, alert_threshold_3: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  You'll receive alerts at each threshold (default: 80%, 95%, 100%)
                </p>
              </>
            )}
          </div>

          {/* Hard Limit Configuration */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🛑 Hard Limit (Optional)</h3>
            
            <div className="flex items-start gap-3 mb-4">
              <input
                type="checkbox"
                id="hard_limit_enabled"
                checked={formData.hard_limit_enabled}
                onChange={(e) => setFormData({ ...formData, hard_limit_enabled: e.target.checked })}
                className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <div>
                <label htmlFor="hard_limit_enabled" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Enable Hard Limit
                </label>
                <p className="text-sm text-gray-600 mt-1">
                  Automatically disable AI features when budget is exceeded
                </p>
              </div>
            </div>

            {formData.hard_limit_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grace Period (Hours)
                </label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  value={formData.grace_period_hours}
                  onChange={(e) => setFormData({ ...formData, grace_period_hours: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Hours before hard limit takes effect after budget exceeded (default: 24 hours)
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                  <p className="text-sm text-yellow-800">
                    ⚠️ <strong>Warning:</strong> Enabling hard limit will block all AI features for affected users when budget is exceeded. Use with caution in production.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Budget Tips</h4>
            <ul className="space-y-1 text-sm text-blue-800">
              <li>• Start with a conservative budget and adjust based on usage</li>
              <li>• Set alert threshold to 80% to get early warnings</li>
              <li>• Use hard limits only for testing environments</li>
              <li>• Monitor projected spend to avoid surprises</li>
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
