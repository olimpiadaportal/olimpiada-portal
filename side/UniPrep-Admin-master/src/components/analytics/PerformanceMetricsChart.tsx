import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PerformanceTooltip } from './InteractiveChartTooltip';

interface PerformanceMetricsChartProps {
  data: any;
}

export function PerformanceMetricsChart({ data }: PerformanceMetricsChartProps) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No performance data available
        </div>
      </div>
    );
  }

  // Calculate averages
  const avgActiveUsers = data.reduce((sum: number, d: any) => sum + (d.activeUsers || 0), 0) / data.length;
  const avgAccuracy = data.reduce((sum: number, d: any) => sum + (d.avgAccuracy || 0), 0) / data.length;
  const totalSessions = data.reduce((sum: number, d: any) => sum + (d.totalSessions || 0), 0);

  // Format data for recharts (last 14 days)
  const chartData = data.slice(-14).map((point: any) => ({
    date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    accuracy: point.avgAccuracy || 0,
    questions: point.totalQuestions || 0,
    users: point.activeUsers || 0,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{Math.round(avgActiveUsers)}</div>
          <div className="text-xs text-gray-600">Avg Daily Users</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{avgAccuracy.toFixed(1)}%</div>
          <div className="text-xs text-gray-600">Avg Accuracy</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{totalSessions}</div>
          <div className="text-xs text-gray-600">Total Sessions</div>
        </div>
      </div>

      {/* Recharts Bar Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
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
          <Tooltip content={<PerformanceTooltip />} />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar 
            dataKey="accuracy" 
            fill="#10b981" 
            name="Accuracy %"
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="questions" 
            fill="#3b82f6" 
            name="Questions"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 text-xs text-gray-500 text-center">
        Last 14 days
      </div>
    </div>
  );
}
