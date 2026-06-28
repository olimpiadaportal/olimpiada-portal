/**
 * Analytics Service
 * 
 * Provides comprehensive analytics data for the admin dashboard
 * Includes student analytics, content analytics, and system analytics
 * 
 * Phase 6 Enhancement: Added caching layer for improved performance
 */

import { supabase } from '@/lib/supabase';
import { analyticsCache } from '@/lib/cache/analyticsCache';
import { withTiming } from '@/lib/observability/timing';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface DateRange {
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
}

export interface EngagementMetrics {
  dau: number;  // Daily Active Users
  wau: number;  // Weekly Active Users
  mau: number;  // Monthly Active Users
  avgSessionDuration: number; // in minutes
  retentionRates: {
    day1: number;
    day7: number;
    day30: number;
  };
  totalSessions: number;
  avgSessionsPerUser: number;
  trends?: Array<{
    date: string;
    activeUsers: number;
  }>;
}

export interface PerformanceMetrics {
  avgAccuracy: number;
  avgScore: number;
  improvementRate: number;
  totalQuestionsAttempted: number;
  totalStudyTime: number; // in minutes
  subjectPerformance: Array<{
    subjectId: string;
    subjectName: string;
    accuracy: number;
    questionsAttempted: number;
    avgScore: number;
    studyTime: number;
  }>;
}

export interface StudentSegments {
  highPerformers: number;    // >80% accuracy
  struggling: number;        // <50% accuracy
  inactive: number;          // no activity in 7 days
  powerUsers: number;        // daily active
  atRisk: number;           // declining performance
  total: number;
}

export interface CohortData {
  cohortName: string;
  totalStudents: number;
  activeStudents: number;
  avgAccuracy: number;
  avgQuestionsAttempted: number;
  retentionRate: number;
}

export interface QuestionPerformance {
  questionId: string;
  questionText: string;
  subjectName: string;
  difficulty: string;
  accuracy: number;
  attempts: number;
  skipRate: number;
  avgTimeToAnswer: number;
  needsReview: boolean;
}

export interface SubjectFilterOption {
  id: string;
  name_en: string;
  name_az?: string | null;
}

export interface FeedbackReporter {
  user_id: string;
  name: string;
  created_at: string;
  comment: string | null;
}

export interface QuestionFeedbackItem {
  id: string;
  question_id: string;
  question_text: string;
  subject_name: string;
  difficulty: string;
  topic: string;
  feedback_type: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  total_reports: number;
  reporters: FeedbackReporter[];
}

export interface ExamAnalytics {
  examId: string;
  examName: string;
  examType: string;
  targetGroup: string;
  totalAttempts: number;
  completionRate: number;
  avgScore: number;
  avgDuration: number;
  passRate: number;
}

