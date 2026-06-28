/**
 * Budget Limit Alert Component
 * Stage 5.5 - Phase 3: Hard Limit Enforcement
 * 
 * Displays alert when user is blocked by budget hard limit
 */

'use client';

import { AlertTriangle, DollarSign, Clock } from 'lucide-react';

interface BudgetLimitAlertProps {
  budgetName?: string;
  currentSpend?: number;
  budgetLimit?: number;
  gracePeriodEnds?: Date;
  message?: string;
  onContactAdmin?: () => void;
}

export function BudgetLimitAlert({
  budgetName,
  currentSpend,
  budgetLimit,
  gracePeriodEnds,
  message,
  onContactAdmin,
}: BudgetLimitAlertProps) {
  const percentUsed = currentSpend && budgetLimit ? (currentSpend / budgetLimit) * 100 : 0;
  
  const getTimeRemaining = () => {
    if (!gracePeriodEnds) return null;
    
    const now = new Date();
    const diff = gracePeriodEnds.getTime() - now.getTime();
    
    if (diff <= 0) return 'Grace period ended';
    
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} remaining`;
    
    const days = Math.ceil(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} remaining`;
  };

  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900 mb-1">
            Budget Limit Exceeded
          </h3>
          <p className="text-sm text-red-700">
            {message || 'AI requests are currently blocked due to budget limits.'}
          </p>
        </div>
      </div>

      {/* Budget Details */}
      {budgetName && (
        <div className="bg-white rounded-lg p-4 mb-4">
          <div className="space-y-3">
            {/* Budget Name */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Affected Budget</p>
              <p className="text-sm font-semibold text-gray-900">{budgetName}</p>
            </div>

            {/* Spend vs Limit */}
            {currentSpend !== undefined && budgetLimit !== undefined && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">Current Usage</p>
                  <p className="text-xs font-medium text-gray-900">
                    {percentUsed.toFixed(1)}%
                  </p>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-red-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(percentUsed, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-red-600">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-semibold">${currentSpend.toFixed(2)}</span>
                  </div>
                  <div className="text-gray-500">
                    / ${budgetLimit.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Grace Period */}
            {gracePeriodEnds && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span className="text-gray-700">Grace Period:</span>
                  <span className="font-medium text-orange-600">
                    {getTimeRemaining()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {onContactAdmin && (
          <button
            onClick={onContactAdmin}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
          >
            Contact Administrator
          </button>
        )}
        <a
          href="/ai-management/costs"
          className="flex-1 px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm text-center"
        >
          View Budget Details
        </a>
      </div>

      {/* Info Box */}
      <div className="mt-4 p-3 bg-red-100 rounded-lg">
        <p className="text-xs text-red-800">
          <strong>What this means:</strong> Your AI usage has reached the hard limit set for this budget. 
          {gracePeriodEnds && getTimeRemaining() !== 'Grace period ended' 
            ? ' You have a grace period to complete urgent tasks, but new requests may be limited.'
            : ' All AI requests are blocked until the budget is increased or the billing period resets.'
          }
        </p>
      </div>
    </div>
  );
}
