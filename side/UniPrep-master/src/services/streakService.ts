import { supabase } from './supabase';
import { useAuthStore, StreakMilestone } from '../store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAK_SHOWN_DATE_KEY = '@elmly_streak_shown_date';

interface StreakUpdateResult {
  newStreak: number;
  status: 'active' | 'at_risk' | 'lost';
  message: string;
  isNewRecord: boolean;
}

interface StreakStatus {
  currentStreak: number;
  bestStreak: number;
  status: 'active' | 'at_risk' | 'lost';
  hoursUntilLoss: number;
  lastActivity: Date | null;
  freezeAvailable: boolean;
}

interface StreakHistoryEntry {
  id: string;
  streakValue: number;
  eventType: 'streak_gained' | 'streak_lost' | 'streak_frozen' | 'streak_recovered';
  timestamp: Date;
  notes: string | null;
}

// Milestone numbers that always trigger a full celebration
const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100]);

class StreakService {
  /**
   * Update streak after any activity.
   * Dispatches to authStore so HomeScreen animates immediately and
   * completion screens show the appropriate milestone overlay.
   */
  async updateStreakRealtime(
    activityType: 'practice' | 'exam' | 'competitive'
  ): Promise<StreakUpdateResult> {
    try {
      const { user, liveStreak: prevStreak } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      // Call streak update function
      const { data, error } = await supabase.rpc('update_streak_on_activity', {
        p_student_id: student.id,
        p_activity_type: activityType,
      });

      if (error) throw error;

      const result = data[0];
      const newStreak: number = result.new_streak;
      const status: 'active' | 'at_risk' | 'lost' = result.streak_status;
      const isNewRecord = result.message?.includes('New record') ?? false;

      // ── Dispatch to global store ──────────────────────────────────────────
      const { setLiveStreak, setStreakMilestone } = useAuthStore.getState();

      // Always update the live streak counter — triggers AnimatedNumber on HomeScreen
      setLiveStreak(newStreak);

      // Only show the celebration modal ONCE per day (first activity of the day)
      const celebrationType = await this.getCelebrationType(newStreak, prevStreak, status);
      if (celebrationType !== 'none') {
        const milestone: StreakMilestone = {
          newStreak,
          prevStreak,
          isNewRecord,
          status,
          message: result.message ?? '',
          celebrationType,
        };
        setStreakMilestone(milestone);
      }
      // ─────────────────────────────────────────────────────────────────────

      return {
        newStreak,
        status,
        message: result.message ?? '',
        isNewRecord,
      };
    } catch (error) {
      console.error('Error updating streak:', error);
      throw error;
    }
  }

