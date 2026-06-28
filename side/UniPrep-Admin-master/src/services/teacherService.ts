import { supabase } from '@/lib/supabase';

// ============================================
// TYPES
// ============================================

export interface SearchTeachersParams {
  query?: string;
  city?: string;
  verificationStatus?: 'verified' | 'unverified' | 'all';
  specialization?: string;
  sortBy?: 'name' | 'rating' | 'students' | 'bookings' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface UpdateTeacherProfileParams {
  fullName?: string;
  email?: string;
  city?: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  experienceYears?: number;
  hourlyRate?: number;
  monthlyRate?: number;
}

// ============================================
// SEARCH & LIST
// ============================================

export const teacherService = {
  /**
   * Search teachers with filters and pagination
   */
  async searchTeachers(params: SearchTeachersParams) {
    try {
      const { data, error } = await supabase.rpc('admin_search_teachers', {
        p_query: params.query || null,
        p_city: params.city || null,
        p_verification_status: params.verificationStatus === 'all' ? null : params.verificationStatus || null,
        p_specialization: params.specialization || null,
        p_sort_by: params.sortBy || 'created_at',
        p_sort_order: params.sortOrder || 'DESC',
        p_limit: params.limit || 20,
        p_offset: params.offset || 0,
      });

      if (error) {
        console.error('Error searching teachers:', error);
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
          teachers: data || [],
          totalCount: Number(totalCount),
        },
        error: null,
      };
    } catch (err) {
      console.error('Exception in searchTeachers:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get detailed teacher information
   */
  async getTeacherDetail(teacherId: string) {
    try {
      const { data, error } = await supabase.rpc('get_teacher_detail', {
        p_teacher_id: teacherId,
      });

      if (error) {
        console.error('Error getting teacher detail:', error);
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
      console.error('Exception in getTeacherDetail:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  // ============================================
  // UPDATE
  // ============================================

  /**
   * Update teacher profile information
   */
  async updateTeacherProfile(teacherId: string, params: UpdateTeacherProfileParams) {
    try {
      const { data, error } = await supabase.rpc('update_teacher_profile', {
        p_teacher_id: teacherId,
        p_full_name: params.fullName || null,
        p_email: params.email || null,
        p_city: params.city || null,
        p_phone: params.phone || null,
        p_avatar_url: params.avatarUrl || null,
        p_bio: params.bio || null,
        p_experience_years: params.experienceYears || null,
        p_hourly_rate: params.hourlyRate || null,
        p_monthly_rate: params.monthlyRate || null,
      });

      if (error) {
        console.error('Error updating teacher profile:', error);
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
      console.error('Exception in updateTeacherProfile:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update teacher certificates array
   */
  async updateTeacherCertificates(teacherId: string, certificates: string[]) {
    try {
      const { data, error } = await supabase.rpc('admin_update_teacher_certificates', {
        p_teacher_id: teacherId,
        p_certificates: certificates,
      });

      if (error) {
        console.error('Error updating teacher certificates:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (data && data.success === false) {
        return {
          success: false,
          error: data.error || 'Failed to update teacher certificates',
          data: null,
        };
      }

      return {
        success: true,
        data: data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateTeacherCertificates:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update teacher verification status
   */
  async updateTeacherVerification(teacherId: string, isVerified: boolean, rejectionReason?: string) {
    try {
      const { data, error } = await supabase.rpc('update_teacher_verification', {
        p_teacher_id: teacherId,
        p_is_verified: isVerified,
        p_rejection_reason: rejectionReason || null,
      });

      if (error) {
        console.error('Error updating teacher verification:', error);
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
      console.error('Exception in updateTeacherVerification:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update teacher specializations
   */
  async updateTeacherSpecializations(teacherId: string, specializations: string[]) {
    try {
      const { data, error } = await supabase.rpc('update_teacher_specializations', {
        p_teacher_id: teacherId,
        p_specializations: specializations,
      });

      if (error) {
        console.error('Error updating teacher specializations:', error);
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
      console.error('Exception in updateTeacherSpecializations:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  // ============================================
  // DELETE
  // ============================================

  /**
   * Delete teacher (soft or hard delete)
   */
  async deleteTeacher(teacherId: string, hardDelete: boolean = false) {
    try {
      const { data, error } = await supabase.rpc('delete_teacher', {
        p_teacher_id: teacherId,
        p_hard_delete: hardDelete,
      });

      if (error) {
        console.error('Error deleting teacher:', error);
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
      console.error('Exception in deleteTeacher:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Get list of cities where teachers are located
   */
  async getCities() {
    try {
      const { data, error } = await supabase.rpc('get_teacher_cities');

      if (error) {
        console.error('Error getting teacher cities:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data?.map((row: { city: string }) => row.city) || [],
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
   * Get teacher statistics by city
   */
  async getTeachersByCity() {
    try {
      const { data, error } = await supabase.rpc('get_teachers_by_city');

      if (error) {
        console.error('Error getting teachers by city:', error);
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
      console.error('Exception in getTeachersByCity:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get all specializations
   */
  async getAllSpecializations() {
    try {
      const { data, error } = await supabase.rpc('get_all_specializations');

      if (error) {
        console.error('Error getting specializations:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data?.map((row: { specialization: string }) => row.specialization) || [],
        error: null,
      };
    } catch (err) {
      console.error('Exception in getAllSpecializations:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },
};
