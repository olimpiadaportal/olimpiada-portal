import { supabase } from '@/lib/supabase';
import type { LeaderboardSeason, ScoreAdjustment, ScoringConfig, ResetOptions, LeaderboardStats } from '@/types/leaderboard';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export const leaderboardService = {
  /**
   * Get active season
   */
  async getActiveSeason(): Promise<ApiResponse<LeaderboardSeason | null>> {
    try {
      const { data, error } = await supabase.rpc('get_active_season');

      if (error) {
        console.error('Error getting active season:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as LeaderboardSeason | null,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getActiveSeason:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get all seasons
   */
  async getAllSeasons(): Promise<ApiResponse<LeaderboardSeason[]>> {
    try {
      const { data, error } = await supabase
        .from('leaderboard_seasons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting seasons:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as LeaderboardSeason[],
        error: null,
      };
    } catch (err) {
      console.error('Exception in getAllSeasons:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get scoring configuration
   */
  async getScoringConfig(): Promise<ApiResponse<ScoringConfig>> {
    try {
      const { data, error } = await supabase.rpc('get_scoring_config');

      if (error) {
        console.error('Error getting scoring config:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as ScoringConfig,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getScoringConfig:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update scoring configuration
   */
  async updateScoringConfig(
    configKey: string,
    value: number | boolean
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase
        .from('scoring_config')
        .update({
          config_value: { value },
          updated_at: new Date().toISOString(),
        })
        .eq('config_key', configKey)
        .select()
        .single();

      if (error) {
        console.error('Error updating scoring config:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateScoringConfig:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get score adjustments history
   */
  async getScoreAdjustments(
    studentId?: string,
    limit: number = 50
  ): Promise<ApiResponse<ScoreAdjustment[]>> {
    try {
      let query = supabase
        .from('score_adjustments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting score adjustments:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as ScoreAdjustment[],
        error: null,
      };
    } catch (err) {
      console.error('Exception in getScoreAdjustments:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Create score adjustment
   */
  async createScoreAdjustment(
    studentId: string,
    newElo: number,
    reason: string,
    adjustedBy: string
  ): Promise<ApiResponse<ScoreAdjustment>> {
    try {
      // Get current ELO
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('elo_rating')
        .eq('id', studentId)
        .single();

      if (studentError || !student) {
        return {
          success: false,
          error: 'Student not found',
          data: null,
        };
      }

      const oldElo = student.elo_rating;
      const adjustment = newElo - oldElo;

      // Create adjustment record
      const { data, error } = await supabase
        .from('score_adjustments')
        .insert({
          student_id: studentId,
          old_elo: oldElo,
          new_elo: newElo,
          adjustment,
          reason,
          adjusted_by: adjustedBy,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating score adjustment:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      // Update student's ELO
      const { error: updateError } = await supabase
        .from('students')
        .update({ elo_rating: newElo })
        .eq('id', studentId);

      if (updateError) {
        console.error('Error updating student ELO:', updateError);
        return {
          success: false,
          error: 'Failed to update student ELO',
          data: null,
        };
      }

      return {
        success: true,
        data: data as ScoreAdjustment,
        error: null,
      };
    } catch (err) {
      console.error('Exception in createScoreAdjustment:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get leaderboard stats
   */
  async getLeaderboardStats(): Promise<ApiResponse<LeaderboardStats>> {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, user_id, elo_rating')
        .order('elo_rating', { ascending: false });

      if (error) {
        console.error('Error getting leaderboard stats:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      const students = data || [];
      const eloRatings = students.map(s => s.elo_rating);

      const stats: LeaderboardStats = {
        total_students: students.length,
        avg_elo: eloRatings.length > 0 
          ? eloRatings.reduce((a, b) => a + b, 0) / eloRatings.length 
          : 0,
        highest_elo: eloRatings.length > 0 ? Math.max(...eloRatings) : 0,
        lowest_elo: eloRatings.length > 0 ? Math.min(...eloRatings) : 0,
        top_performers: [], // Will be populated with actual student data
      };

      return {
        success: true,
        data: stats,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getLeaderboardStats:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },
};
