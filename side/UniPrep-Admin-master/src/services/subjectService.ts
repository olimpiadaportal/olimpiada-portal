import { supabase } from '@/lib/supabase';
import type {
  SubjectWithStats,
  CreateSubjectParams,
  UpdateSubjectParams,
  SubjectServiceResponse,
} from '@/types/subjects';

// ============================================
// SUBJECT SERVICE
// ============================================

export const subjectService = {
  /**
   * Get all subjects with statistics
   */
  async getSubjectsWithStats(): Promise<SubjectServiceResponse<SubjectWithStats[]>> {
    try {
      const { data, error } = await supabase.rpc('get_subjects_with_stats');

      if (error) {
        console.error('Error fetching subjects:', error);
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
      console.error('Exception in getSubjectsWithStats:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Create a new subject
   */
  async createSubject(params: CreateSubjectParams): Promise<SubjectServiceResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('admin_create_subject', {
        p_name_en: params.name_en,
        p_name_az: params.name_az,
        p_category: params.category,
        p_coefficient: params.coefficient,
        p_max_points: params.max_points,
      });

      if (error) {
        console.error('Error creating subject:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data, // Returns subject ID
        error: null,
      };
    } catch (err) {
      console.error('Exception in createSubject:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update a subject
   */
  async updateSubject(params: UpdateSubjectParams): Promise<SubjectServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_update_subject', {
        p_subject_id: params.id,
        p_name_en: params.name_en || null,
        p_name_az: params.name_az || null,
        p_category: params.category || null,
        p_coefficient: params.coefficient || null,
        p_max_points: params.max_points || null,
      });

      if (error) {
        console.error('Error updating subject:', error);
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
      console.error('Exception in updateSubject:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Delete a subject
   */
  async deleteSubject(subjectId: string): Promise<SubjectServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_delete_subject', {
        p_subject_id: subjectId,
      });

      if (error) {
        console.error('Error deleting subject:', error);
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
      console.error('Exception in deleteSubject:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get a single subject by ID
   */
  async getSubjectById(subjectId: string): Promise<SubjectServiceResponse<SubjectWithStats>> {
    try {
      const { data, error } = await supabase.rpc('get_subjects_with_stats');

      if (error) {
        console.error('Error fetching subject:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      const subject = data?.find((s: SubjectWithStats) => s.id === subjectId);

      if (!subject) {
        return {
          success: false,
          error: 'Subject not found',
          data: null,
        };
      }

      return {
        success: true,
        data: subject,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getSubjectById:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },
};
