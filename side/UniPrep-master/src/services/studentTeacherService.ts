import { supabase } from './supabase';

export interface StudentTeacher {
  subject_id: string;
  subject_name: string;
  teacher_id: string;
  teacher_name: string;
  teacher_city: string;
  assigned_at: string;
}

export interface TeacherSearchResult {
  teacher_id: string;
  teacher_name: string;
  teacher_city: string;
  teacher_avatar_url: string | null;
  subject_count: number;
  student_count: number;
}

export interface LeaderboardDisplaySettings {
  show_teachers: boolean;
  show_city: boolean;
  show_target_group: boolean;
}

class StudentTeacherService {
  /**
   * Get all teachers assigned by a student
   */
  async getStudentTeachers(studentId: string): Promise<StudentTeacher[]> {
    try {
      const { data, error } = await supabase.rpc('get_student_teachers', {
        p_student_id: studentId,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching student teachers:', error);
      throw error;
    }
  }

  /**
   * Search for teachers by name, subject, or city
   */
  async searchTeachers(
    query: string,
    subjectId?: string,
    city?: string,
    limit: number = 20
  ): Promise<TeacherSearchResult[]> {
    try {
      const { data, error } = await supabase.rpc('search_teachers', {
        p_query: query || null,
        p_subject_id: subjectId || null,
        p_city: city || null,
        p_limit: limit,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching teachers:', error);
      throw error;
    }
  }

  /**
   * Assign a teacher to a subject for a student
   */
  async assignTeacher(
    studentId: string,
    subjectId: string,
    teacherId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('assign_teacher_to_subject', {
        p_student_id: studentId,
        p_subject_id: subjectId,
        p_teacher_id: teacherId,
      });

      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error('Error assigning teacher:', error);
      throw error;
    }
  }

  /**
   * Remove a teacher assignment for a subject
   */
  async removeTeacher(studentId: string, subjectId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('remove_teacher_from_subject', {
        p_student_id: studentId,
        p_subject_id: subjectId,
      });

      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error('Error removing teacher:', error);
      throw error;
    }
  }

  /**
   * Get leaderboard display settings for a student
   */
  async getDisplaySettings(studentId: string): Promise<LeaderboardDisplaySettings | null> {
    try {
      const { data, error } = await supabase
        .from('leaderboard_display_settings')
        .select('show_teachers, show_city, show_target_group')
        .eq('student_id', studentId)
        .single();

      if (error) {
        // If no settings exist, return defaults
        if (error.code === 'PGRST116') {
          return {
            show_teachers: true,
            show_city: true,
            show_target_group: true,
          };
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching display settings:', error);
      throw error;
    }
  }

  /**
   * Update leaderboard display settings for a student
   */
  async updateDisplaySettings(
    studentId: string,
    settings: Partial<LeaderboardDisplaySettings>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('leaderboard_display_settings')
        .upsert({
          student_id: studentId,
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating display settings:', error);
      throw error;
    }
  }

  /**
   * Get student's subjects (for teacher assignment)
   * Returns ALL subjects from database, not just practiced ones
   */
  async getStudentSubjects(studentId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      // Get ALL subjects from database
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name_az')
        .order('name_az', { ascending: true });

      if (error) throw error;

      // Map to expected format
      const subjects = data?.map((subject: any) => ({
        id: subject.id,
        name: subject.name_az,
      }));

      return subjects || [];
    } catch (error) {
      console.error('Error fetching student subjects:', error);
      throw error;
    }
  }
}

export const studentTeacherService = new StudentTeacherService();
