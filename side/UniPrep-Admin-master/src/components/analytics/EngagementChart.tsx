import { EngagementMetrics, DateRange } from '@/services/analyticsService';

interface EngagementChartProps {
  data: EngagementMetrics;
  dateRange: DateRange;
}

export function EngagementChart({ data, dateRange }: EngagementChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">User Engagement</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Daily Active Users</span>
          <span className="text-lg font-semibold text-gray-900">{data.dau}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Weekly Active Users</span>
          <span className="text-lg font-semibold text-gray-900">{data.wau}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Monthly Active Users</span>
          <span className="text-lg font-semibold text-gray-900">{data.mau}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Avg Session Duration</span>
          <span className="text-lg font-semibold text-gray-900">{data.avgSessionDuration}m</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-2">Retention Rates</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Day 1</span>
              <span className="font-medium text-gray-900">{data.retentionRates.day1}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Day 7</span>
              <span className="font-medium text-gray-900">{data.retentionRates.day7}%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Day 30</span>
              <span className="font-medium text-gray-900">{data.retentionRates.day30}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
