import { supabase } from '@/lib/supabase';
import type {
  SubtopicWithStats,
  CreateSubtopicParams,
  UpdateSubtopicParams,
  SubtopicOrder,
  SubtopicServiceResponse,
} from '@/types/subjects';

// ============================================
// SUBTOPIC SERVICE
// ============================================

export const subtopicService = {
  /**
   * Get all subtopics for a topic with question counts
   */
  async getSubtopicsByTopic(topicId: string): Promise<SubtopicServiceResponse<SubtopicWithStats[]>> {
    try {
      const { data, error } = await supabase.rpc('get_subtopics_by_topic', {
        p_topic_id: topicId,
      });

      if (error) {
        console.error('Error fetching subtopics:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data || [], error: null };
    } catch (err) {
      console.error('Exception in getSubtopicsByTopic:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Get all subtopics for a subject (flat list — used in question forms)
   */
  async getSubtopicsBySubject(subjectId: string): Promise<SubtopicServiceResponse<SubtopicWithStats[]>> {
    try {
      const { data, error } = await supabase.rpc('get_subtopics_by_subject', {
        p_subject_id: subjectId,
      });

      if (error) {
        console.error('Error fetching subtopics by subject:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data || [], error: null };
    } catch (err) {
      console.error('Exception in getSubtopicsBySubject:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Create a new subtopic
   */
  async createSubtopic(params: CreateSubtopicParams): Promise<SubtopicServiceResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('admin_create_subtopic', {
        p_topic_id: params.topic_id,
        p_subtopic_name: params.subtopic_name,
        p_description: params.description || null,
        p_difficulty_level: params.difficulty_level || 'intermediate',
        p_display_order: params.display_order || 0,
      });

      if (error) {
        console.error('Error creating subtopic:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data, error: null }; // Returns subtopic ID
    } catch (err) {
      console.error('Exception in createSubtopic:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Update a subtopic
   */
  async updateSubtopic(params: UpdateSubtopicParams): Promise<SubtopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_update_subtopic', {
        p_subtopic_id: params.id,
        p_subtopic_name: params.subtopic_name || null,
        p_description: params.description || null,
        p_difficulty_level: params.difficulty_level || null,
        p_display_order: params.display_order ?? null,
        p_is_active: params.is_active !== undefined ? params.is_active : null,
      });

      if (error) {
        console.error('Error updating subtopic:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data, error: null };
    } catch (err) {
      console.error('Exception in updateSubtopic:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Delete a subtopic (blocked by DB if questions are assigned)
   */
  async deleteSubtopic(subtopicId: string): Promise<SubtopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_delete_subtopic', {
        p_subtopic_id: subtopicId,
      });

      if (error) {
        console.error('Error deleting subtopic:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data, error: null };
    } catch (err) {
      console.error('Exception in deleteSubtopic:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Reorder subtopics
   */
  async reorderSubtopics(subtopicOrders: SubtopicOrder[]): Promise<SubtopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_reorder_subtopics', {
        p_subtopic_orders: subtopicOrders,
      });

      if (error) {
        console.error('Error reordering subtopics:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data, error: null };
    } catch (err) {
      console.error('Exception in reorderSubtopics:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },

  /**
   * Toggle subtopic active status
   */
  async toggleSubtopicStatus(subtopicId: string, isActive: boolean): Promise<SubtopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_toggle_subtopic_status', {
        p_subtopic_id: subtopicId,
        p_is_active: isActive,
      });

      if (error) {
        console.error('Error toggling subtopic status:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: data, error: null };
    } catch (err) {
      console.error('Exception in toggleSubtopicStatus:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', data: null };
    }
  },
};
