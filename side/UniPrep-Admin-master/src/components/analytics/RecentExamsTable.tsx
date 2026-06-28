import { ExamAnalytics } from '@/services/analyticsService';

interface RecentExamsTableProps {
  exams: ExamAnalytics[];
}

export function RecentExamsTable({ exams }: RecentExamsTableProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Exams</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Exam</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Attempts</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Avg Score</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Completion</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">
                  No recent exams
                </td>
              </tr>
            ) : (
              exams.map((exam, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3">
                    <div className="text-sm font-medium text-gray-900">{exam.examName}</div>
                    <div className="text-xs text-gray-500">{exam.examType} - {exam.targetGroup}</div>
                  </td>
                  <td className="py-3 text-sm text-right text-gray-900">{exam.totalAttempts}</td>
                  <td className="py-3 text-sm text-right">
                    <span className={`font-medium ${exam.avgScore >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                      {exam.avgScore}%
                    </span>
                  </td>
                  <td className="py-3 text-sm text-right text-gray-900">{exam.completionRate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
