import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';
import {
  StudentGoal,
  DailyProgress,
  DailyGoalStatus,
  GoalSettingFormData,
} from '../types/goals';

class GoalService {
  // ============================================
  // GOALS CRUD
  // ============================================

  /**
   * Get the current student's goals
   */
  async getGoals(studentId: string): Promise<StudentGoal | null> {
    try {
      const { data, error } = await supabase
        .from('student_goals')
        .select('*')
        .eq('student_id', studentId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching goals:', error);
        throw error;
      }

      return data as StudentGoal | null;
    } catch (error) {
      console.error('Error in getGoals:', error);
      return null;
    }
  }

  /**
   * Create or update student goals (upsert)
   */
  async saveGoals(studentId: string, formData: GoalSettingFormData): Promise<StudentGoal | null> {
    try {
      const goalData = {
        student_id: studentId,
        daily_question_target: formData.dailyQuestionTarget,
        daily_time_target_minutes: formData.dailyTimeTargetMinutes,
        target_exam_date: formData.targetExamDate
          ? formData.targetExamDate.toISOString().split('T')[0]
          : null,
        target_score: formData.targetScore,
        preferred_study_days: formData.preferredStudyDays,
        preferred_study_time: formData.preferredStudyTime,
      };

      const { data, error } = await supabase
        .from('student_goals')
        .upsert(goalData, { onConflict: 'student_id' })
        .select()
        .single();

      if (error) {
        console.error('Error saving goals:', error);
        throw error;
      }

      return data as StudentGoal;
    } catch (error) {
      console.error('Error in saveGoals:', error);
      return null;
    }
  }

  // ============================================
  // DAILY PROGRESS
  // ============================================

  /**
   * Get today's daily progress for a student
   */
  async getTodayProgress(studentId: string): Promise<DailyProgress | null> {
    try {
      const today = this.getLocalDateString();

      const { data, error } = await supabase
        .from('daily_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', today)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching today progress:', error);
        throw error;
      }

      return data as DailyProgress | null;
    } catch (error) {
      console.error('Error in getTodayProgress:', error);
      return null;
    }
  }

  /**
   * Get daily progress for a date range (for weekly/monthly views)
   */
  async getProgressRange(
    studentId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyProgress[]> {
    try {
      const { data, error } = await supabase
        .from('daily_progress')
        .select('*')
        .eq('student_id', studentId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching progress range:', error);
        throw error;
      }

      return (data || []) as DailyProgress[];
    } catch (error) {
      console.error('Error in getProgressRange:', error);
      return [];
    }
  }

  /**
   * Record progress after a practice session or exam completion.
   * Uses the server-side upsert_daily_progress RPC for atomic accumulation.
   */
  async recordProgress(
    studentId: string,
    questionsAttempted: number,
    questionsCorrect: number,
    timeSpentMinutes: number
  ): Promise<DailyProgress | null> {
    try {
      const { data, error } = await supabase.rpc('upsert_daily_progress', {
        p_student_id: studentId,
        p_questions: questionsAttempted,
        p_correct: questionsCorrect,
        p_time_minutes: timeSpentMinutes,
      });

      if (error) {
        console.error('Error recording progress:', error);
        throw error;
      }

      return data as DailyProgress | null;
    } catch (error) {
      console.error('Error in recordProgress:', error);
      return null;
    }
  }

  // ============================================
  // GOAL STATUS (computed from goals + progress)
  // ============================================

  /**
   * Get the current daily goal status (combines goals + today's progress)
   */
  async getDailyGoalStatus(studentId: string): Promise<DailyGoalStatus> {
    try {
      const [goals, progress] = await Promise.all([
        this.getGoals(studentId),
        this.getTodayProgress(studentId),
      ]);

      const questionsTarget = goals?.daily_question_target ?? 20;
      const timeTarget = goals?.daily_time_target_minutes ?? 30;
      const questionsCompleted = progress?.questions_completed ?? 0;
      const timeSpentMinutes = progress?.time_spent_minutes ?? 0;
      const accuracy = progress?.accuracy ?? 0;

      const questionGoalMet = questionsCompleted >= questionsTarget;
      const timeGoalMet = timeSpentMinutes >= timeTarget;

      // Progress percentage: average of question and time progress, capped at 100
      const questionProgress = Math.min((questionsCompleted / questionsTarget) * 100, 100);
      const timeProgress = Math.min((timeSpentMinutes / timeTarget) * 100, 100);
      const progressPercentage = Math.round((questionProgress + timeProgress) / 2);

      return {
        questionsCompleted,
        questionsTarget,
        timeSpentMinutes,
        timeTarget,
        accuracy,
        questionGoalMet,
        timeGoalMet,
        bothGoalsMet: questionGoalMet && timeGoalMet,
        progressPercentage,
      };
    } catch (error) {
      console.error('Error in getDailyGoalStatus:', error);
      return {
        questionsCompleted: 0,
        questionsTarget: 20,
        timeSpentMinutes: 0,
        timeTarget: 30,
        accuracy: 0,
        questionGoalMet: false,
        timeGoalMet: false,
        bothGoalsMet: false,
        progressPercentage: 0,
      };
    }
  }

  /**
   * Get the consecutive days the student has met their goals
   */
  async getGoalStreak(studentId: string): Promise<number> {
    try {
      const today = this.getLocalDateString();
      // Fetch last 30 days of progress, ordered descending
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = this.dateToString(thirtyDaysAgo);

      const { data, error } = await supabase
        .from('daily_progress')
        .select('date, question_goal_met, time_goal_met')
        .eq('student_id', studentId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return 0;

      // Count consecutive days where both goals were met, starting from today/yesterday
      let streak = 0;
      const expectedDate = new Date();

      // If today has no entry yet, start from yesterday
      if (data.length === 0 || data[0].date !== today) {
        expectedDate.setDate(expectedDate.getDate() - 1);
      }

      for (const entry of data) {
        const entryDate = this.dateToString(expectedDate);
        if (entry.date !== entryDate) break;
        if (entry.question_goal_met && entry.time_goal_met) {
          streak++;
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      console.error('Error in getGoalStreak:', error);
      return 0;
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private getLocalDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export const goalService = new GoalService();
