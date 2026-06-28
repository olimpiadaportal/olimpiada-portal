/**
 * Goal Service - Web App
 * Phase 1: Goal Setting & Study Plans
 * Mirrors mobile app goalService.ts
 */

import { createClient } from '@/lib/supabase/client'
import {
  StudentGoal,
  DailyProgress,
  DailyGoalStatus,
  GoalSettingFormData,
} from '@/types/goals'

class GoalService {
  // ============================================
  // GOALS CRUD
  // ============================================

  async getGoals(studentId: string): Promise<StudentGoal | null> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('student_goals')
        .select('*')
        .eq('student_id', studentId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching goals:', error)
        throw error
      }

      return data as StudentGoal | null
    } catch (error) {
      console.error('Error in getGoals:', error)
      return null
    }
  }

  async saveGoals(studentId: string, formData: GoalSettingFormData): Promise<StudentGoal | null> {
    try {
      const supabase = createClient()
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
      }

      const { data, error } = await (supabase
        .from('student_goals') as any)
        .upsert(goalData, { onConflict: 'student_id' })
        .select()
        .single()

      if (error) {
        console.error('Error saving goals:', error)
        throw error
      }

      return data as StudentGoal
    } catch (error) {
      console.error('Error in saveGoals:', error)
      return null
    }
  }

  // ============================================
  // DAILY PROGRESS
  // ============================================

  async getTodayProgress(studentId: string): Promise<DailyProgress | null> {
    try {
      const supabase = createClient()
      const today = this.getLocalDateString()

      const { data, error } = await supabase
        .from('daily_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', today)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching today progress:', error)
        throw error
      }

      return data as DailyProgress | null
    } catch (error) {
      console.error('Error in getTodayProgress:', error)
      return null
    }
  }

  async getProgressRange(
    studentId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyProgress[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('daily_progress')
        .select('*')
        .eq('student_id', studentId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })

      if (error) {
        console.error('Error fetching progress range:', error)
        throw error
      }

      return (data || []) as DailyProgress[]
    } catch (error) {
      console.error('Error in getProgressRange:', error)
      return []
    }
  }

  async recordProgress(
    studentId: string,
    questionsAttempted: number,
    questionsCorrect: number,
    timeSpentMinutes: number
  ): Promise<DailyProgress | null> {
    try {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('upsert_daily_progress', {
        p_student_id: studentId,
        p_questions: questionsAttempted,
        p_correct: questionsCorrect,
        p_time_minutes: timeSpentMinutes,
      })

      if (error) {
        console.error('Error recording progress:', error)
        throw error
      }

      return data as DailyProgress | null
    } catch (error) {
      console.error('Error in recordProgress:', error)
      return null
    }
  }

  // ============================================
  // GOAL STATUS
  // ============================================

  async getDailyGoalStatus(studentId: string): Promise<DailyGoalStatus> {
    try {
      const [goals, progress] = await Promise.all([
        this.getGoals(studentId),
        this.getTodayProgress(studentId),
      ])

      const questionsTarget = goals?.daily_question_target ?? 20
      const timeTarget = goals?.daily_time_target_minutes ?? 30
      const questionsCompleted = progress?.questions_completed ?? 0
      const timeSpentMinutes = progress?.time_spent_minutes ?? 0
      const accuracy = progress?.accuracy ?? 0

      const questionGoalMet = questionsCompleted >= questionsTarget
      const timeGoalMet = timeSpentMinutes >= timeTarget

      const questionProgress = Math.min((questionsCompleted / questionsTarget) * 100, 100)
      const timeProgress = Math.min((timeSpentMinutes / timeTarget) * 100, 100)
      const progressPercentage = Math.round((questionProgress + timeProgress) / 2)

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
      }
    } catch (error) {
      console.error('Error in getDailyGoalStatus:', error)
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
      }
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private getLocalDateString(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

export const goalService = new GoalService()
