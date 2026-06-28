import { createClient } from '@/lib/supabase/client'
import { withTiming } from '@/lib/observability/timing'
import { Database } from '@/types/database.types'

// ============================================
// TYPES
// ============================================

export type RankType = 'score' | 'streak'
export type LeaderboardScope = 'city' | 'national'

export interface LeaderboardEntry {
  id: string
  display_name: string
  score: number
  monthly_score: number
  streak: number
  city: string
  rank: number
}

export interface StudentRank {
  rank: number
  total: number
  value: number
}

export interface LeaderboardScoreUpdate {
  newLeaderboardScore: number
  examComponent: number
  practiceComponent: number
  streakComponent: number
}

// ============================================
// LEADERBOARD SERVICE
// ============================================

class LeaderboardService {
  private supabase = createClient()

  /**
   * Fetch city-based leaderboard
   * @param city - City name
   * @param rankType - 'score' | 'streak'
   * @param limit - Number of results (default: 100)
   * @returns Array of ranked students
   */
  async fetchCityLeaderboard(
    city: string,
    rankType: RankType,
    limit: number = 100
  ): Promise<LeaderboardEntry[]> {
    try {
      const { data, error } = await withTiming('leaderboard.get_city_leaderboard', async () =>
        await this.supabase.rpc('get_city_leaderboard', {
          p_city: city,
          p_rank_type: rankType,
          p_limit: limit,
        })
      )

      if (error) {
        console.error('Error fetching city leaderboard:', error)
        throw error
      }

      return (data || []) as LeaderboardEntry[]
    } catch (error) {
      console.error('Error in fetchCityLeaderboard:', error)
      return []
    }
  }

  /**
   * Fetch national leaderboard
   * @param rankType - 'score' | 'streak'
   * @param limit - Number of results (default: 100)
   * @returns Array of ranked students
   */
  async fetchNationalLeaderboard(
    rankType: RankType,
    limit: number = 100
  ): Promise<LeaderboardEntry[]> {
    try {
      const { data, error } = await withTiming('leaderboard.get_national_leaderboard', async () =>
        await this.supabase.rpc('get_national_leaderboard', {
          p_rank_type: rankType,
          p_limit: limit,
        })
      )

      if (error) {
        console.error('Error fetching national leaderboard:', error)
        throw error
      }

      return (data || []) as LeaderboardEntry[]
    } catch (error) {
      console.error('Error in fetchNationalLeaderboard:', error)
      return []
    }
  }

  /**
   * Get current student's rank
   * @param studentId - Student ID
   * @param rankType - 'score' | 'streak'
   * @param scope - 'city' | 'national'
   * @returns Student's rank and total students
   */
  async getStudentRank(
    studentId: string,
    rankType: RankType,
    scope: LeaderboardScope
  ): Promise<StudentRank | null> {
    try {
      const { data, error } = await withTiming('leaderboard.get_student_rank', async () =>
        await this.supabase.rpc('get_student_rank', {
          p_student_id: studentId,
          p_rank_type: rankType,
          p_scope: scope,
        })
      )

      if (error) {
        console.error('Error fetching student rank:', error)
        throw error
      }

      if (!data || data.length === 0) {
        return null
      }

      return data[0] as StudentRank
    } catch (error) {
      console.error('Error in getStudentRank:', error)
      return null
    }
  }

  /**
   * Update student's leaderboard score after an official exam completion.
   * The database RPC validates ownership, attempt authenticity, teacher-exam exclusion,
   * and publishes visible leaderboard points. Practice, quiz, and competitive flows
   * must not write the main leaderboard directly.
   * @param studentId - Student ID owned by the current user
   * @param attemptId - Completed mock_exam_attempts ID
   */
  async updateLeaderboardScore(
    studentId: string,
    attemptId: string
  ): Promise<LeaderboardScoreUpdate | null> {
    try {
      const { data, error } = await withTiming('leaderboard.update_score_after_exam', async () =>
        await this.supabase.rpc('update_leaderboard_score_after_exam', {
          p_student_id: studentId,
          p_attempt_id: attemptId,
        })
      )

      if (error) {
        console.error('Error updating leaderboard score:', error)
        throw error
      }

      const result = data?.[0]
      if (!result) return null

      return {
        newLeaderboardScore: result.new_leaderboard_score,
        examComponent: result.exam_component,
        practiceComponent: result.practice_component,
        streakComponent: result.streak_component,
      }
    } catch (error) {
      console.error('Error in updateLeaderboardScore:', error)
      throw error
    }
  }

  /**
   * Check if student is opted in to leaderboard
   * @param userId - User ID
   * @returns Boolean indicating opt-in status
   */
  async isOptedIn(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('show_in_leaderboard')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        console.error('Error checking opt-in status:', error)
        return true // Default to opted in
      }

      // If no settings row exists yet, default to opted in
      if (!data) {
        return true
      }

      return data.show_in_leaderboard ?? true
    } catch (error) {
      console.error('Error in isOptedIn:', error)
      return true
    }
  }

  /**
   * Update opt-in status
   * @param userId - User ID
   * @param optIn - Boolean indicating opt-in status
   */
  async updateOptInStatus(userId: string, optIn: boolean): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('user_settings')
        .upsert({ 
          user_id: userId, 
          show_in_leaderboard: optIn 
        } satisfies Database['public']['Tables']['user_settings']['Insert'])

      if (error) {
        console.error('Error updating opt-in status:', error)
        throw error
      }
    } catch (error) {
      console.error('Error in updateOptInStatus:', error)
      throw error
    }
  }
}

export const leaderboardService = new LeaderboardService()