export interface SystemMetrics {
  performance: {
    avgResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    uptime: number;
  };
  usage: {
    peakHour: number;
    totalRequests: number;
    uniqueUsers: number;
  };
  errors: {
    totalErrors: number;
    criticalErrors: number;
    recentErrors: Array<{
      timestamp: string;
      type: string;
      message: string;
    }>;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// ANALYTICS SERVICE CLASS
// ============================================

class AnalyticsService {
  
  // ============================================
  // STUDENT ANALYTICS
  // ============================================

  /**
   * Get engagement metrics for a date range
   * Phase 6: Added caching for improved performance
   */
  async getEngagementMetrics(
    dateRange: DateRange
  ): Promise<ApiResponse<EngagementMetrics>> {
    try {
      const cacheKey = analyticsCache.engagementKey(dateRange);
      
      // Try to get from cache
      const result = await analyticsCache.getOrFetch(
        cacheKey,
        async () => {
          const { data, error } = await withTiming('analytics.admin_get_engagement_metrics', async () =>
            await supabase.rpc('admin_get_engagement_metrics', {
              p_start_date: dateRange.startDate,
              p_end_date: dateRange.endDate,
            })
          );

          if (error) throw error;

          return {
            success: true,
            data: data as EngagementMetrics,
          };
        },
        analyticsCache.getTTL('default')
      );

      return result as ApiResponse<EngagementMetrics>;
    } catch (error) {
      console.error('Get engagement metrics error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get engagement metrics',
      };
    }
  }

  /**
   * Get performance metrics for a date range
   * Phase 6: Added caching for improved performance
   */
  async getPerformanceMetrics(
    dateRange: DateRange,
    subjectId?: string
  ): Promise<ApiResponse<PerformanceMetrics>> {
    try {
      const cacheKey = analyticsCache.performanceKey(dateRange) + (subjectId ? `:${subjectId}` : '');
      
      const result = await analyticsCache.getOrFetch(
        cacheKey,
        async () => {
          const { data, error } = await withTiming('analytics.admin_get_performance_metrics', async () =>
            await supabase.rpc('admin_get_performance_metrics', {
              p_start_date: dateRange.startDate,
              p_end_date: dateRange.endDate,
              p_subject_id: subjectId || null,
            })
          );

          if (error) throw error;

          return {
            success: true,
            data: data as PerformanceMetrics,
          };
        },
        analyticsCache.getTTL('default')
      );

      return result as ApiResponse<PerformanceMetrics>;
    } catch (error) {
      console.error('Get performance metrics error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get performance metrics',
      };
    }
  }

  /**
   * Get student segments
   * Phase 6: Added caching for improved performance
   */
  async getStudentSegments(): Promise<ApiResponse<StudentSegments>> {
    try {
      const cacheKey = 'student_segments:all';
      
      const result = await analyticsCache.getOrFetch(
        cacheKey,
        async () => {
          const { data, error } = await withTiming('analytics.admin_get_student_segments', async () =>
            await supabase.rpc('admin_get_student_segments')
          );

          if (error) throw error;

          return {
            success: true,
            data: data as StudentSegments,
          };
        },
        analyticsCache.getTTL('long') // Segments change less frequently
      );

      return result as ApiResponse<StudentSegments>;
    } catch (error) {
      console.error('Get student segments error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get student segments',
      };
    }
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(
    cohortType: 'registration_date' | 'city' | 'target_group',
    dateRange: DateRange
  ): Promise<ApiResponse<CohortData[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_cohort_analysis', {
        p_cohort_type: cohortType,
        p_start_date: dateRange.startDate,
        p_end_date: dateRange.endDate,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as CohortData[],
      };
    } catch (error) {
      console.error('Get cohort analysis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cohort analysis',
      };
    }
  }

  // ============================================
  // CONTENT ANALYTICS
  // ============================================

  /**
   * Get subjects for content analytics filters.
   * The canonical subjects table does not have an is_active column.
   */
  async getSubjectFilterOptions(): Promise<ApiResponse<SubjectFilterOption[]>> {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (error) throw error;

      return {
        success: true,
        data: (data || []) as SubjectFilterOption[],
      };
    } catch (error) {
      console.error('Get subject filter options error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get subjects',
      };
    }
  }

  /**
   * Get question performance data
   */
  async getQuestionPerformance(
    filters?: {
      subjectId?: string;
      difficulty?: string;
      needsReview?: boolean;
      limit?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<ApiResponse<QuestionPerformance[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_question_performance', {
        p_subject_id: filters?.subjectId || null,
        p_difficulty: filters?.difficulty || null,
        p_needs_review: filters?.needsReview || null,
        p_limit: filters?.limit || 100,
        p_start_date: filters?.startDate || null,
        p_end_date: filters?.endDate || null,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as QuestionPerformance[],
      };
    } catch (error) {
      console.error('Get question performance error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get question performance',
      };
    }
  }

