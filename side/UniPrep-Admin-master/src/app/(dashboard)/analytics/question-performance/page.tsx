'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { analyticsService, DateRange, QuestionPerformance, SubjectFilterOption } from '@/services/analyticsService';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { MetricCard } from '@/components/analytics/MetricCard';
import { QuestionPerformanceTable } from '@/components/analytics/QuestionPerformanceTable';
import { ContentQualityTable } from '@/components/analytics/ContentQualityTable';
import { QuestionEditModal } from '@/components/analytics/QuestionEditModal';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function QuestionPerformancePage() {
  const [dateRange, setDateRange] = useState<DateRange>(
    analyticsService.getDateRangePreset('last30days')
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuestionPerformance[]>([]);
  const [qualityIssues, setQualityIssues] = useState<any[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [subjectOptions, setSubjectOptions] = useState<SubjectFilterOption[]>([]);

  useEffect(() => { loadData(); }, [dateRange, selectedSubject, selectedDifficulty]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [questionsRes, qualityRes, subjectsRes] = await Promise.all([
        analyticsService.getQuestionPerformance({
          subjectId: selectedSubject || undefined,
          difficulty: selectedDifficulty || undefined,
          limit: 200,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        analyticsService.getContentQualityIssues(),
        analyticsService.getSubjectFilterOptions(),
      ]);
      if (!questionsRes.success) throw new Error(questionsRes.error || 'Failed to load');
      const qs = questionsRes.data || [];
      setQuestions(qs);
      setQualityIssues(qualityRes.data || []);
      if (subjectsRes.success) {
        setSubjectOptions(subjectsRes.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const totalAttempts    = questions.reduce((s, q) => s + q.attempts, 0);
  const avgAccuracy      = questions.length > 0 ? questions.reduce((s, q) => s + q.accuracy, 0) / questions.length : 0;
  const avgSkipRate      = questions.length > 0 ? questions.reduce((s, q) => s + q.skipRate, 0) / questions.length : 0;
  const needsReviewCount = questions.filter(q => q.needsReview).length;

  if (loading) return <div className="p-6"><DashboardSkeleton /></div>;
  if (error)   return <div className="p-6"><ErrorMessage type="error" title="Failed to Load" message={error} onRetry={loadData} /></div>;

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/analytics/content" className="hover:text-gray-700">Content Analytics</Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">Question Performance</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Question Performance</h1>
          <p className="text-gray-600 mt-1">Accuracy, skip rates, and quality signals for every question</p>
        </div>
        <DateRangePicker
          dateRange={dateRange}
          onChange={setDateRange}
          onPresetChange={(preset) => setDateRange(analyticsService.getDateRangePreset(preset))}
        />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Questions"   value={questions.length}                          icon="activity" />
        <MetricCard title="Avg Accuracy"      value={`${avgAccuracy.toFixed(1)}%`}              icon="target"   trend={avgAccuracy >= 70 ? 'up' : avgAccuracy >= 50 ? 'neutral' : 'down'} />
        <MetricCard title="Total Attempts"    value={analyticsService.formatNumber(totalAttempts)} icon="users" />
        <MetricCard title="Needs Review"      value={needsReviewCount}                          icon="activity" trend={needsReviewCount === 0 ? 'up' : needsReviewCount <= 5 ? 'neutral' : 'down'} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <select
            value={selectedSubject || ''}
            onChange={(e) => setSelectedSubject(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Subjects</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name_en || subject.name_az}
              </option>
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
            onClick={() => { setSelectedSubject(null); setSelectedDifficulty(null); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Skip rate callout */}
      {avgSkipRate > 30 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-orange-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-orange-800">
            Average skip rate is <span className="font-semibold">{avgSkipRate.toFixed(1)}%</span>.
            High skip rates often indicate unclear questions or poorly matched difficulty.
          </p>
        </div>
      )}

      {/* Quality issues */}
      {qualityIssues.length > 0 && <ContentQualityTable issues={qualityIssues} />}

      {/* Full question table */}
      <QuestionPerformanceTable
        questions={questions}
        onRefresh={loadData}
      />

      {/* Edit Modal */}
      {editingQuestionId && (
        <QuestionEditModal
          questionId={editingQuestionId}
          onClose={() => setEditingQuestionId(null)}
          onSaved={() => { loadData(); setEditingQuestionId(null); }}
        />
      )}
    </div>
  );
}
