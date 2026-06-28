import { createClient } from "@/lib/supabase/client"

export interface Activity {
  id: string
  type: 'practice' | 'exam' | 'booking'
  title: string
  subtitle: string
  timestamp: string
  icon: string
  color: string
  metadata?: any
}

class ActivityService {
  /**
   * Get recent activity for a student
   * Combines practice sessions, exam attempts, and bookings
   */
  async getRecentActivity(userId: string, studentId: string, limit: number = 10): Promise<Activity[]> {
    try {
      const activities: Activity[] = []
      const supabase = createClient()

      // Fetch practice sessions
      const { data: practiceSessions } = await supabase
        .from('practice_sessions')
        .select('id, correct_answers, total_questions, completed_at, subjects(name_en)')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(5)

      if (practiceSessions) {
        practiceSessions.forEach((session: any) => {
          const accuracy = session.total_questions > 0 
            ? Math.round((session.correct_answers / session.total_questions) * 100) 
            : 0

          activities.push({
            id: session.id,
            type: 'practice',
            title: `Practice: ${session.subjects?.name_en || 'Quiz'}`,
            subtitle: `Score: ${session.correct_answers}/${session.total_questions} (${accuracy}%)`,
            timestamp: session.completed_at,
            icon: 'document-text',
            color: accuracy >= 70 ? '#10B981' : accuracy >= 50 ? '#F59E0B' : '#EF4444',
            metadata: { score: session.correct_answers, total: session.total_questions, accuracy },
          })
        })
      }

      // Fetch exam attempts
      const { data: examAttempts } = await supabase
        .from('mock_exam_attempts')
        .select('id, total_score, percentage, completed_at, mock_exams(title, exam_type)')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(5)

      if (examAttempts) {
        examAttempts.forEach((attempt: any) => {
          const percentage = attempt.percentage || 0
          const totalScore = attempt.total_score || 0

          activities.push({
            id: attempt.id,
            type: 'exam',
            title: `Exam: ${attempt.mock_exams?.title || 'Mock Exam'}`,
            subtitle: `Score: ${totalScore} (${Math.round(percentage)}%)`,
            timestamp: attempt.completed_at,
            icon: 'clipboard',
            color: percentage >= 70 ? '#10B981' : percentage >= 50 ? '#F59E0B' : '#EF4444',
            metadata: { score: totalScore, percentage },
          })
        })
      }

      // Fetch recent bookings (wrapped in try-catch as bookings table may not exist yet)
      try {
        const { data: bookings, error: bookingsError } = await supabase
          .from('bookings')
          .select('id, status, scheduled_date, created_at, teacher_id')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (!bookingsError && bookings) {
          bookings.forEach((booking: any) => {
            activities.push({
              id: booking.id,
              type: 'booking',
              title: `__BOOKING_WITH_TEACHER__`,
              subtitle: `__STATUS__: ${booking.status}`,
              timestamp: booking.created_at,
              icon: 'calendar',
              color: booking.status === 'confirmed' ? '#10B981' : booking.status === 'pending' ? '#F59E0B' : '#6B7280',
              metadata: { status: booking.status, sessionDate: booking.scheduled_date },
            })
          })
        }
      } catch (bookingError) {
        // Bookings table may not exist or have different schema - silently skip
      }

      // Sort by timestamp (most recent first) and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)
    } catch (error) {
      return []
    }
  }

  /**
   * Get latest practice and exam results only
   */
  async getLatestResults(userId: string, studentId: string): Promise<Activity[]> {
    return this.getRecentActivity(userId, studentId, 5)
  }
}

export const activityService = new ActivityService()
