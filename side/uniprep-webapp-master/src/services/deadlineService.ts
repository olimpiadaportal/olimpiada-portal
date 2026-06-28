import { createClient } from "@/lib/supabase/client"

export interface Deadline {
  id: string
  title: string
  description: string | null
  date: string
  time: string | null
  daysLeft: number
  type: 'exam' | 'assignment' | 'goal' | 'custom'
  priority: 'high' | 'medium' | 'low'
  isCompleted: boolean
  isOverdue: boolean
  urgencyLevel: 'urgent' | 'soon' | 'upcoming' | 'later'
}

class DeadlineService {
  /**
   * Get upcoming deadlines for a student
   */
  async getUpcomingDeadlines(studentId: string, limit: number = 5): Promise<Deadline[]> {
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_completed', false)
        .gte('reminder_date', today)
        .order('reminder_date', { ascending: true })
        .limit(limit)

      if (error) {
        console.error('Get upcoming deadlines error:', error)
        return []
      }

      if (!reminders) return []

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date)
        
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
        }
      })
    } catch (error) {
      console.error('Get upcoming deadlines error:', error)
      return []
    }
  }

  /**
   * Get all deadlines including completed and overdue
   */
  async getAllDeadlines(studentId: string): Promise<Deadline[]> {
    try {
      const supabase = createClient()

      const { data: reminders, error } = await supabase
        .from('study_reminders')
        .select('*')
        .eq('student_id', studentId)
        .order('reminder_date', { ascending: true })

      if (error) {
        console.error('Get all deadlines error:', error)
        return []
      }

      if (!reminders) return []

      return reminders.map(reminder => {
        const daysLeft = this.calculateDaysLeft(reminder.reminder_date)
        
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
        }
      })
    } catch (error) {
      console.error('Get all deadlines error:', error)
      return []
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
    priority: 'high' | 'medium' | 'low',
    description?: string,
    time?: string
  ): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('study_reminders')
        .insert({
          student_id: studentId,
          title,
          description: description || null,
          reminder_date: date,
          reminder_time: time || null,
          type,
          priority,
          is_completed: false,
        })

      if (error) {
        console.error('Create reminder error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Create reminder error:', error)
      return false
    }
  }

  /**
   * Mark a deadline as completed
   */
  async completeDeadline(deadlineId: string): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('study_reminders')
        .update({ is_completed: true })
        .eq('id', deadlineId)

      if (error) {
        console.error('Complete deadline error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Complete deadline error:', error)
      return false
    }
  }

  /**
   * Delete a deadline
   */
  async deleteDeadline(deadlineId: string): Promise<boolean> {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('study_reminders')
        .delete()
        .eq('id', deadlineId)

      if (error) {
        console.error('Delete deadline error:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Delete deadline error:', error)
      return false
    }
  }

  /**
   * Calculate days left until deadline
   */
  private calculateDaysLeft(deadlineDate: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const deadline = new Date(deadlineDate)
    deadline.setHours(0, 0, 0, 0)
    
    const diffTime = deadline.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    return diffDays
  }

  /**
   * Get urgency level based on days left
   */
  private getUrgencyLevel(daysLeft: number): 'urgent' | 'soon' | 'upcoming' | 'later' {
    if (daysLeft < 0) return 'urgent' // Overdue
    if (daysLeft <= 2) return 'urgent'
    if (daysLeft <= 7) return 'soon'
    if (daysLeft <= 14) return 'upcoming'
    return 'later'
  }
}

export const deadlineService = new DeadlineService()
