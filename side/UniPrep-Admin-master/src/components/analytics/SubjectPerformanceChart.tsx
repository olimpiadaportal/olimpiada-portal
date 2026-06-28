import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SubjectStats {
  name: string;
  totalQuestions: number;
  avgAccuracy: number;
  totalAttempts: number;
}

interface SubjectPerformanceChartProps {
  subjects: SubjectStats[];
}

const getAccuracyColor = (accuracy: number) => {
  if (accuracy >= 70) return '#10b981';
  if (accuracy >= 50) return '#f59e0b';
  return '#ef4444';
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SubjectStats }>;
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{d.name}</p>
      <p className="text-gray-600">Attempts: <span className="font-medium text-gray-900">{d.totalAttempts.toLocaleString()}</span></p>
      <p className="text-gray-600">Questions: <span className="font-medium text-gray-900">{d.totalQuestions}</span></p>
      <p className="text-gray-600">
        Avg Accuracy:{' '}
        <span className={`font-medium ${d.avgAccuracy >= 70 ? 'text-green-600' : d.avgAccuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
          {d.avgAccuracy.toFixed(1)}%
        </span>
      </p>
    </div>
  );
};

export function SubjectPerformanceChart({ subjects }: SubjectPerformanceChartProps) {
  if (!subjects || subjects.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Subject Distribution</h3>
        <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
          No subject data available
        </div>
      </div>
    );
  }

  // Top 8 by attempts; slice size = attempts, color = accuracy tier
  const sorted = [...subjects].sort((a, b) => b.totalAttempts - a.totalAttempts).slice(0, 8);
  const chartData = sorted.map((s) => ({
    ...s,
    value: s.totalAttempts || 1,
  }));

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.06) return null;
    const R = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + r * Math.cos(-midAngle * R);
    const y = cy + r * Math.sin(-midAngle * R);
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">Subject Distribution</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">Slice size = total attempts · color = accuracy tier</p>

      {/* Accuracy legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />≥70% good</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />50–70% average</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />&lt;50% needs work</span>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={105}
            innerRadius={42}
            labelLine={false}
            label={renderLabel}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getAccuracyColor(entry.avgAccuracy)} stroke="#fff" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span className="text-xs text-gray-700">{value}</span>}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Summary */}
      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-gray-900">{subjects.length}</div>
          <div className="text-xs text-gray-500">Subjects</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {subjects.reduce((s, sub) => s + sub.totalQuestions, 0)}
          </div>
          <div className="text-xs text-gray-500">Questions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {subjects.length > 0
              ? `${(subjects.reduce((s, sub) => s + sub.avgAccuracy, 0) / subjects.length).toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-xs text-gray-500">Avg Accuracy</div>
        </div>
      </div>
    </div>
  );
}
