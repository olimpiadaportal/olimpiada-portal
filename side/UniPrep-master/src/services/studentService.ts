import { supabase } from './supabase';

export interface SubjectProgress {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_name_az: string;
  progress: number;
  accuracy: number;
  questions_practiced: number;
  time_spent: number;
  last_practiced: string | null;
}

export interface MockExamResult {
  id: string;
  exam_id: string;
  exam_title: string;
  score: number;
  total_questions: number;
  time_taken: number;
  completed_at: string;
  exam_group: string;
}

export interface StudentStats {
  total_mock_exams: number;
  total_questions_practiced: number;
  total_study_hours: number;
  overall_progress: number;
  first_stage_score: number | null;
  days_until_exam: number;
}

export interface RecommendedTeacher {
  id: string;
  full_name: string;
  avatar_url: string | null;
  specializations: string[];
  experience_years: number;
  hourly_rate: number | null;
  monthly_rate: number | null;
  rating: number;
  current_students: number;
  total_students: number;
  available_groups: string[];
}

class StudentService {
  // Get student profile with additional data
  async getStudentProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          profiles!inner(*)
        `)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get student profile error:', error);
      throw error;
    }
  }

  // Get subject progress for all subjects
  async getSubjectProgress(userId: string): Promise<SubjectProgress[]> {
    try {
      // For now, return empty array since table structure is not finalized
      // This will be implemented when study_progress table is properly set up
      return [];
    } catch (error) {
      console.error('Get subject progress error:', error);
      return [];
    }
  }

  // Get mock exam history
  async getMockExamHistory(userId: string): Promise<MockExamResult[]> {
    try {
      const { data, error } = await supabase
        .from('mock_exam_results')
        .select(`
          *,
          mock_exams(title, exam_group, total_questions)
        `)
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        exam_id: item.exam_id,
        exam_title: item.mock_exams?.title || 'Mock Exam',
        score: item.score || 0,
        total_questions: item.mock_exams?.total_questions || 0,
        time_taken: item.time_taken_minutes || 0,
        completed_at: item.completed_at,
        exam_group: item.mock_exams?.exam_group || '',
      }));
    } catch (error) {
      console.error('Get mock exam history error:', error);
      return [];
    }
  }

  // Get student statistics
  async getStudentStats(userId: string): Promise<StudentStats> {
    try {
      // Calculate days until exam (assuming exam is in June)
      const examDate = new Date(new Date().getFullYear(), 5, 15); // June 15
      const today = new Date();
      const daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // For now, return default stats since tables are not finalized
      // This will be implemented when database structure is complete
      return {
        total_mock_exams: 0,
        total_questions_practiced: 0,
        total_study_hours: 0,
        overall_progress: 0,
        first_stage_score: null,
        days_until_exam: daysUntilExam > 0 ? daysUntilExam : 0,
      };
    } catch (error) {
      console.error('Get student stats error:', error);
      return {
        total_mock_exams: 0,
        total_questions_practiced: 0,
        total_study_hours: 0,
        overall_progress: 0,
        first_stage_score: null,
        days_until_exam: 0,
      };
    }
  }

  // Get recommended teachers based on target group
  async getRecommendedTeachers(targetGroup: string): Promise<RecommendedTeacher[]> {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profiles!inner(full_name, avatar_url)
        `)
        .contains('available_groups', [targetGroup])
        .eq('is_verified', true)
        .order('rating', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.user_id,
        full_name: item.profiles?.full_name || 'Unknown Teacher',
        avatar_url: item.profiles?.avatar_url,
        specializations: item.specializations || [],
        experience_years: item.experience_years || 0,
        hourly_rate: item.hourly_rate,
        monthly_rate: item.monthly_rate,
        rating: item.rating || 0,
        current_students: item.current_students ?? item.total_students ?? 0,
        total_students: item.total_students || 0,
        available_groups: item.available_groups || [],
      }));
    } catch (error) {
      console.error('Get recommended teachers error:', error);
      return [];
    }
  }

  // Get available mock exams for student's group
  async getAvailableMockExams(examGroup: string) {
    try {
      // For now, return empty array since table structure is not finalized
      // This will be implemented when mock_exams table is properly set up
      return [];
    } catch (error) {
      console.error('Get available mock exams error:', error);
      return [];
    }
  }
}

export const studentService = new StudentService();
