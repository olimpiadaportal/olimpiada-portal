import { supabase } from './supabase';
import {
  StudentStats,
  DailyStat,
  SubjectAnalytics,
  TimePeriod,
  ChartDataPoint,
} from '../types/analytics';

export interface TimingPerformanceRow {
  subject_id: string;
  subject_name: string;
  subject_name_en?: string | null;
  subject_name_az?: string | null;
  topic_name: string | null;
  subtopic_id: string | null;
  subtopic_name: string | null;
  total_attempts: number;
  answered_attempts: number;
  skipped_attempts: number;
  correct_attempts: number;
  accuracy: number | null;
  avg_time_seconds: number | null;
  median_time_seconds: number | null;
  p95_time_seconds: number | null;
  avg_expected_seconds?: number | null;
  easy_attempts?: number;
  medium_attempts?: number;
  hard_attempts?: number;
  fast_count: number;
  normal_count: number;
  slow_count: number;
  very_slow_count: number;
  last_attempted: string | null;
}

let analyticsDataVersion = 0;

class AnalyticsService {
  markAnalyticsDataChanged(): number {
    analyticsDataVersion += 1;
    return analyticsDataVersion;
  }

  getAnalyticsDataVersion(): number {
    return analyticsDataVersion;
  }

  /**
   * Fetch student statistics for a given time period
   */
  async fetchStudentStats(
    studentId: string,
    timePeriod: TimePeriod = '30D'
  ): Promise<StudentStats> {
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timePeriod) {
        case '7D':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30D':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90D':
          startDate.setDate(endDate.getDate() - 90);
          break;
      }

      // Fetch daily stats for the period
      const { data: dailyStats, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('student_id', studentId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;

      // Fetch student data for streak info
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('current_streak, best_streak, last_active_date')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;

      // Calculate aggregated stats (includes best_streak from database)
      const stats = this.calculateAggregatedStats(
        dailyStats || [],
        studentData
      );

      return stats;
    } catch (error) {
      console.error('Error fetching student stats:', error);
      throw error;
    }
  }

  /**
   * Calculate aggregated statistics from daily stats
   */
  private calculateAggregatedStats(
    dailyStats: DailyStat[],
    studentData: any
  ): StudentStats {
    const totalQuestionsAttempted = dailyStats.reduce(
      (sum, stat) => sum + (stat.questions_attempted || 0),
      0
    );
    const totalQuestionsCorrect = dailyStats.reduce(
      (sum, stat) => sum + (stat.questions_correct || 0),
      0
    );
    const totalStudyTimeMinutes = dailyStats.reduce(
      (sum, stat) => sum + (stat.study_time_minutes || 0),
      0
    );
    const practiceSessions = dailyStats.reduce(
      (sum, stat) => sum + (stat.practice_sessions || 0),
      0
    );
    const mockExamsCompleted = dailyStats.reduce(
      (sum, stat) => sum + (stat.exams_completed || 0),
      0
    );
    const activeDays = dailyStats.filter((stat) => stat.is_active).length;

    const overallAccuracy =
      totalQuestionsAttempted > 0
        ? (totalQuestionsCorrect / totalQuestionsAttempted) * 100
        : 0;

    const avgDailyStudyTime =
      activeDays > 0 ? totalStudyTimeMinutes / activeDays : 0;
    const avgDailyQuestions =
      activeDays > 0 ? totalQuestionsAttempted / activeDays : 0;
    const avgDailyAccuracy = overallAccuracy;

    return {
      overallAccuracy: Math.round(overallAccuracy * 10) / 10,
      totalStudyTimeMinutes,
      totalQuestionsAttempted,
      totalQuestionsCorrect,
      currentStreak: Math.max(studentData?.current_streak || 0, 0),
      bestStreak: Math.max(studentData?.best_streak || 0, 0),
      lastActiveDate: studentData?.last_active_date || null,
      avgDailyStudyTime: Math.round(avgDailyStudyTime),
      avgDailyQuestions: Math.round(avgDailyQuestions),
      avgDailyAccuracy: Math.round(avgDailyAccuracy * 10) / 10,
      practiceSessions,
      mockExamsCompleted,
      activeDays,
    };
  }

