/**
 * Alert History Card
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Displays history of budget alerts sent
 */

'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { getBudgetAlertHistory } from '@/services/budgetAlertQueries';

interface AlertHistory {
  id: string;
  budget_id: string;
  budget_name: string;
  alert_type: string;
  threshold_percentage: number;
  current_spend: number;
  budget_limit: number;
  percentage_used: number;
  alert_message: string;
  sent_at: string;
  email_sent: boolean;
  email_error: string | null;
}

interface AlertHistoryCardProps {
  budgetId?: string;
  days?: number;
}

export default function AlertHistoryCard({ budgetId, days = 30 }: AlertHistoryCardProps) {
  const [alerts, setAlerts] = useState<AlertHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAlerts();
  }, [budgetId, days]);

  const loadAlerts = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await getBudgetAlertHistory(budgetId, days);

      if (fetchError) {
        setError(fetchError.message || 'Failed to load alert history');
        return;
      }

      setAlerts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getAlertTypeInfo = (alertType: string) => {
    switch (alertType) {
      case 'threshold_80':
        return {
          label: 'Warning',
          color: 'text-blue-600 bg-blue-100',
          icon: Bell,
        };
      case 'threshold_95':
        return {
          label: 'High Usage',
          color: 'text-orange-600 bg-orange-100',
          icon: AlertTriangle,
        };
      case 'threshold_100':
      case 'hard_limit_triggered':
        return {
          label: 'Critical',
          color: 'text-red-600 bg-red-100',
          icon: AlertTriangle,
        };
      default:
        return {
          label: 'Alert',
          color: 'text-gray-600 bg-gray-100',
          icon: Bell,
        };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Alert History</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Alert History</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">Alert History</h3>
        </div>
        <span className="text-sm text-gray-600">
          Last {days} days
        </span>
      </div>

      {/* Alert List */}
      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">No alerts sent yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Alerts will appear here when budget thresholds are reached
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const typeInfo = getAlertTypeInfo(alert.alert_type);
            const Icon = typeInfo.icon;

            return (
              <div
                key={alert.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Alert Icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Alert Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-sm text-gray-600">
                        {alert.budget_name}
                      </span>
                    </div>

                    <p className="text-sm text-gray-900 mb-2">
                      {alert.alert_message}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(alert.sent_at)}
                      </div>
                      <div>
                        ${alert.current_spend.toFixed(2)} / ${alert.budget_limit.toFixed(2)}
                      </div>
                      <div>
                        {alert.percentage_used.toFixed(1)}% used
                      </div>
                    </div>
                  </div>

                  {/* Email Status */}
                  <div className="flex-shrink-0">
                    {alert.email_sent ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs">Sent</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600" title={alert.email_error || 'Failed to send'}>
                        <XCircle className="w-4 h-4" />
                        <span className="text-xs">Failed</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error Message */}
                {!alert.email_sent && alert.email_error && (
                  <div className="mt-2 ml-13 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    Error: {alert.email_error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
