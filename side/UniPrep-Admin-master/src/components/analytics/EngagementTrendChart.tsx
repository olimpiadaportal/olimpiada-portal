import { DateRange } from '@/services/analyticsService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EngagementTooltip } from './InteractiveChartTooltip';

interface EngagementTrendChartProps {
  data: any;
  dateRange: DateRange;
}

export function EngagementTrendChart({ data, dateRange }: EngagementTrendChartProps) {
  if (!data || !data.length) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement Trends</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No trend data available for this period
        </div>
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map((point: any) => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    activeUsers: point.activeUsers || 0,
    sessions: point.totalSessions || 0,
    questions: point.totalQuestions || 0,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement Trends</h3>
      
      {/* Recharts Line Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<EngagementTooltip />} />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line 
            type="monotone" 
            dataKey="activeUsers" 
            stroke="#3b82f6" 
            strokeWidth={2}
            name="Active Users"
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="sessions" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Sessions"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-gray-900">{data.reduce((sum: number, d: any) => sum + (d.totalQuestions || 0), 0).toLocaleString()}</div>
          <div className="text-xs text-gray-600">Total Questions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{data.reduce((sum: number, d: any) => sum + (d.totalSessions || 0), 0).toLocaleString()}</div>
          <div className="text-xs text-gray-600">Total Sessions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{(data.reduce((sum: number, d: any) => sum + (d.avgAccuracy || 0), 0) / data.length).toFixed(1)}%</div>
          <div className="text-xs text-gray-600">Avg Accuracy</div>
        </div>
      </div>
    </div>
  );
}
