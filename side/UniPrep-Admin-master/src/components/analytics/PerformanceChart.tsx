import { PerformanceMetrics } from '@/services/analyticsService';

interface PerformanceChartProps {
  data: PerformanceMetrics;
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Average Accuracy</span>
          <span className="text-lg font-semibold text-gray-900">{data.avgAccuracy}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Average Score</span>
          <span className="text-lg font-semibold text-gray-900">{data.avgScore}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Improvement Rate</span>
          <span className={`text-lg font-semibold ${data.improvementRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.improvementRate > 0 ? '+' : ''}{data.improvementRate}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Questions Attempted</span>
          <span className="text-lg font-semibold text-gray-900">{data.totalQuestionsAttempted.toLocaleString()}</span>
        </div>
        {data.subjectPerformance && data.subjectPerformance.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm font-medium text-gray-700 mb-2">Top Subjects</div>
            <div className="space-y-2">
              {data.subjectPerformance.slice(0, 5).map((subject, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{subject.subjectName}</span>
                  <span className="font-medium text-gray-900">{subject.accuracy}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
