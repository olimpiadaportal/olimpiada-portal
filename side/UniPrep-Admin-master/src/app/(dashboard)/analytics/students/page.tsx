'use client';

import { useState, useEffect } from 'react';
import { analyticsService, DateRange } from '@/services/analyticsService';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { MetricCard } from '@/components/analytics/MetricCard';
import { StudentListTable } from '@/components/analytics/StudentListTable';
import { EngagementTrendChart } from '@/components/analytics/EngagementTrendChart';
import { CohortComparisonChart } from '@/components/analytics/CohortComparisonChart';
import { StudentSegmentsPie } from '@/components/analytics/StudentSegmentsPie';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export default function StudentAnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(
    analyticsService.getDateRangePreset('last30days')
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [engagement, setEngagement] = useState<any>(null);
  const [performance, setPerformance] = useState<any>(null);
  const [segments, setSegments] = useState<any>(null);
  const [cohorts, setCohorts] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);

  // Filter states
  const [cohortType, setCohortType] = useState<'registration_date' | 'city' | 'target_group'>('target_group');
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [dateRange, cohortType]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [engagementRes, performanceRes, segmentsRes, cohortsRes] = await Promise.all([
        analyticsService.getEngagementMetrics(dateRange),
        analyticsService.getPerformanceMetrics(dateRange),
        analyticsService.getStudentSegments(),
        analyticsService.getCohortAnalysis(cohortType, dateRange),
      ]);

      if (!engagementRes.success || !performanceRes.success || !segmentsRes.success || !cohortsRes.success) {
        throw new Error('Failed to load analytics data');
      }

      setEngagement(engagementRes.data);
      setPerformance(performanceRes.data);
      setSegments(segmentsRes.data);
      setCohorts(cohortsRes.data);
      // Use engagement trends data for chart
      setTrends(engagementRes.data?.trends || []);

    } catch (err) {
      console.error('Load data error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

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
          title="Failed to Load Student Analytics"
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
          <h1 className="text-2xl font-bold text-gray-900">Student Analytics</h1>
          <p className="text-gray-600 mt-1">Detailed insights into student engagement and performance</p>
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
          title="Total Students"
          value={segments?.total || 0}
          icon="users"
          tooltip="Total number of registered students in the system"
        />
        <MetricCard
          title="Active Students"
          value={engagement?.dau || 0}
          change="+12%"
          trend="up"
          icon="activity"
          tooltip="Students who attempted questions, took exams, or practiced in the selected date range"
        />
        <MetricCard
          title="Avg Accuracy"
          value={`${performance?.avgAccuracy || 0}%`}
          change={performance?.improvementRate > 0 ? `+${performance.improvementRate.toFixed(1)}%` : '0%'}
          trend={performance?.improvementRate > 0 ? 'up' : 'neutral'}
          icon="target"
          tooltip="Average percentage of correct answers across all student attempts"
        />
        <MetricCard
          title="Retention (Day 7)"
          value={`${engagement?.retentionRates?.day7 || 0}%`}
          icon="users"
          tooltip="Percentage of students who returned after 7 days from their first activity"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EngagementTrendChart 
          data={trends} 
          dateRange={dateRange}
        />
        <StudentSegmentsPie segments={segments} />
      </div>

      {/* Cohort Analysis */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Cohort Analysis</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCohortType('target_group')}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                cohortType === 'target_group'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Target Group
            </button>
            <button
              onClick={() => setCohortType('city')}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                cohortType === 'city'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By City
            </button>
            <button
              onClick={() => setCohortType('registration_date')}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                cohortType === 'registration_date'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Registration
            </button>
          </div>
        </div>
        <CohortComparisonChart cohorts={cohorts} cohortType={cohortType} />
      </div>

      {/* Student List */}
      <StudentListTable 
        dateRange={dateRange}
        selectedSegment={selectedSegment}
        onSegmentChange={setSelectedSegment}
      />

      {/* Export Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Data</h2>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export to CSV
          </button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Export to Excel
          </button>
          <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Export to PDF
          </button>
        </div>
      </div>
    </div>
  );
}
