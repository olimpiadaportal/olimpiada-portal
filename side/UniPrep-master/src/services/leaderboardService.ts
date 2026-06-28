import { supabase } from './supabase';
import { withTiming } from '../utils/timing';

// ============================================
// TYPES
// ============================================

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  score: number;
  monthly_score: number;
  streak: number;
  city: string;
  rank: number;
}

export interface StudentRank {
  rank: number;
  total: number;
  value: number;
}

export interface LeaderboardScoreUpdate {
  newLeaderboardScore: number;
  examComponent: number;
  practiceComponent: number;
  streakComponent: number;
}

export type RankType = 'score' | 'streak';
export type LeaderboardScope = 'city' | 'national';

// ============================================
// LEADERBOARD SERVICE
// ============================================

class LeaderboardService {
  // Expose supabase for direct queries if needed
  public supabase = supabase;

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
      console.log(`📊 Fetching ${city} ${rankType} leaderboard...`);

      const { data, error } = await withTiming('leaderboard.get_city_leaderboard', async () =>
        await supabase.rpc('get_city_leaderboard', {
          p_city: city,
          p_rank_type: rankType,
          p_limit: limit,
        })
      );

      if (error) {
        console.error('Error fetching city leaderboard:', error);
        throw error;
      }

      console.log(`✅ Fetched ${data?.length || 0} entries`);
      return data || [];
    } catch (error) {
      console.error('Error in fetchCityLeaderboard:', error);
      return [];
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
      console.log(`📊 Fetching national ${rankType} leaderboard...`);

      const { data, error } = await withTiming('leaderboard.get_national_leaderboard', async () =>
        await supabase.rpc('get_national_leaderboard', {
          p_rank_type: rankType,
          p_limit: limit,
        })
      );

      if (error) {
        console.error('Error fetching national leaderboard:', error);
        throw error;
      }

      console.log(`✅ Fetched ${data?.length || 0} entries`);
      return data || [];
    } catch (error) {
      console.error('Error in fetchNationalLeaderboard:', error);
      return [];
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
      console.log(`📊 Fetching student rank (${scope}, ${rankType})...`);

      const { data, error } = await withTiming('leaderboard.get_student_rank', async () =>
        await supabase.rpc('get_student_rank', {
          p_student_id: studentId,
          p_rank_type: rankType,
          p_scope: scope,
        })
      );

      if (error) {
        console.error('Error fetching student rank:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('⚠️ Student not ranked yet');
        return null;
      }

      console.log(`✅ Student rank: #${data[0].rank} out of ${data[0].total}`);
      return data[0];
    } catch (error) {
      console.error('Error in getStudentRank:', error);
      return null;
    }
  }

  /**
   * Update student's leaderboard score after exam completion.
   * Delegates entirely to the server-side SECURITY DEFINER function which:
   *   - Validates the caller owns the student record (anti-spoofing)
   *   - Validates the attempt is genuinely completed (anti-fabrication)
   *   - Applies the official-exam leaderboard formula
   *   - Publishes visible leaderboard points atomically
   * The client can no longer write leaderboard_score or monthly_score directly.
   *
   * @param studentId  - Student UUID (must belong to the calling user)
   * @param attemptId  - Completed mock_exam_attempts UUID
   */
  async updateLeaderboardScore(
    studentId: string,
    attemptId: string
  ): Promise<LeaderboardScoreUpdate | null> {
    try {
      console.log('� Updating leaderboard score (server-side)...');

      const { data, error } = await withTiming('leaderboard.update_score_after_exam', async () =>
        await supabase.rpc('update_leaderboard_score_after_exam', {
          p_student_id: studentId,
          p_attempt_id: attemptId,
        })
      );

      if (error) {
        console.error('Error updating leaderboard score:', error);
        throw error;
      }

      const result = data?.[0];
      if (!result) return null;

      console.log('🏆 Leaderboard score updated:', {
        score: result.new_leaderboard_score,
        exam: result.exam_component,
        practice: result.practice_component,
        streak: result.streak_component,
      });

      return {
        newLeaderboardScore: result.new_leaderboard_score,
        examComponent: result.exam_component,
        practiceComponent: result.practice_component,
        streakComponent: result.streak_component,
      };
    } catch (error) {
      console.error('Error in updateLeaderboardScore:', error);
      throw error;
    }
  }

  /**
   * Check if student is opted in to leaderboard
   * @param userId - User ID
   * @returns Boolean indicating opt-in status
   */
  async isOptedIn(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('show_in_leaderboard')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

      if (error) {
        console.error('Error checking opt-in status:', error);
        return true; // Default to opted in
      }

      // If no settings row exists yet, default to opted in
      if (!data) {
        return true;
      }

      return data.show_in_leaderboard ?? true;
    } catch (error) {
      console.error('Error in isOptedIn:', error);
      return true;
    }
  }

  /**
   * Update opt-in status
   * @param userId - User ID
   * @param optIn - Boolean indicating opt-in status
   */
  async updateOptInStatus(userId: string, optIn: boolean): Promise<void> {
    try {
      console.log('🔒 Updating leaderboard opt-in status:', optIn);

      const { error } = await supabase
        .from('user_settings')
        .update({ show_in_leaderboard: optIn })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating opt-in status:', error);
        throw error;
      }

      console.log('✅ Opt-in status updated successfully');
    } catch (error) {
      console.error('Error in updateOptInStatus:', error);
      throw error;
    }
  }
}

export const leaderboardService = new LeaderboardService();