  /**
   * Determine if we should show the streak celebration modal.
   * Returns 'celebrate' for first activity of the day (streak incremented),
   * 'lost' if streak was broken, or 'none' if same-day repeat.
   */
  private async getCelebrationType(
    newStreak: number,
    prevStreak: number,
    status: string
  ): Promise<'celebrate' | 'lost' | 'none'> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      const lastShown = await AsyncStorage.getItem(STREAK_SHOWN_DATE_KEY);
      if (lastShown === today) return 'none'; // Already shown today
    } catch {
      // AsyncStorage read failed — proceed with showing
    }

    let type: 'celebrate' | 'lost' | 'none' = 'none';

    if (status === 'lost' && newStreak === 1) {
      // Streak was broken, starting over
      type = 'lost';
    } else if (newStreak > prevStreak) {
      // First activity of the day — streak incremented
      type = 'celebrate';
    }

    if (type !== 'none') {
      try {
        await AsyncStorage.setItem(STREAK_SHOWN_DATE_KEY, today);
      } catch {
        // Non-critical — worst case, modal shows twice
      }
    }

    return type;
  }

  /**
   * Get current streak status
   * Shows time remaining before streak loss
   */
  async getStreakStatus(): Promise<StreakStatus> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      // Get streak status
      const { data, error } = await supabase.rpc('get_streak_status', {
        p_student_id: student.id,
      });

      if (error) throw error;

      const status = data[0];

      return {
        currentStreak: status.current_streak,
        bestStreak: status.best_streak,
        status: status.streak_status,
        hoursUntilLoss: status.hours_until_loss,
        lastActivity: status.last_activity ? new Date(status.last_activity) : null,
        freezeAvailable: status.freeze_available,
      };
    } catch (error) {
      console.error('Error getting streak status:', error);
      throw error;
    }
  }

  /**
   * Use a streak freeze to protect current streak
   */
  async useStreakFreeze(): Promise<boolean> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      // Use freeze
      const { data, error } = await supabase.rpc('use_streak_freeze', {
        p_student_id: student.id,
      });

      if (error) throw error;

      if (data) {
        console.log('✅ Streak freeze used successfully');
      } else {
        console.log('❌ No streak freezes available');
      }

      return data;
    } catch (error) {
      console.error('Error using streak freeze:', error);
      throw error;
    }
  }

  /**
   * Attempt to recover lost streak (within 24h grace period)
   */
  async recoverStreak(): Promise<boolean> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      // Attempt recovery
      const { data, error } = await supabase.rpc('recover_streak', {
        p_student_id: student.id,
      });

      if (error) throw error;

      if (data) {
        console.log('✅ Streak recovered successfully');
      } else {
        console.log('❌ Streak recovery failed (outside 24h window)');
      }

      return data;
    } catch (error) {
      console.error('Error recovering streak:', error);
      throw error;
    }
  }

  /**
   * Get streak history
   */
  async getStreakHistory(limit: number = 50): Promise<StreakHistoryEntry[]> {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error('No user found');

      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError) throw studentError;
      if (!student) throw new Error('Student not found');

      // Get history
      const { data, error } = await supabase
        .from('streak_history')
        .select('*')
        .eq('student_id', student.id)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map((entry) => ({
        id: entry.id,
        streakValue: entry.streak_value,
        eventType: entry.event_type,
        timestamp: new Date(entry.timestamp),
        notes: entry.notes,
      }));
    } catch (error) {
      console.error('Error getting streak history:', error);
      throw error;
    }
  }

  /**
   * Subscribe to streak changes (real-time)
   * Returns an unsubscribe function
   */
  subscribeToStreakChanges(
    callback: (streak: number, status: string) => void
  ): () => void {
    const { user } = useAuthStore.getState();
    if (!user?.id) {
      // Silently return empty function - user not logged in is expected during logout
      return () => {};
    }

    // Store channel reference for cleanup
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isSubscribed = true;

    // Get student ID first
    supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single()
      .then(({ data: student }) => {
        if (!student || !isSubscribed) return;

        channel = supabase
          .channel(`streak:${student.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'students',
              filter: `id=eq.${student.id}`,
            },
            (payload: any) => {
              if (isSubscribed) {
                callback(payload.new.current_streak, 'updated');
              }
            }
          )
          .subscribe();
      });

    // Return cleanup function that will work even if subscription is still pending
    return () => {
      isSubscribed = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }

  /**
   * Show streak notification (to be implemented with your notification system)
   */
  private showStreakNotification(result: any) {
    // TODO: Integrate with your notification/toast system
    console.log('🔥 Streak Update:', result.message);

    // Example: If you have a toast system
    // toast.success(result.message, {
    //   icon: result.message.includes('New record') ? '🎉' : '🔥',
    // });
  }

  /**
   * Format time remaining for display
   * Handles negative values gracefully (streak already expired)
   * @param hours - Number of hours remaining
   * @param t - Optional translation function for localized output
   */
  formatTimeRemaining(hours: number, t?: (key: string, options?: any) => string): string {
    // Handle negative or zero hours - streak has expired
    if (hours <= 0) {
      return t ? t('streak.time.zeroHours') : '0 hours';
    }
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.floor(hours % 24);
      if (remainingHours > 0) {
        return t 
          ? t('streak.time.daysAndHours', { days, hours: remainingHours })
          : `${days}d ${remainingHours}h`;
      }
      return t 
        ? t('streak.time.days', { count: days })
        : `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours >= 1) {
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours - wholeHours) * 60);
      if (minutes > 0) {
        return t 
          ? t('streak.time.hoursAndMinutes', { hours: wholeHours, minutes })
          : `${wholeHours}h ${minutes}m`;
      }
      return t 
        ? t('streak.time.hours', { count: wholeHours })
        : `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
    } else {
      // Less than 1 hour - show minutes
      const minutes = Math.max(1, Math.round(hours * 60));
      return t 
        ? t('streak.time.minutes', { count: minutes })
        : `${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get streak emoji based on count
   */
  getStreakEmoji(streak: number): string {
    if (streak <= 0) return '💤';
    if (streak >= 100) return '🏆';
    if (streak >= 50) return '💎';
    if (streak >= 30) return '⭐';
    if (streak >= 14) return '🔥';
    if (streak >= 7) return '💪';
    if (streak >= 3) return '✨';
    return '🌱';
  }

  /**
   * Get streak color based on status
   */
  getStreakColor(status: 'active' | 'at_risk' | 'lost', streak?: number): string {
    if (streak !== undefined && streak === 0) return '#9CA3AF'; // Gray for unconfirmed
    switch (status) {
      case 'active':
        return '#10B981'; // Green
      case 'at_risk':
        return '#F59E0B'; // Orange
      case 'lost':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  }
}

export const streakService = new StreakService();
