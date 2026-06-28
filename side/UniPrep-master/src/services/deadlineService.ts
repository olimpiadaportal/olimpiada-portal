import { supabase } from './supabase';

export interface Deadline {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  daysLeft: number;
  type: 'exam' | 'assignment' | 'goal' | 'custom';
  priority: 'high' | 'medium' | 'low';
  isCompleted: boolean;
  isOverdue: boolean;
  urgencyLevel: 'urgent' | 'soon' | 'upcoming' | 'later';
}

class DeadlineService {
  /**
   * Get upcoming deadlines for a student
   */
  async getUpcomingDeadlines(studentId: string, limit: number = 5): Promise<Deadline[]> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_completed', false)
        .gte('reminder_date', today)
        .order('reminder_date', { ascending: true })
        .limit(limit);

      if (error) throw error;
      if (!reminders) return [];

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date);
        
        return {
          id: reminder.id,
          title: reminder.title,
          description: reminder.description,
          date: reminder.reminder_date,
          time: reminder.reminder_time,
          daysLeft,
          type: reminder.type,
          priority: reminder.priority,
          isCompleted: reminder.is_completed,
          isOverdue: daysLeft < 0,
          urgencyLevel: this.getUrgencyLevel(daysLeft),
        };
      });
    } catch (error) {
      console.error('Get upcoming deadlines error:', error);
      return [];
    }
  }

  /**
   * Get all deadlines including completed and overdue
   */
  async getAllDeadlines(studentId: string): Promise<Deadline[]> {
    try {
      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      if (!reminders) return [];

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date);
        
        return {
          id: reminder.id,
          title: reminder.title,
          description: reminder.description,
          date: reminder.reminder_date,
          time: reminder.reminder_time,
          daysLeft,
          type: reminder.type,
          priority: reminder.priority,
          isCompleted: reminder.is_completed,
          isOverdue: daysLeft < 0 && !reminder.is_completed,
          urgencyLevel: this.getUrgencyLevel(daysLeft),
        };
      });
    } catch (error) {
      console.error('Get all deadlines error:', error);
      return [];
    }
  }

  /**
   * Create a new reminder/deadline
   */
  async createReminder(
    studentId: string,
    title: string,
    date: string,
    type: 'exam' | 'assignment' | 'goal' | 'custom',
    priority: 'high' | 'medium' | 'low' = 'medium',
    description?: string,
    time?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('study_reminders')
        .insert({
          student_id: studentId,
          title,
          description,
          reminder_date: date,
          reminder_time: time,
          type,
          priority,
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Create reminder error:', error);
      return false;
    }
  }

  /**
   * Update a reminder
   */
  async updateReminder(
    reminderId: string,
    updates: {
      title?: string;
      description?: string;
      reminder_date?: string;
      reminder_time?: string;
      type?: 'exam' | 'assignment' | 'goal' | 'custom';
      priority?: 'high' | 'medium' | 'low';
      is_completed?: boolean;
    }
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('study_reminders')
        .update(updates)
        .eq('id', reminderId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update reminder error:', error);
      return false;
    }
  }

  /**
   * Mark a reminder as completed
   */
  async completeReminder(reminderId: string): Promise<boolean> {
    return this.updateReminder(reminderId, { is_completed: true });
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(reminderId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('study_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Delete reminder error:', error);
      return false;
    }
  }

  /**
   * Get deadlines by type
   */
  async getDeadlinesByType(
    studentId: string,
    type: 'exam' | 'assignment' | 'goal' | 'custom'
  ): Promise<Deadline[]> {
    try {
      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .eq('type', type)
        .eq('is_completed', false)
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      if (!reminders) return [];

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date);
        
        return {
          id: reminder.id,
          title: reminder.title,
          description: reminder.description,
          date: reminder.reminder_date,
          time: reminder.reminder_time,
          daysLeft,
          type: reminder.type,
          priority: reminder.priority,
          isCompleted: reminder.is_completed,
          isOverdue: daysLeft < 0,
          urgencyLevel: this.getUrgencyLevel(daysLeft),
        };
      });
    } catch (error) {
      console.error('Get deadlines by type error:', error);
      return [];
    }
  }

  /**
   * Get overdue deadlines
   */
  async getOverdueDeadlines(studentId: string): Promise<Deadline[]> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_completed', false)
        .lt('reminder_date', today)
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      if (!reminders) return [];

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date);
        
        return {
          id: reminder.id,
          title: reminder.title,
          description: reminder.description,
          date: reminder.reminder_date,
          time: reminder.reminder_time,
          daysLeft,
          type: reminder.type,
          priority: reminder.priority,
          isCompleted: reminder.is_completed,
          isOverdue: true,
          urgencyLevel: 'urgent' as const,
        };
      });
    } catch (error) {
      console.error('Get overdue deadlines error:', error);
      return [];
    }
  }

  /**
   * Get deadline statistics
   */
  async getDeadlineStats(studentId: string): Promise<{
    total: number;
    upcoming: number;
    overdue: number;
    completed: number;
    byType: Record<string, number>;
  }> {
    try {
      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId);

      if (error) throw error;
      if (!reminders) {
        return { total: 0, upcoming: 0, overdue: 0, completed: 0, byType: {} };
      }

      const today = new Date().toISOString().split('T')[0];
      
      const stats = {
        total: reminders.length,
        upcoming: 0,
        overdue: 0,
        completed: 0,
        byType: {} as Record<string, number>,
      };

      reminders.forEach(reminder => {
        // Count by status
        if (reminder.is_completed) {
          stats.completed++;
        } else if (reminder.reminder_date < today) {
          stats.overdue++;
        } else {
          stats.upcoming++;
        }

        // Count by type
        stats.byType[reminder.type] = (stats.byType[reminder.type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Get deadline stats error:', error);
      return { total: 0, upcoming: 0, overdue: 0, completed: 0, byType: {} };
    }
  }

  /**
   * Calculate days left until deadline
   */
  private calculateDaysLeft(dateString: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const deadline = new Date(dateString);
    deadline.setHours(0, 0, 0, 0);
    
    const diffTime = deadline.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get urgency level based on days left
   */
  private getUrgencyLevel(daysLeft: number): 'urgent' | 'soon' | 'upcoming' | 'later' {
    if (daysLeft < 0) return 'urgent'; // Overdue
    if (daysLeft <= 2) return 'urgent'; // 0-2 days
    if (daysLeft <= 7) return 'soon'; // 3-7 days
    if (daysLeft <= 14) return 'upcoming'; // 8-14 days
    return 'later'; // 15+ days
  }

  /**
   * Get color for urgency level
   */
  getUrgencyColor(urgencyLevel: 'urgent' | 'soon' | 'upcoming' | 'later'): string {
    switch (urgencyLevel) {
      case 'urgent':
        return '#EF4444'; // Red
      case 'soon':
        return '#F59E0B'; // Orange
      case 'upcoming':
        return '#3B82F6'; // Blue
      case 'later':
        return '#10B981'; // Green
      default:
        return '#6B7280'; // Gray
    }
  }

  /**
   * Get icon for deadline type
   */
  getTypeIcon(type: 'exam' | 'assignment' | 'goal' | 'custom'): string {
    switch (type) {
      case 'exam':
        return 'school';
      case 'assignment':
        return 'document-text';
      case 'goal':
        return 'flag';
      case 'custom':
        return 'calendar';
      default:
        return 'calendar';
    }
  }

  /**
   * Alias for createReminder - more intuitive for deadlines
   */
  async createDeadline(
    studentId: string,
    deadline: {
      title: string;
      description?: string | null;
      date: string;
      time?: string | null;
      type: 'exam' | 'assignment' | 'goal' | 'custom';
      priority: 'high' | 'medium' | 'low';
    }
  ): Promise<boolean> {
    return this.createReminder(
      studentId,
      deadline.title,
      deadline.date,
      deadline.type,
      deadline.priority,
      deadline.description || undefined,
      deadline.time || undefined
    );
  }
}

export const deadlineService = new DeadlineService();
