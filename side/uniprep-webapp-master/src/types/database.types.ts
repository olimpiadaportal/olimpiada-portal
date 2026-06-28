export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          user_type: 'student' | 'teacher' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          phone?: string | null
          avatar_url?: string | null
          user_type: 'student' | 'teacher' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string | null
          avatar_url?: string | null
          user_type?: 'student' | 'teacher' | 'admin'
          created_at?: string
          updated_at?: string
        }
      }
      students: {
        Row: {
          id: string
          user_id: string
          target_group: string
          city: string
          elo_rating: number
          current_streak: number
          best_streak: number
          monthly_score: number
          last_active_date: string | null
          leaderboard_score: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          target_group: string
          city: string
          elo_rating?: number
          current_streak?: number
          best_streak?: number
          monthly_score?: number
          last_active_date?: string | null
          leaderboard_score?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          target_group?: string
          city?: string
          elo_rating?: number
          current_streak?: number
          best_streak?: number
          monthly_score?: number
          last_active_date?: string | null
          leaderboard_score?: number
          created_at?: string
        }
      }
      teachers: {
        Row: {
          id: string
          user_id: string
          bio: string | null
          specializations: string[]
          hourly_rate: number
          rating: number
          is_verified: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          bio?: string | null
          specializations?: string[]
          hourly_rate?: number
          rating?: number
          is_verified?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          bio?: string | null
          specializations?: string[]
          hourly_rate?: number
          rating?: number
          is_verified?: boolean
          created_at?: string
        }
      }
      mock_exam_attempts: {
        Row: {
          id: string
          user_id: string
          mock_exam_id: string
          status: 'not_started' | 'in_progress' | 'completed'
          time_remaining_seconds: number
          total_score: number | null
          percentage: number | null
          started_at: string
          completed_at: string | null
          submitted_at: string | null
          analytics_updated: boolean | null
          leaderboard_score_updated_at: string | null
          question_ids: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          mock_exam_id: string
          status?: 'not_started' | 'in_progress' | 'completed'
          time_remaining_seconds: number
          total_score?: number | null
          percentage?: number | null
          started_at?: string
          completed_at?: string | null
          submitted_at?: string | null
          analytics_updated?: boolean | null
          leaderboard_score_updated_at?: string | null
          question_ids?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          mock_exam_id?: string
          status?: 'not_started' | 'in_progress' | 'completed'
          time_remaining_seconds?: number
          total_score?: number | null
          percentage?: number | null
          started_at?: string
          completed_at?: string | null
          submitted_at?: string | null
          analytics_updated?: boolean | null
          leaderboard_score_updated_at?: string | null
          question_ids?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      exam_answers: {
        Row: {
          id: string
          attempt_id: string
          question_id: string
          selected_answer: string
          is_marked: boolean
          answered_at: string
        }
        Insert: {
          id?: string
          attempt_id: string
          question_id: string
          selected_answer: string
          is_marked?: boolean
          answered_at?: string
        }
        Update: {
          id?: string
          attempt_id?: string
          question_id?: string
          selected_answer?: string
          is_marked?: boolean
          answered_at?: string
        }
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          show_in_leaderboard: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          show_in_leaderboard?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          show_in_leaderboard?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_city_leaderboard: {
        Args: {
          p_city: string
          p_rank_type: 'score' | 'streak'
          p_limit: number
        }
        Returns: Array<{
          id: string
          display_name: string
          score: number
          monthly_score: number
          streak: number
          city: string
          rank: number
        }>
      }
      get_national_leaderboard: {
        Args: {
          p_rank_type: 'score' | 'streak'
          p_limit: number
        }
        Returns: Array<{
          id: string
          display_name: string
          score: number
          monthly_score: number
          streak: number
          city: string
          rank: number
        }>
      }
      get_student_rank: {
        Args: {
          p_student_id: string
          p_rank_type: 'score' | 'streak'
          p_scope: 'city' | 'national'
        }
        Returns: Array<{
          rank: number
          total: number
          value: number
        }>
      }
      update_leaderboard_score_after_exam: {
        Args: {
          p_student_id: string
          p_attempt_id: string
        }
        Returns: Array<{
          new_leaderboard_score: number
          exam_component: number
          practice_component: number
          streak_component: number
        }>
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