  /**
   * Calculate best streak from all-time data
   */
  private async calculateBestStreak(studentId: string): Promise<number> {
    try {
      // Fetch ALL daily stats (not just time period)
      const { data: allStats, error } = await supabase
        .from('daily_stats')
        .select('date, is_active')
        .eq('student_id', studentId)
        .eq('is_active', true)
        .order('date', { ascending: true });

      if (error) throw error;
      if (!allStats || allStats.length === 0) return 0;

      // Calculate longest consecutive streak
      let maxStreak = 0;
      let currentStreak = 0;
      let previousDate: Date | null = null;

      for (const stat of allStats) {
        const currentDate = new Date(stat.date);

        if (previousDate === null) {
          currentStreak = 1;
        } else {
          const dayDiff = Math.floor(
            (currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (dayDiff === 1) {
            currentStreak++;
          } else {
            maxStreak = Math.max(maxStreak, currentStreak);
            currentStreak = 1;
          }
        }

        previousDate = currentDate;
      }

      maxStreak = Math.max(maxStreak, currentStreak);
      return maxStreak;
    } catch (error) {
      console.error('Error calculating best streak:', error);
      return 0;
    }
  }

  /**
   * Fetch daily stats for chart display
   */
  async fetchDailyStats(
    studentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyStat[]> {
    try {
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('student_id', studentId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      throw error;
    }
  }

  /**
   * Fetch subject-wise analytics
   */
  async fetchSubjectAnalytics(
    studentId: string,
    timePeriod: TimePeriod = '30D'
  ): Promise<SubjectAnalytics[]> {
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timePeriod) {
        case '7D':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30D':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90D':
          startDate.setDate(endDate.getDate() - 90);
          break;
      }

      // Fetch study progress for subjects
      const { data: progressData, error } = await supabase
        .from('study_progress')
        .select(`
          *,
          subjects (
            id,
            name_en,
            name_az
          )
        `)
        .eq('student_id', studentId);

      if (error) throw error;

      // Fetch practice sessions for the time period
      // Note: practice_sessions uses user_id, not student_id
      // We need to get the user_id from the student record first
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('user_id')
        .eq('id', studentId)
        .single();

      if (studentError) throw studentError;

      const { data: sessions, error: sessionsError } = await supabase
        .from('practice_sessions')
        .select('subject_id, completed_at')
        .eq('user_id', studentData.user_id)
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString())
        .not('completed_at', 'is', null);

      if (sessionsError) throw sessionsError;

      // Calculate analytics per subject
      const subjectAnalytics: SubjectAnalytics[] = (progressData || []).map((progress: any) => {
        const accuracy =
          progress.questions_attempted > 0
            ? (progress.questions_correct / progress.questions_attempted) * 100
            : 0;

        // Find last practice session for this subject
        const subjectSessions = (sessions || []).filter(
          (s: any) => s.subject_id === progress.subject_id
        );
        const lastPracticed =
          subjectSessions.length > 0
            ? subjectSessions[subjectSessions.length - 1].completed_at
            : null;

        return {
          subject_id: progress.subject_id,
          subject_name: progress.subjects?.name_en || 'Unknown',
          questions_attempted: progress.questions_attempted || 0,
          questions_correct: progress.questions_correct || 0,
          accuracy: Math.round(accuracy * 10) / 10,
          study_time_minutes: Math.round((progress.study_time || 0) / 60), // Convert seconds to minutes
          last_practiced: lastPracticed,
        };
      });

      // Sort by accuracy (lowest first for identifying weak topics)
      return subjectAnalytics.sort((a, b) => a.accuracy - b.accuracy);
    } catch (error) {
      console.error('Error fetching subject analytics:', error);
      throw error;
    }
  }

  /**
   * Fetch per-subject/topic timing performance from the canonical analytics RPC.
   * SQL 104 owns authorization and duplicate-answer handling.
   */
  async fetchTimingPerformance(
    studentId: string,
    timePeriod: TimePeriod = '30D',
    subjectId?: string | null
  ): Promise<TimingPerformanceRow[]> {
    const periodDays = timePeriod === '7D' ? 7 : timePeriod === '30D' ? 30 : 90;

    try {
      const { data, error } = await (supabase as any).rpc('get_student_timing_performance', {
        p_student_id: studentId,
        p_period_days: periodDays,
        p_subject_id: subjectId ?? null,
      });

      if (error) throw error;
      return (data || []) as TimingPerformanceRow[];
    } catch (error) {
      console.warn('Timing performance load error (non-fatal):', error);
      return [];
    }
  }

  /**
   * Prepare chart data for study time
   */
  prepareStudyTimeChartData(dailyStats: DailyStat[], locale: string = 'en-US'): ChartDataPoint[] {
    return dailyStats.map((stat) => ({
      date: stat.date,
      value: stat.study_time_minutes || 0,
      label: new Date(stat.date).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      }),
    }));
  }

  /**
   * Prepare chart data for accuracy
   */
  prepareAccuracyChartData(dailyStats: DailyStat[], locale: string = 'en-US'): ChartDataPoint[] {
    return dailyStats.map((stat) => {
      const accuracy =
        stat.questions_attempted > 0
          ? (stat.questions_correct / stat.questions_attempted) * 100
          : 0;

      return {
        date: stat.date,
        value: Math.round(accuracy * 10) / 10,
        label: new Date(stat.date).toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
        }),
      };
    });
  }

  /**
   * Get student ID from user ID
   */
  async getStudentIdFromUserId(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Error getting student ID:', error);
      return null;
    }
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
