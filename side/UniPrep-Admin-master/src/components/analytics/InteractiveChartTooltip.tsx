// Interactive Chart Tooltip Component
// Phase 6: Enhanced visualizations with rich tooltips

'use client';

import React from 'react';

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: any, name: string) => [string, string];
  labelFormatter?: (label: string) => string;
}

export function InteractiveChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = labelFormatter ? labelFormatter(label || '') : label;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
      {/* Label */}
      {formattedLabel && (
        <div className="text-sm font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100">
          {formattedLabel}
        </div>
      )}

      {/* Data Points */}
      <div className="space-y-1.5">
        {payload.map((entry, index) => {
          const value = entry.value;
          const name = entry.name || entry.dataKey;
          const color = entry.color || entry.fill || entry.stroke;

          // Use custom formatter if provided
          const [formattedValue, formattedName] = formatter
            ? formatter(value, name)
            : [value, name];

          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3">
              {/* Color indicator */}
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-gray-600">{formattedName}</span>
              </div>

              {/* Value */}
              <span className="text-sm font-semibold text-gray-900">
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>

      {/* Additional info if available */}
      {payload[0]?.payload?.additionalInfo && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
          {payload[0].payload.additionalInfo}
        </div>
      )}
    </div>
  );
}

// Engagement Chart Tooltip
export function EngagementTooltip(props: ChartTooltipProps) {
  return (
    <InteractiveChartTooltip
      {...props}
      labelFormatter={(label) => {
        const date = new Date(label);
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }}
      formatter={(value, name) => {
        const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
        const nameMap: Record<string, string> = {
          activeUsers: 'Active Users',
          sessions: 'Sessions',
          avgDuration: 'Avg Duration (min)',
        };
        return [formattedValue, nameMap[name] || name];
      }}
    />
  );
}

// Performance Chart Tooltip
export function PerformanceTooltip(props: ChartTooltipProps) {
  return (
    <InteractiveChartTooltip
      {...props}
      formatter={(value, name) => {
        const nameMap: Record<string, string> = {
          accuracy: 'Accuracy',
          avgScore: 'Avg Score',
          completionRate: 'Completion Rate',
        };
        
        const formattedValue = typeof value === 'number'
          ? `${value.toFixed(1)}%`
          : value;
        
        return [formattedValue, nameMap[name] || name];
      }}
    />
  );
}

// Question Performance Tooltip
export function QuestionTooltip(props: ChartTooltipProps) {
  return (
    <InteractiveChartTooltip
      {...props}
      formatter={(value, name) => {
        const nameMap: Record<string, string> = {
          accuracy: 'Accuracy Rate',
          attempts: 'Total Attempts',
          skipRate: 'Skip Rate',
          avgTime: 'Avg Time (sec)',
        };
        
        let formattedValue: string;
        if (name === 'accuracy' || name === 'skipRate') {
          formattedValue = `${value.toFixed(1)}%`;
        } else if (name === 'attempts') {
          formattedValue = value.toLocaleString();
        } else if (name === 'avgTime') {
          formattedValue = `${value}s`;
        } else {
          formattedValue = String(value);
        }
        
        return [formattedValue, nameMap[name] || name];
      }}
    />
  );
}

// System Metrics Tooltip
export function SystemTooltip(props: ChartTooltipProps) {
  return (
    <InteractiveChartTooltip
      {...props}
      labelFormatter={(label) => {
        const date = new Date(label);
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }}
      formatter={(value, name) => {
        const nameMap: Record<string, string> = {
          responseTime: 'Response Time',
          errorRate: 'Error Rate',
          requests: 'Requests',
          uptime: 'Uptime',
        };
        
        let formattedValue: string;
        if (name === 'responseTime') {
          formattedValue = `${value}ms`;
        } else if (name === 'errorRate' || name === 'uptime') {
          formattedValue = `${value.toFixed(2)}%`;
        } else if (name === 'requests') {
          formattedValue = value.toLocaleString();
        } else {
          formattedValue = String(value);
        }
        
        return [formattedValue, nameMap[name] || name];
      }}
    />
  );
}

// Cohort Comparison Tooltip
export function CohortTooltip(props: ChartTooltipProps) {
  return (
    <InteractiveChartTooltip
      {...props}
      formatter={(value, name) => {
        const formattedValue = typeof value === 'number'
          ? value.toLocaleString()
          : value;
        return [formattedValue, name];
      }}
    />
  );
}
