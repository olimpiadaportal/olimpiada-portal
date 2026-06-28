'use client';

import { useState, useEffect } from 'react';
import { analyticsService, DateRange } from '@/services/analyticsService';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { MetricCard } from '@/components/analytics/MetricCard';
import { EngagementChart } from '@/components/analytics/EngagementChart';
import { PerformanceChart } from '@/components/analytics/PerformanceChart';
import { StudentSegments } from '@/components/analytics/StudentSegments';
import { TopQuestionsTable } from '@/components/analytics/TopQuestionsTable';
import { RecentExamsTable } from '@/components/analytics/RecentExamsTable';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useAnalyticsShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcutIndicator } from '@/components/ui/KeyboardShortcutIndicator';

export default function AnalyticsPage() {
  // Phase 6: Enable keyboard shortcuts
  useAnalyticsShortcuts();

  const [dateRange, setDateRange] = useState<DateRange>(
    analyticsService.getDateRangePreset('last7days')
  );
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await analyticsService.getDashboardOverview(dateRange);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to load dashboard data');
      }
      
      setDashboardData(response.data);
    } catch (err) {
      console.error('Load dashboard error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
  };

  const handlePresetChange = (preset: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth') => {
    setDateRange(analyticsService.getDateRangePreset(preset));
  };

  // Phase 6: Improved loading state with skeleton
  if (loading) {
    return (
      <div className="p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  // Phase 6: Improved error state with ErrorMessage component
  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage
          type="error"
          title="Failed to Load Analytics"
          message={error}
          onRetry={loadDashboardData}
        />
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  const { engagement, performance, segments, topQuestions, recentExams } = dashboardData;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor system performance and user engagement</p>
        </div>
        
        <DateRangePicker
          dateRange={dateRange}
          onChange={handleDateRangeChange}
          onPresetChange={handlePresetChange}
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = '/analytics/students'}
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">Student Analytics</div>
              <div className="text-sm text-gray-600">Detailed student insights</div>
            </div>
          </button>

          <button
            onClick={() => window.location.href = '/analytics/content'}
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">Content Analytics</div>
              <div className="text-sm text-gray-600">Question & exam performance</div>
            </div>
          </button>

          <button
            onClick={() => window.location.href = '/analytics/system'}
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors"
          >
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="font-medium text-gray-900">System Analytics</div>
              <div className="text-sm text-gray-600">Performance & health</div>
            </div>
          </button>
        </div>
      </div>

      {/* Key Metrics - Phase 6: Added tooltips for better UX */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Daily Active Users"
          value={engagement.dau}
          change={engagement.dau > 0 ? '+12%' : '0%'}
          trend="up"
          icon="users"
          tooltip="Number of unique students who attempted questions, took exams, or practiced in the selected date range"
        />
        <MetricCard
          title="Average Accuracy"
          value={`${performance.avgAccuracy}%`}
          change={performance.improvementRate > 0 ? `+${performance.improvementRate.toFixed(1)}%` : '0%'}
          trend={performance.improvementRate > 0 ? 'up' : 'neutral'}
          icon="target"
          tooltip="Average percentage of correct answers across all questions attempted by students"
        />
        <MetricCard
          title="Total Sessions"
          value={engagement.totalSessions}
          change="+8%"
          trend="up"
          icon="activity"
          tooltip="Total number of study sessions recorded in the selected date range"
        />
        <MetricCard
          title="Study Time"
          value={analyticsService.formatDuration(performance.totalStudyTime)}
          change="+15%"
          trend="up"
          icon="clock"
          tooltip="Total time students spent studying, including practice sessions and exam attempts"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EngagementChart data={engagement} dateRange={dateRange} />
        <PerformanceChart data={performance} />
      </div>

      {/* Student Segments */}
      <StudentSegments segments={segments} />

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopQuestionsTable questions={topQuestions} />
        <RecentExamsTable exams={recentExams} />
      </div>

      {/* Phase 6: Keyboard Shortcuts Indicator */}
      <KeyboardShortcutIndicator />
    </div>
  );
}
