import { CohortData } from '@/services/analyticsService';

interface CohortComparisonChartProps {
  cohorts: CohortData[] | null;
  cohortType: 'registration_date' | 'city' | 'target_group';
}

export function CohortComparisonChart({ cohorts, cohortType }: CohortComparisonChartProps) {
  if (!cohorts || cohorts.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500">
        No cohort data available
      </div>
    );
  }

  const maxStudents = Math.max(...cohorts.map(c => c.totalStudents));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">
              {cohortType === 'registration_date' ? 'Month' : cohortType === 'city' ? 'City' : 'Target Group'}
            </th>
            <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Total</th>
            <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Active</th>
            <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Accuracy</th>
            <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Questions</th>
            <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Retention</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort, index) => {
            const activePercentage = cohort.totalStudents > 0 ? (cohort.activeStudents / cohort.totalStudents) * 100 : 0;
            const sizePercentage = maxStudents > 0 ? (cohort.totalStudents / maxStudents) * 100 : 0;
            
            return (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-900">{cohort.cohortName}</div>
                    <div className="flex-1 max-w-[100px]">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${sizePercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-sm text-right text-gray-900">{cohort.totalStudents}</td>
                <td className="py-3 text-sm text-right">
                  <span className="font-medium text-gray-900">{cohort.activeStudents}</span>
                  <span className="text-xs text-gray-500 ml-1">({activePercentage.toFixed(0)}%)</span>
                </td>
                <td className="py-3 text-sm text-right">
                  <span className={`font-medium ${cohort.avgAccuracy >= 70 ? 'text-green-600' : cohort.avgAccuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {cohort.avgAccuracy}%
                  </span>
                </td>
                <td className="py-3 text-sm text-right text-gray-900">{cohort.avgQuestionsAttempted.toLocaleString()}</td>
                <td className="py-3 text-sm text-right">
                  <span className={`font-medium ${cohort.retentionRate >= 70 ? 'text-green-600' : cohort.retentionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {cohort.retentionRate}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
