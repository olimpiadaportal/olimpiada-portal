// Lazy Loading Chart Components
// Phase 6: Performance Optimization - Reduce initial bundle size

'use client';

import { lazy, Suspense } from 'react';
import { ChartSkeleton } from '@/components/ui/LoadingSkeleton';

// Lazy load chart components
export const EngagementChart = lazy(() => 
  import('@/components/analytics/EngagementChart').then(mod => ({ default: mod.EngagementChart }))
);

export const PerformanceChart = lazy(() => 
  import('@/components/analytics/PerformanceChart').then(mod => ({ default: mod.PerformanceChart }))
);

export const EngagementTrendChart = lazy(() => 
  import('@/components/analytics/EngagementTrendChart').then(mod => ({ default: mod.EngagementTrendChart }))
);

export const CohortComparisonChart = lazy(() => 
  import('@/components/analytics/CohortComparisonChart').then(mod => ({ default: mod.CohortComparisonChart }))
);

export const StudentSegmentsPie = lazy(() => 
  import('@/components/analytics/StudentSegmentsPie').then(mod => ({ default: mod.StudentSegmentsPie }))
);

export const ExamPerformanceChart = lazy(() => 
  import('@/components/analytics/ExamPerformanceChart').then(mod => ({ default: mod.ExamPerformanceChart }))
);

export const SubjectPerformanceChart = lazy(() => 
  import('@/components/analytics/SubjectPerformanceChart').then(mod => ({ default: mod.SubjectPerformanceChart }))
);

// Wrapper components with Suspense
export function LazyEngagementChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <EngagementChart {...props} />
    </Suspense>
  );
}

export function LazyPerformanceChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <PerformanceChart {...props} />
    </Suspense>
  );
}

export function LazyEngagementTrendChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <EngagementTrendChart {...props} />
    </Suspense>
  );
}

export function LazyCohortComparisonChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <CohortComparisonChart {...props} />
    </Suspense>
  );
}

export function LazyStudentSegmentsPie(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <StudentSegmentsPie {...props} />
    </Suspense>
  );
}

export function LazyExamPerformanceChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <ExamPerformanceChart {...props} />
    </Suspense>
  );
}

export function LazySubjectPerformanceChart(props: any) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <SubjectPerformanceChart {...props} />
    </Suspense>
  );
}
