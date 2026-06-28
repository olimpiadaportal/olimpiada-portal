import { ExamAnalytics } from '@/services/analyticsService';

interface ExamPerformanceChartProps {
  exams: ExamAnalytics[];
}

export function ExamPerformanceChart({ exams }: ExamPerformanceChartProps) {
  // Harmonized with mobile app's exam structure
  // Mobile uses: exam_type, target_group, completion tracking
  
  if (!exams || exams.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Exam Performance</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No exam data available
        </div>
      </div>
    );
  }

  const maxAttempts = Math.max(...exams.map(e => e.totalAttempts));

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Exam Performance</h3>
      
      <div className="space-y-4">
        {exams.slice(0, 8).map((exam, index) => {
          const attemptPercentage = maxAttempts > 0 ? (exam.totalAttempts / maxAttempts) * 100 : 0;
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{exam.examName}</div>
                  <div className="text-xs text-gray-500">{exam.examType} - {exam.targetGroup}</div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <div className="font-medium text-gray-900">{exam.totalAttempts}</div>
                    <div className="text-xs text-gray-500">attempts</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${exam.avgScore >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                      {exam.avgScore}%
                    </div>
                    <div className="text-xs text-gray-500">avg score</div>
                  </div>
                </div>
              </div>
              
              {/* Progress bars */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Completion</span>
                    <span>{exam.completionRate}%</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${exam.completionRate}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Pass Rate</span>
                    <span>{exam.passRate}%</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${exam.passRate >= 70 ? 'bg-green-600' : exam.passRate >= 50 ? 'bg-yellow-600' : 'bg-red-600'}`}
                      style={{ width: `${exam.passRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {exams.length > 8 && (
        <div className="mt-4 text-center text-sm text-gray-600">
          Showing top 8 of {exams.length} exams
        </div>
      )}
    </div>
  );
}
