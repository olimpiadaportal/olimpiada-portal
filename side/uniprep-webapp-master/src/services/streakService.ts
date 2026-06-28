/**
 * Streak Service for Webapp
 * Manages student streak updates after activities
 * Mirrors mobile app implementation
 */

import { createClient } from '@/lib/supabase/client'

interface StreakUpdateResult {
  newStreak: number
  status: 'active' | 'at_risk' | 'lost'
  message: string
  isNewRecord: boolean
}

class StreakService {
  /**
   * Update streak after any activity
   * Call this immediately after practice/quiz/exam/competitive session completion
   */
  async updateStreakRealtime(
    activityType: 'practice' | 'exam' | 'competitive'
  ): Promise<StreakUpdateResult | null> {
    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return null
      }

      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (studentError || !student) {
        return null
      }

      // Call streak update function
      const { data, error } = await supabase.rpc('update_streak_on_activity', {
        p_student_id: student.id,
        p_activity_type: activityType,
      })

      if (error) {
        return null
      }

      const result = data?.[0]
      if (!result) {
        return null
      }

      return {
        newStreak: result.new_streak,
        status: result.streak_status,
        message: result.message,
        isNewRecord: result.message?.includes('New record') || false,
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Get current streak status
   */
  async getStreakStatus(): Promise<{
    currentStreak: number
    bestStreak: number
    status: 'active' | 'at_risk' | 'lost'
    hoursUntilLoss: number
  } | null> {
    try {
      const supabase = createClient()
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!student) return null

      const { data, error } = await supabase.rpc('get_streak_status', {
        p_student_id: student.id,
      })

      if (error || !data?.[0]) return null

      const status = data[0]
      return {
        currentStreak: status.current_streak,
        bestStreak: status.best_streak,
        status: status.streak_status,
        hoursUntilLoss: status.hours_until_loss,
      }
    } catch (error) {
      return null
    }
  }
}

export const streakService = new StreakService()