  /**
   * Get exam analytics
   */
  async getExamAnalytics(
    examId?: string,
    dateRange?: DateRange
  ): Promise<ApiResponse<ExamAnalytics[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_exam_analytics', {
        p_exam_id: examId || null,
        p_start_date: dateRange?.startDate || null,
        p_end_date: dateRange?.endDate || null,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as ExamAnalytics[],
      };
    } catch (error) {
      console.error('Get exam analytics error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get exam analytics',
      };
    }
  }

  /**
   * Get content quality issues
   */
  async getContentQualityIssues(): Promise<ApiResponse<QuestionPerformance[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_content_quality_issues');

      if (error) throw error;

      return {
        success: true,
        data: data as QuestionPerformance[],
      };
    } catch (error) {
      console.error('Get content quality issues error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get content quality issues',
      };
    }
  }

  // ============================================
  // QUESTION FEEDBACK
  // ============================================

  async getQuestionFeedback(): Promise<ApiResponse<QuestionFeedbackItem[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_question_feedback_grouped');

      if (error) throw error;

      return {
        success: true,
        data: (data as QuestionFeedbackItem[]) || [],
      };
    } catch (error) {
      console.error('Get question feedback error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get question feedback',
      };
    }
  }

  async updateFeedbackGroup(
    questionId: string,
    feedbackType: string,
    status: string,
    adminNotes?: string
  ): Promise<ApiResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_update_feedback_group', {
        p_question_id: questionId,
        p_feedback_type: feedbackType,
        p_status: status,
        p_admin_notes: adminNotes || null,
      });

      if (error) throw error;

      return { success: true, data: data as boolean };
    } catch (error) {
      console.error('Update feedback group error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update feedback',
      };
    }
  }

  // ============================================
  // SYSTEM ANALYTICS
  // ============================================

  /**
   * Get system metrics
   */
  async getSystemMetrics(
    dateRange: DateRange
  ): Promise<ApiResponse<SystemMetrics>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_system_metrics', {
        p_start_date: dateRange.startDate,
        p_end_date: dateRange.endDate,
      });

      if (error) throw error;

      return {
        success: true,
        data: data as SystemMetrics,
      };
    } catch (error) {
      console.error('Get system metrics error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get system metrics',
      };
    }
  }

  // ============================================
  // DASHBOARD OVERVIEW
  // ============================================

  /**
   * Get overview data for main dashboard
   */
  async getDashboardOverview(
    dateRange: DateRange
  ): Promise<ApiResponse<{
    engagement: EngagementMetrics;
    performance: PerformanceMetrics;
    segments: StudentSegments;
    topQuestions: QuestionPerformance[];
    recentExams: ExamAnalytics[];
  }>> {
    try {
      // Fetch all data in parallel
      // Note: Recent exams shows all exams (not filtered by date) to ensure data is visible
      const [engagement, performance, segments, questions, exams] = await Promise.all([
        this.getEngagementMetrics(dateRange),
        this.getPerformanceMetrics(dateRange),
        this.getStudentSegments(),
        this.getQuestionPerformance({ limit: 10, needsReview: true }),
        this.getExamAnalytics(),
      ]);

      // Check for errors
      if (!engagement.success || !performance.success || !segments.success || 
          !questions.success || !exams.success) {
        throw new Error('Failed to fetch dashboard data');
      }

      return {
        success: true,
        data: {
          engagement: engagement.data!,
          performance: performance.data!,
          segments: segments.data!,
          topQuestions: questions.data!,
          recentExams: exams.data!.slice(0, 5),
        },
      };
    } catch (error) {
      console.error('Get dashboard overview error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get dashboard overview',
      };
    }
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Get date range presets
   */
  getDateRangePreset(preset: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth'): DateRange {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case 'today':
        return {
          startDate: today.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: yesterday.toISOString().split('T')[0],
          endDate: yesterday.toISOString().split('T')[0],
        };
      
      case 'last7days':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        return {
          startDate: last7.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      
      case 'last30days':
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        return {
          startDate: last30.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      
      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          startDate: monthStart.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      
      case 'lastMonth':
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          startDate: lastMonthStart.toISOString().split('T')[0],
          endDate: lastMonthEnd.toISOString().split('T')[0],
        };
      
      default:
        return this.getDateRangePreset('last7days');
    }
  }

  /**
   * Format large numbers for display
   */
  formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /**
   * Format percentage for display
   */
  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  /**
   * Format duration for display
   */
  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
