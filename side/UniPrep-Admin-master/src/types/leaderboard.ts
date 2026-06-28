// ============================================
// LEADERBOARD TYPES
// ============================================

export type ResetType = 'soft' | 'hard' | 'seasonal';

export interface LeaderboardSeason {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  reset_type?: ResetType;
  reset_percentage?: number;
  archived_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ScoreAdjustment {
  id: string;
  student_id: string;
  old_elo: number;
  new_elo: number;
  adjustment: number;
  reason: string;
  adjusted_by?: string;
  created_at: string;
  // Joined data
  student_name?: string;
  admin_name?: string;
}

export interface ScoringConfig {
  elo_base: { value: number };
  elo_min: { value: number };
  elo_max: { value: number };
  k_factor_new: { value: number };
  k_factor_regular: { value: number };
  k_factor_experienced: { value: number };
  decay_enabled: { value: boolean };
  decay_percentage: { value: number };
  streak_multiplier: { value: number };
  achievement_bonus: { value: number };
  consistency_bonus: { value: number };
}

export interface ScoringConfigItem {
  id: string;
  config_key: string;
  config_value: { value: number | boolean };
  description?: string;
  updated_by?: string;
  updated_at: string;
  created_at: string;
}

export interface ResetOptions {
  type: ResetType;
  percentage?: number; // For soft resets
  seasonName?: string; // For seasonal resets
  seasonDescription?: string;
}

export interface LeaderboardStats {
  total_students: number;
  avg_elo: number;
  highest_elo: number;
  lowest_elo: number;
  top_performers: Array<{
    student_id: string;
    full_name: string;
    elo_rating: number;
    rank: number;
  }>;
}
