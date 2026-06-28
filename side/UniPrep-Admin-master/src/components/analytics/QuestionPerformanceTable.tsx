import { QuestionPerformance } from '@/services/analyticsService';

interface QuestionPerformanceTableProps {
  questions: QuestionPerformance[];
  onRefresh: () => void;
}

export function QuestionPerformanceTable({ questions, onRefresh }: QuestionPerformanceTableProps) {
  // Harmonized with mobile app's Question interface
  // Mobile uses: difficulty_level: 'easy' | 'medium' | 'hard'
  
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'easy':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'hard':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Question Performance</h2>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Question</th>
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Subject</th>
              <th className="text-left text-xs font-medium text-gray-600 uppercase py-3">Difficulty</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Attempts</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Accuracy</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Skip Rate</th>
              <th className="text-right text-xs font-medium text-gray-600 uppercase py-3">Avg Time</th>
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  No questions found
                </td>
              </tr>
            ) : (
              questions.map((question, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 max-w-md">
                    <div className="text-sm text-gray-900">{question.questionText}</div>
                  </td>
                  <td className="py-3 text-sm text-gray-600">{question.subjectName}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                      {question.difficulty}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-right text-gray-900">{question.attempts}</td>
                  <td className="py-3 text-sm text-right">
                    <span className={`font-medium ${
                      question.accuracy >= 70 ? 'text-green-600' : 
                      question.accuracy >= 50 ? 'text-yellow-600' : 
                      'text-red-600'
                    }`}>
                      {question.accuracy}%
                    </span>
                  </td>
                  <td className="py-3 text-sm text-right">
                    <span className={`font-medium ${
                      question.skipRate <= 20 ? 'text-green-600' : 
                      question.skipRate <= 40 ? 'text-yellow-600' : 
                      'text-red-600'
                    }`}>
                      {question.skipRate}%
                    </span>
                  </td>
                  <td className="py-3 text-sm text-right text-gray-900">{Math.round(question.avgTimeToAnswer)}s</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {questions.length} questions
      </div>
    </div>
  );
}
