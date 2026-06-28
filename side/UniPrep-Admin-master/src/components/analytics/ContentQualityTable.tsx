import { QuestionPerformance } from '@/services/analyticsService';

interface ContentQualityTableProps {
  issues: QuestionPerformance[];
}

export function ContentQualityTable({ issues }: ContentQualityTableProps) {
  // Harmonized with mobile app's quality detection
  // Issues detected: high skip rate (>30%), low accuracy (<30%), too easy (>95%)
  
  const getIssueType = (question: QuestionPerformance) => {
    if (question.skipRate > 40) return { label: 'High Skip Rate', color: 'bg-red-100 text-red-800' };
    if (question.accuracy < 30) return { label: 'Very Low Accuracy', color: 'bg-red-100 text-red-800' };
    if (question.accuracy > 95 && question.attempts > 50) return { label: 'Too Easy', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Needs Review', color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Content Quality Issues</h2>
      
      {issues.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">No quality issues detected!</p>
          <p className="text-sm text-gray-500 mt-1">All questions are performing well</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Question</th>
                  <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Subject</th>
                  <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Issue Type</th>
                  <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Attempts</th>
                  <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Accuracy</th>
                  <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Skip Rate</th>
                  <th className="text-center text-xs font-medium text-gray-600 uppercase py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue, index) => {
                  const issueType = getIssueType(issue);
                  
                  return (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 max-w-md">
                        <div className="text-sm text-gray-900">{issue.questionText}</div>
                      </td>
                      <td className="py-3 text-sm text-gray-600">{issue.subjectName}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${issueType.color}`}>
                          {issueType.label}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right text-gray-900">{issue.attempts}</td>
                      <td className="py-3 text-sm text-right">
                        <span className={`font-medium ${issue.accuracy < 40 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {issue.accuracy}%
                        </span>
                      </td>
                      <td className="py-3 text-sm text-right">
                        <span className={`font-medium ${issue.skipRate > 40 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {issue.skipRate}%
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => window.location.href = `/questions?id=${issue.questionId}`}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Recommended Actions:</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>High Skip Rate:</strong> Question may be confusing or too difficult - consider rewording</li>
              <li>• <strong>Low Accuracy:</strong> Check if correct answer is marked properly or if question is unclear</li>
              <li>• <strong>Too Easy:</strong> Consider increasing difficulty or reviewing if it's testing the right concept</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
