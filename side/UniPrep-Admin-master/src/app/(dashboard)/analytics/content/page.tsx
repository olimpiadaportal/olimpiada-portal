'use client';

import { useState, useEffect } from 'react';
import { analyticsService, DateRange, QuestionFeedbackItem, SubjectFilterOption } from '@/services/analyticsService';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { MetricCard } from '@/components/analytics/MetricCard';
import { ExamPerformanceChart } from '@/components/analytics/ExamPerformanceChart';
import { SubjectPerformanceChart } from '@/components/analytics/SubjectPerformanceChart';
import { QuestionEditModal } from '@/components/analytics/QuestionEditModal';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function ContentAnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(
    analyticsService.getDateRangePreset('last30days')
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [questions, setQuestions] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [subjectStats, setSubjectStats] = useState<any[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectFilterOption[]>([]);
  
  // Filter states
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);

  // Feedback & edit states
  const [feedback, setFeedback] = useState<QuestionFeedbackItem[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange, selectedSubject, selectedDifficulty]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      // Note: Exam analytics shows all exams (not filtered by date) to ensure data is visible
      const [questionsRes, examsRes, feedbackRes, subjectsRes] = await Promise.all([
        analyticsService.getQuestionPerformance({
          subjectId: selectedSubject || undefined,
          difficulty: selectedDifficulty || undefined,
          limit: 50,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        analyticsService.getExamAnalytics(undefined, dateRange),
        analyticsService.getQuestionFeedback(),
        analyticsService.getSubjectFilterOptions(),
      ]);

      if (!questionsRes.success || !examsRes.success) {
        throw new Error('Failed to load content analytics');
      }

      setQuestions(questionsRes.data || []);
      setExams(examsRes.data || []);
      setFeedback(feedbackRes.data || []);
      if (subjectsRes.success) {
        setSubjectOptions(subjectsRes.data || []);
      }

      // Calculate subject stats from questions
      const subjectMap = new Map();
      (questionsRes.data || []).forEach((q: any) => {
        if (!subjectMap.has(q.subjectName)) {
          subjectMap.set(q.subjectName, {
            name: q.subjectName,
            totalQuestions: 0,
            avgAccuracy: 0,
            totalAttempts: 0,
          });
        }
        const subject = subjectMap.get(q.subjectName);
        subject.totalQuestions++;
        subject.avgAccuracy += q.accuracy;
        subject.totalAttempts += q.attempts;
      });

      const subjects = Array.from(subjectMap.values()).map(s => ({
        ...s,
        avgAccuracy: s.totalQuestions > 0 ? s.avgAccuracy / s.totalQuestions : 0,
      }));

      setSubjectStats(subjects);

    } catch (err) {
      console.error('Load data error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary metrics
  const totalQuestions = questions.length;
  const avgAccuracy = questions.length > 0 
    ? questions.reduce((sum, q) => sum + q.accuracy, 0) / questions.length 
    : 0;
  const totalAttempts = questions.reduce((sum, q) => sum + q.attempts, 0);
  const avgSkipRate = questions.length > 0
    ? questions.reduce((sum, q) => sum + q.skipRate, 0) / questions.length
    : 0;
  const timingHotspots = [...questions]
    .filter(q => Number(q.avgTimeToAnswer || 0) > 0)
    .sort((a, b) => Number(b.avgTimeToAnswer || 0) - Number(a.avgTimeToAnswer || 0))
    .slice(0, 5);
  const difficultyTiming = ['easy', 'medium', 'hard'].map((difficulty) => {
    const rows = questions.filter(q => q.difficulty === difficulty && Number(q.avgTimeToAnswer || 0) > 0);
    const avgTime = rows.length > 0
      ? rows.reduce((sum, q) => sum + Number(q.avgTimeToAnswer || 0), 0) / rows.length
      : 0;

    return {
      difficulty,
      avgTime,
      questions: rows.length,
    };
  });

  // Phase 6: Improved loading state
  if (loading) {
    return (
      <div className="p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  // Phase 6: Improved error state
  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage
          type="error"
          title="Failed to Load Content Analytics"
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Analytics</h1>
          <p className="text-gray-600 mt-1">Question and exam performance insights</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.href = '/analytics'}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Overview
          </button>
          
          <DateRangePicker
            dateRange={dateRange}
            onChange={setDateRange}
            onPresetChange={(preset) => setDateRange(analyticsService.getDateRangePreset(preset))}
          />
        </div>
      </div>

      {/* Key Metrics - Phase 6: Added tooltips */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Questions"
          value={totalQuestions}
          icon="activity"
          tooltip="Total number of questions in the system that have been attempted by students"
        />
        <MetricCard
          title="Avg Accuracy"
          value={`${avgAccuracy.toFixed(1)}%`}
          trend={avgAccuracy >= 70 ? 'up' : avgAccuracy >= 50 ? 'neutral' : 'down'}
          icon="target"
          tooltip="Average percentage of correct answers across all questions"
        />
        <MetricCard
          title="Total Attempts"
          value={analyticsService.formatNumber(totalAttempts)}
          icon="users"
          tooltip="Total number of times students have attempted questions"
        />
        <MetricCard
          title="Avg Skip Rate"
          value={`${avgSkipRate.toFixed(1)}%`}
          trend={avgSkipRate <= 20 ? 'up' : avgSkipRate <= 40 ? 'neutral' : 'down'}
          tooltip="Average percentage of questions skipped by students (lower is better)"
          icon="activity"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              value={selectedSubject || ''}
              onChange={(e) => setSelectedSubject(e.target.value || null)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Subjects</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name_en}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
            <select
              value={selectedDifficulty || ''}
              onChange={(e) => setSelectedDifficulty(e.target.value || null)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {(selectedSubject || selectedDifficulty) && (
            <button
              onClick={() => {
                setSelectedSubject(null);
                setSelectedDifficulty(null);
              }}
              className="mt-6 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SubjectPerformanceChart subjects={subjectStats} />
        <ExamPerformanceChart exams={exams} />
      </div>

      {/* Timing Performance */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Timing Performance</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Average answer time across students, filtered by the selected subject, difficulty, and date range.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">
          {difficultyTiming.map((item) => (
            <div key={item.difficulty} className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500 capitalize">{item.difficulty}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {item.avgTime > 0 ? `${Math.round(item.avgTime)}s` : 'No data'}
              </p>
              <p className="text-xs text-gray-500 mt-1">{item.questions} questions with timing data</p>
            </div>
          ))}
        </div>
        <div className="px-6 pb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Slowest Question Hotspots</h3>
          {timingHotspots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              Timing data will appear here after students answer practice questions.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {timingHotspots.map((question) => (
                <div key={question.questionId} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{question.questionText}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {question.subjectName} - {question.difficulty} - {question.accuracy.toFixed(1)}% accuracy - {question.attempts} attempts
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-amber-600">{Math.round(question.avgTimeToAnswer || 0)}s</p>
                    <p className="text-xs text-gray-500">avg time</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student Feedback — Preview */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Student Feedback</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {feedback.filter(f => f.status === 'pending').length} pending · {feedback.length} total reports
            </p>
          </div>
          <a
            href="/analytics/feedback"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            View All Feedback
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
        {feedback.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">No feedback reports yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {feedback.filter(f => f.status === 'pending').slice(0, 5).map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.question_text}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.feedback_type.replace(/_/g, ' ')} · {item.subject_name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.total_reports > 1 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      {item.total_reports} reports
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">pending</span>
                </div>
              </div>
            ))}
            {feedback.filter(f => f.status === 'pending').length === 0 && (
              <div className="px-6 py-4 text-sm text-green-700 bg-green-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                All reports have been addressed.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Question Performance — Preview */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Question Performance</h2>
            <p className="text-sm text-gray-500 mt-0.5">Top questions by attempt count</p>
          </div>
          <a
            href="/analytics/question-performance"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            View All Questions
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
        {questions.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">No question data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Question</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Subject</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Attempts</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Accuracy</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">Skip Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {questions.slice(0, 8).map((q: any) => (
                  <tr key={q.questionId} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-900 max-w-xs truncate">{q.questionText}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{q.subjectName}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{q.attempts}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-medium ${q.accuracy >= 70 ? 'text-green-600' : q.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {q.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-medium ${q.skipRate <= 20 ? 'text-green-600' : q.skipRate <= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {q.skipRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {questions.length > 8 && (
              <div className="px-6 py-3 text-sm text-gray-500 border-t border-gray-100">
                Showing 8 of {questions.length} questions.{' '}
                <a href="/analytics/question-performance" className="text-blue-600 hover:underline">View all →</a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Data</h2>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Questions to CSV
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Quality Report
          </button>
        </div>
      </div>

      {/* Question Edit Modal */}
      {editingQuestionId && (
        <QuestionEditModal
          questionId={editingQuestionId}
          onClose={() => setEditingQuestionId(null)}
          onSaved={() => loadData()}
        />
      )}
    </div>
  );
}
