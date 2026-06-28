/**
 * Study Plan Service - Web App
 * Phase 1: Goal Setting & Study Plans
 * Mirrors mobile app studyPlanService.ts
 */

import { createClient } from '@/lib/supabase/client'
import { StudyPlan, StudyPlanWeek, StudentGoal } from '@/types/goals'

class StudyPlanService {
  // ============================================
  // PLAN CRUD
  // ============================================

  async getActivePlan(studentId: string): Promise<StudyPlan | null> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('study_plans')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active plan:', error)
        throw error
      }

      if (!data) return null

      const planData = data as any
      const { data: weeks, error: weeksError } = await supabase
        .from('study_plan_weeks' as any)
        .select('*')
        .eq('plan_id', planData.id)
        .order('week_number', { ascending: true })

      if (weeksError) {
        console.error('Error fetching plan weeks:', weeksError)
      }

      return {
        ...planData,
        weeks: (weeks || []) as StudyPlanWeek[],
      } as StudyPlan
    } catch (error) {
      console.error('Error in getActivePlan:', error)
      return null
    }
  }

  async getAllPlans(studentId: string): Promise<StudyPlan[]> {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('study_plans')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching all plans:', error)
        throw error
      }

      return (data || []) as StudyPlan[]
    } catch (error) {
      console.error('Error in getAllPlans:', error)
      return []
    }
  }

  // ============================================
  // PLAN MANAGEMENT
  // ============================================

  getCurrentWeek(plan: StudyPlan): StudyPlanWeek | null {
    if (!plan.weeks || plan.weeks.length === 0) return null

    const today = new Date()
    const todayStr = this.dateToString(today)

    return plan.weeks.find(
      w => todayStr >= w.start_date && todayStr <= w.end_date
    ) || plan.weeks[0]
  }

  async abandonActivePlan(studentId: string): Promise<void> {
    try {
      const supabase = createClient()
      await (supabase
        .from('study_plans') as any)
        .update({ status: 'abandoned' })
        .eq('student_id', studentId)
        .eq('status', 'active')
    } catch (error) {
      console.error('Error abandoning plan:', error)
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private dateToString(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
}

export const studyPlanService = new StudyPlanService()
