import { supabase } from './supabase';
import { formatDistanceToNow } from 'date-fns';
import { az, ru, enUS } from 'date-fns/locale';
import i18n from '../i18n';
import { getSubjectTranslationKey } from '../utils/subjectTranslation';
import { GROUP_SCORING, ExamGroup, ExamType } from '../types/mockExam';

export interface Activity {
  id: string;
  type: 'quiz' | 'exam' | 'achievement' | 'session' | 'booking';
  title: string;
  subtitle: string;
  timestamp: string;
  relativeTime: string; // "2 hours ago", "yesterday"
  icon: string;
  color: string;
  metadata?: any; // Additional data specific to activity type
}

class ActivityService {
  /**
   * Get recent activity for a student
   * Combines quiz attempts, exam attempts, achievements, and study sessions
   * @param userId - Auth user ID (for practice_sessions and mock_exam_attempts)
   * @param studentId - Student record ID (for achievements, sessions, bookings)
   */
  async getRecentActivity(userId: string, studentId: string, limit: number = 10): Promise<Activity[]> {
    try {
      const activities: Activity[] = [];

      // Fetch all activity types in parallel
      const [quizzes, exams, achievements, sessions, bookings] = await Promise.all([
        this.getQuizActivity(userId, 5),
        this.getExamActivity(userId, 5),
        this.getAchievements(studentId, 5),
        this.getStudySessions(studentId, 5),
        this.getBookingActivity(studentId, 5),
      ]);

      // Combine all activities
      activities.push(...quizzes, ...exams, ...achievements, ...sessions, ...bookings);

      // Sort by timestamp (most recent first) and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Get recent activity error:', error);
      return [];
    }
  }

  /**
   * Get quiz/practice attempt activities
   */
  private async getQuizActivity(studentId: string, limit: number): Promise<Activity[]> {
    try {
      const { data: sessions, error } = await supabase
        .from('practice_sessions')
        .select('id, correct_answers, total_questions, completed_at, subjects(name_en, name_az)')
        .eq('user_id', studentId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Practice sessions query error:', error);
        return [];
      }

      if (!sessions || sessions.length === 0) {
        console.log('No practice sessions found for user:', studentId);
        return [];
      }

      console.log(`Found ${sessions.length} practice sessions`);

      return sessions.map((session: any) => {
        const accuracy = session.total_questions > 0 
          ? Math.round((session.correct_answers / session.total_questions) * 100) 
          : 0;

        // Use database subject names directly (name_az for Azerbaijani/Russian, name_en for English)
        const currentLang = i18n.language;
        const subjectName = session.subjects 
          ? (currentLang === 'az' || currentLang === 'ru' ? session.subjects.name_az : session.subjects.name_en)
          : i18n.t('home.components.recentActivity.quiz');

        return {
          id: session.id,
          type: 'quiz' as const,
          title: `${i18n.t('home.components.recentActivity.practice')}: ${subjectName}`,
          subtitle: `${i18n.t('home.components.recentActivity.score')}: ${session.correct_answers}/${session.total_questions} (${accuracy}%)`,
          timestamp: session.completed_at,
          relativeTime: this.getRelativeTime(session.completed_at),
          icon: 'document-text',
          color: accuracy >= 70 ? '#10B981' : accuracy >= 50 ? '#F59E0B' : '#EF4444',
          metadata: { score: session.correct_answers, total: session.total_questions, accuracy },
        };
      });
    } catch (error) {
      console.error('Get quiz activity error:', error);
      return [];
    }
  }

