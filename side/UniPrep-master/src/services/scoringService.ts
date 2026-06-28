import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';

interface ScoreUpdateResult {
  newELO: number;
  eloChange: number;
  // Preserved visible leaderboard score. Generic scoring updates ELO/history
  // only; official exam RPCs own leaderboard point changes.
  monthlyScore: number;
  activityMultiplier: number;
  bonusPoints: number;
  transactionId?: string;
}

interface StudentScoreData {
  eloRating: number;
  monthlyScore: number;
  activityMultiplier: number;
  bonusPoints: number;
  currentStreak: number;
  bestStreak: number;
}

type DifficultyLevel = 'easy' | 'medium' | 'hard';
type TransactionType =
  | 'exam_completion'
  | 'quiz_completion'
  | 'admin_adjustment'
  | 'monthly_decay';

class ScoringService {
  /**
   * Update internal ELO/history after quiz-style activity.
   * This does not publish visible leaderboard points; official Elmly exams do
   * that through update_leaderboard_score_after_exam.
   */
  async updateScore(
    examScore: number,
    difficulty: DifficultyLevel = 'medium',
    transactionType: TransactionType = 'exam_completion'
  ): Promise<ScoreUpdateResult | null> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      const { data, error } = await supabase.rpc('update_student_score', {
        p_student_id: student.id,
        p_exam_score: examScore,
        p_difficulty: difficulty,
        p_transaction_type: transactionType,
      });

      if (error) throw error;

      const result = data[0];

      console.log('✅ Score updated:', {
        newELO: result.new_elo,
        change: result.elo_change,
        visibleLeaderboardScore: result.total_score,
      });

      return {
        newELO: result.new_elo,
        eloChange: result.elo_change,
        monthlyScore: result.total_score,
        activityMultiplier: result.activity_mult,
        bonusPoints: result.bonus_pts,
      };
    } catch (error) {
      console.error('Error updating score:', error);
      throw error;
    }
  }

  /**
   * Get current student score data
   */
  async getScoreData(): Promise<StudentScoreData | null> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data, error } = await supabase
        .from('students')
        .select(`
          elo_rating,
          monthly_score,
          activity_multiplier,
          bonus_points,
          current_streak,
          best_streak
        `)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        eloRating: data.elo_rating || 1200,
        monthlyScore: data.monthly_score || 0,
        activityMultiplier: data.activity_multiplier || 1.0,
        bonusPoints: data.bonus_points || 0,
        currentStreak: Math.max(data.current_streak || 0, 0),
        bestStreak: Math.max(data.best_streak || 0, 0),
      };
    } catch (error) {
      console.error('Error getting score data:', error);
      return null;
    }
  }

  /**
   * Get score data for a specific student (for viewing other users)
   */
  async getScoreDataForStudent(studentId: string): Promise<StudentScoreData | null> {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          elo_rating,
          monthly_score,
          activity_multiplier,
          bonus_points,
          current_streak,
          best_streak
        `)
        .eq('id', studentId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        eloRating: data.elo_rating || 1200,
        monthlyScore: data.monthly_score || 0,
        activityMultiplier: data.activity_multiplier || 1.0,
        bonusPoints: data.bonus_points || 0,
        currentStreak: Math.max(data.current_streak || 0, 0),
        bestStreak: Math.max(data.best_streak || 0, 0),
      };
    } catch (error) {
      console.error('Error getting score data for student:', error);
      return null;
    }
  }

  /**
   * Get score history/transactions
   */
  async getScoreHistory(limit: number = 50): Promise<any[]> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) return [];

      const { data, error } = await supabase
        .from('score_transactions')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting score history:', error);
      return [];
    }
  }

  /**
   * Calculate expected difficulty based on exam percentage
   * This helps determine appropriate difficulty level
   */
  getDifficultyFromPercentage(percentage: number): DifficultyLevel {
    if (percentage >= 80) return 'hard';
    if (percentage >= 50) return 'medium';
    return 'easy';
  }

  /**
   * Format ELO rating for display
   */
  formatELO(elo: number): string {
    return elo.toLocaleString();
  }

  /**
   * Get ELO rating tier/badge
   * Tiers are based on ELO rating, not leaderboard rank
   */
  getELOTier(elo: number): { name: string; color: string; icon: string } {
    if (elo >= 1700) return { name: 'Master', color: '#9333EA', icon: '👑' };
    if (elo >= 1500) return { name: 'Diamond', color: '#3B82F6', icon: '💎' };
    if (elo >= 1300) return { name: 'Platinum', color: '#10B981', icon: '⭐' };
    if (elo >= 1150) return { name: 'Gold', color: '#F59E0B', icon: '🥇' };
    if (elo >= 1000) return { name: 'Silver', color: '#6B7280', icon: '🥈' };
    return { name: 'Bronze', color: '#92400E', icon: '🥉' };
  }

  /**
   * Format score change for display
   */
  formatScoreChange(change: number): string {
    if (change > 0) return `+${change}`;
    return change.toString();
  }

  /**
   * Get color for score change
   */
  getScoreChangeColor(change: number): string {
    if (change > 0) return '#10B981'; // Green
    if (change < 0) return '#EF4444'; // Red
    return '#6B7280'; // Gray
  }
}

export const scoringService = new ScoringService();
