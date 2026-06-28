import { QuestionPerformance } from '@/services/analyticsService';

interface TopQuestionsTableProps {
  questions: QuestionPerformance[];
}

export function TopQuestionsTable({ questions }: TopQuestionsTableProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Questions Needing Review</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Question</th>
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Subject</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Accuracy</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Skip Rate</th>
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">
                  No questions need review
                </td>
              </tr>
            ) : (
              questions.map((question, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 text-sm text-gray-900">{question.questionText}</td>
                  <td className="py-3 text-sm text-gray-600">{question.subjectName}</td>
                  <td className="py-3 text-sm text-right">
                    <span className={`font-medium ${question.accuracy < 40 ? 'text-red-600' : 'text-gray-900'}`}>
                      {question.accuracy}%
                    </span>
                  </td>
                  <td className="py-3 text-sm text-right">
                    <span className={`font-medium ${question.skipRate > 30 ? 'text-yellow-600' : 'text-gray-900'}`}>
                      {question.skipRate}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