  /**
   * Get exam attempt activities
   */
  private async getExamActivity(userId: string, limit: number): Promise<Activity[]> {
    try {
      const { data: exams, error } = await supabase
        .from('mock_exam_attempts')
        .select('id, total_score, percentage, started_at, completed_at, mock_exams(title, total_questions, target_group, exam_type)')
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Exam activity query error:', error);
        return [];
      }

      if (!exams || exams.length === 0) {
        console.log('No exam attempts found for user:', userId);
        return [];
      }

      console.log(`Found ${exams.length} exam attempts`);

      return exams.map((exam: any) => {
        const percentage = exam.percentage || 0;
        const totalScore = exam.total_score || 0;

        // Determine max score based on exam type
        // SCORING RULES: 1st=300, 2nd=400, full=700 (combined)
        const examType = exam.mock_exams?.exam_type as ExamType | undefined;

        let maxScore: number;

        if (examType === 'first_stage') {
          maxScore = 300;
        } else if (examType === 'second_stage') {
          maxScore = 400;
        } else if (examType === 'full_exam') {
          maxScore = 700;
        } else {
          // Fallback to 300 for safety
          maxScore = 300;
        }

        return {
          id: exam.id,
          type: 'exam' as const,
          title: `${i18n.t('home.components.recentActivity.completed')} ${exam.mock_exams?.title || i18n.t('home.components.recentActivity.exam')}`,
          subtitle: `${i18n.t('home.components.recentActivity.score')}: ${totalScore.toFixed(1)}/${maxScore} (${percentage.toFixed(1)}%)`,
          timestamp: exam.completed_at || exam.started_at,
          relativeTime: this.getRelativeTime(exam.completed_at || exam.started_at),
          icon: 'school',
          color: percentage >= 70 ? '#10B981' : percentage >= 50 ? '#F59E0B' : '#EF4444',
          metadata: { score: totalScore, percentage },
        };
      });
    } catch (error) {
      console.error('Get exam activity error:', error);
      return [];
    }
  }

  /**
   * Get achievement activities
   */
  private async getAchievements(studentId: string, limit: number): Promise<Activity[]> {
    try {
      const { data: achievements } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('student_id', studentId)
        .order('earned_at', { ascending: false })
        .limit(limit);

      if (!achievements) return [];

      return achievements.map(achievement => ({
        id: achievement.id,
        type: 'achievement' as const,
        title: achievement.title,
        subtitle: achievement.description || 'Achievement unlocked!',
        timestamp: achievement.earned_at,
        relativeTime: this.getRelativeTime(achievement.earned_at),
        icon: achievement.icon || 'trophy',
        color: '#F59E0B',
        metadata: { type: achievement.achievement_type },
      }));
    } catch (error) {
      console.error('Get achievements error:', error);
      return [];
    }
  }

  /**
   * Get study session activities
   */
  private async getStudySessions(studentId: string, limit: number): Promise<Activity[]> {
    try {
      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('id, duration_minutes, questions_attempted, questions_correct, start_time, subjects(name_en)')
        .eq('student_id', studentId)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(limit);

      if (!sessions) return [];

      return sessions.map((session: any) => {
        const accuracy = session.questions_attempted > 0
          ? Math.round((session.questions_correct / session.questions_attempted) * 100)
          : 0;

        return {
          id: session.id,
          type: 'session' as const,
          title: `Studied ${session.subjects?.name_en || 'General'}`,
          subtitle: `${session.duration_minutes} min • ${session.questions_attempted} questions (${accuracy}%)`,
          timestamp: session.start_time,
          relativeTime: this.getRelativeTime(session.start_time),
          icon: 'book',
          color: '#3B82F6',
          metadata: { 
            duration: session.duration_minutes, 
            questions: session.questions_attempted,
            accuracy 
          },
        };
      });
    } catch (error) {
      console.error('Get study sessions error:', error);
      return [];
    }
  }

  /**
   * Get booking activities
   */
  private async getBookingActivity(studentId: string, limit: number): Promise<Activity[]> {
    try {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, status, scheduled_date, created_at, teachers(id), profiles!teachers(full_name)')
        .eq('student_id', studentId)
        .in('status', ['confirmed', 'completed'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!bookings) return [];

      return bookings.map((booking: any) => ({
        id: booking.id,
        type: 'booking' as const,
        title: i18n.t('home.components.recentActivity.bookingWithTeacher'),
        subtitle: `${i18n.t('common.status')}: ${i18n.t(`common.${booking.status}`)}`,
        timestamp: booking.created_at,
        relativeTime: this.getRelativeTime(booking.created_at),
        icon: 'people',
        color: booking.status === 'completed' ? '#10B981' : booking.status === 'confirmed' ? '#3B82F6' : '#F59E0B',
        metadata: { status: booking.status, date: booking.scheduled_date },
      }));
    } catch (error) {
      console.error('Get booking activity error:', error);
      return [];
    }
  }

  /**
   * Get relative time string (e.g., "2 hours ago", "yesterday")
   * Uses the current app language for localization
   */
  private getRelativeTime(timestamp: string): string {
    try {
      const currentLang = i18n.language;
      let locale;
      switch (currentLang) {
        case 'az':
          locale = az;
          break;
        case 'ru':
          locale = ru;
          break;
        default:
          locale = enUS;
      }
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale });
    } catch (error) {
      return i18n.t('common.recently');
    }
  }

  /**
   * Get activity summary for a specific time period
   */
  async getActivitySummary(
    studentId: string,
    days: number = 7
  ): Promise<{
    totalActivities: number;
    quizzes: number;
    exams: number;
    studyTime: number; // in minutes
    achievements: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString();

      const [quizCount, examCount, studyTime, achievementCount] = await Promise.all([
        // Count practice sessions
        supabase
          .from('practice_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', studentId)
          .not('completed_at', 'is', null)
          .gte('completed_at', startDateStr),
        
        // Count exams
        supabase
          .from('student_exam_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', studentId)
          .gte('started_at', startDateStr),
        
        // Sum study time
        supabase
          .from('study_sessions')
          .select('duration_minutes')
          .eq('student_id', studentId)
          .gte('start_time', startDateStr),
        
        // Count achievements
        supabase
          .from('user_achievements')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', studentId)
          .gte('earned_at', startDateStr),
      ]);

      const totalStudyTime = studyTime.data?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;

      return {
        totalActivities: (quizCount.count || 0) + (examCount.count || 0) + (achievementCount.count || 0),
        quizzes: quizCount.count || 0,
        exams: examCount.count || 0,
        studyTime: totalStudyTime,
        achievements: achievementCount.count || 0,
      };
    } catch (error) {
      console.error('Get activity summary error:', error);
      return {
        totalActivities: 0,
        quizzes: 0,
        exams: 0,
        studyTime: 0,
        achievements: 0,
      };
    }
  }

  /**
   * Get latest practice and exam results only (for Home screen)
   * @param userId - Auth user ID (both practice_sessions and mock_exam_attempts use user_id)
   * @param studentId - Optional student ID (kept for backwards compatibility, not used)
   * @param limit - Maximum number of activities to return (default 3)
   */
  async getLatestResults(userId: string, studentId?: string, limit: number = 3): Promise<Activity[]> {
    try {
      const activities: Activity[] = [];

      // Get latest quizzes (uses user_id from practice_sessions)
      const quizzes = await this.getQuizActivity(userId, 5);
      activities.push(...quizzes);

      // Get latest exams (uses user_id from mock_exam_attempts)
      const exams = await this.getExamActivity(userId, 5);
      activities.push(...exams);

      // Sort by timestamp (most recent first) and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Get latest results error:', error);
      return [];
    }
  }
}

export const activityService = new ActivityService();
