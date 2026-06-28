import { supabase } from '@/lib/supabase';
import type { ApiResponse, Student, StudentDetail } from '@/types';

export interface SearchStudentsParams {
  query?: string;
  city?: string;
  minElo?: number;
  maxElo?: number;
  status?: 'active' | 'inactive' | 'all';
  sortBy?: 'name' | 'elo' | 'exams' | 'last_active' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface SearchStudentsResult {
  students: Student[];
  totalCount: number;
}

export const studentService = {
  /**
   * Search students with filters and pagination
   */
  async searchStudents(params: SearchStudentsParams): Promise<ApiResponse<SearchStudentsResult>> {
    try {
      const {
        query = null,
        city = null,
        minElo = null,
        maxElo = null,
        status = 'all',
        sortBy = 'created_at',
        sortOrder = 'DESC',
        limit = 20,
        offset = 0,
      } = params;

      const rpcParams = {
        p_query: query || null,
        p_city: city || null,
        p_min_elo: minElo || null,
        p_max_elo: maxElo || null,
        p_status: status === 'all' ? null : status,
        p_sort_by: sortBy || 'created_at',
        p_sort_order: sortOrder || 'DESC',
        p_limit: limit || 20,
        p_offset: offset || 0,
      };
      

      const { data, error } = await supabase.rpc('search_students', rpcParams);


      if (error) {
        console.error('❌ Error searching students:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      // Extract total count from first row
      const totalCount = data && data.length > 0 ? data[0].total_count : 0;


      return {
        success: true,
        data: {
          students: data || [],
          totalCount: Number(totalCount),
        },
        error: null,
      };
    } catch (err) {
      console.error('💥 Exception in searchStudents:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get detailed student information
   */
  async getStudentDetail(studentId: string): Promise<ApiResponse<StudentDetail>> {
    try {
      const { data, error } = await supabase.rpc('get_student_detail', {
        p_student_id: studentId,
      });

      if (error) {
        console.error('Error getting student detail:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getStudentDetail:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update student profile
   */
  async updateStudentProfile(
    studentId: string,
    updates: {
      fullName?: string;
      email?: string;
      city?: string;
      phone?: string;
      avatarUrl?: string;
    }
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('update_student_profile', {
        p_student_id: studentId,
        p_full_name: updates.fullName || null,
        p_email: updates.email || null,
        p_city: updates.city || null,
        p_phone: updates.phone || null,
        p_avatar_url: updates.avatarUrl || null,
      });

      if (error) {
        console.error('Error updating student profile:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (!data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateStudentProfile:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update student ELO rating
   */
  async updateStudentElo(
    studentId: string,
    newElo: number,
    reason?: string
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('update_student_elo', {
        p_student_id: studentId,
        p_new_elo: newElo,
        p_reason: reason || null,
      });

      if (error) {
        console.error('Error updating student ELO:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (!data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateStudentElo:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Delete student (soft or hard delete)
   */
  async deleteStudent(
    studentId: string,
    hardDelete: boolean = false
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('delete_student', {
        p_student_id: studentId,
        p_hard_delete: hardDelete,
      });

      if (error) {
        console.error('Error deleting student:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (!data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in deleteStudent:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get list of cities for filter dropdown
   */
  async getCities(): Promise<ApiResponse<string[]>> {
    try {
      const { data, error } = await supabase.rpc('get_student_cities');

      if (error) {
        console.error('Error getting cities:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data.map((row: any) => row.city),
        error: null,
      };
    } catch (err) {
      console.error('Exception in getCities:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get student statistics by city
   */
  async getStudentsByCity(): Promise<ApiResponse<any[]>> {
    try {
      const { data, error } = await supabase.rpc('get_students_by_city');

      if (error) {
        console.error('Error getting students by city:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data || [],
        error: null,
      };
    } catch (err) {
      console.error('Exception in getStudentsByCity:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },
};
