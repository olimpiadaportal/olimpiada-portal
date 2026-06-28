import { supabase } from '@/lib/supabase';
import type {
  TopicWithStats,
  CreateTopicParams,
  UpdateTopicParams,
  TopicOrder,
  TopicServiceResponse,
} from '@/types/subjects';

// ============================================
// TOPIC SERVICE
// ============================================

export const topicService = {
  /**
   * Get all topics for a subject with statistics
   */
  async getTopicsBySubject(subjectId: string): Promise<TopicServiceResponse<TopicWithStats[]>> {
    try {
      const { data, error } = await supabase.rpc('get_topics_by_subject', {
        p_subject_id: subjectId,
      });

      if (error) {
        console.error('Error fetching topics:', error);
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
      console.error('Exception in getTopicsBySubject:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Create a new topic
   */
  async createTopic(params: CreateTopicParams): Promise<TopicServiceResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('admin_create_topic', {
        p_subject_id: params.subject_id,
        p_topic_name: params.topic_name,
        p_topic_name_az: params.topic_name_az || null,
        p_topic_name_ru: params.topic_name_ru || null,
        p_description: params.description || null,
        p_difficulty_level: params.difficulty_level || 'intermediate',
        p_display_order: params.display_order || 0,
      });

      if (error) {
        console.error('Error creating topic:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data, // Returns topic ID
        error: null,
      };
    } catch (err) {
      console.error('Exception in createTopic:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update a topic
   */
  async updateTopic(params: UpdateTopicParams): Promise<TopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_update_topic', {
        p_topic_id: params.id,
        p_topic_name: params.topic_name || null,
        p_topic_name_az: params.topic_name_az || null,
        p_topic_name_ru: params.topic_name_ru || null,
        p_description: params.description || null,
        p_difficulty_level: params.difficulty_level || null,
        p_display_order: params.display_order || null,
        p_is_active: params.is_active !== undefined ? params.is_active : null,
      });

      if (error) {
        console.error('Error updating topic:', error);
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
      console.error('Exception in updateTopic:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get questions for a topic
   */
  async getTopicQuestions(topicId: string): Promise<TopicServiceResponse<any[]>> {
    try {
      // First get the topic name from subject_topics table
      const topicResult = await supabase
        .from('subject_topics')
        .select('topic_name')
        .eq('id', topicId)
        .single();

      if (topicResult.error || !topicResult.data) {
        console.error('Error fetching topic:', topicResult.error);
        return {
          success: false,
          error: 'Topic not found',
          data: null,
        };
      }

      // Then get questions by topic name
      const { data, error } = await supabase
        .from('questions')
        .select('id, question_text, difficulty, is_active')
        .eq('topic', topicResult.data.topic_name)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching topic questions:', error);
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
      console.error('Exception in getTopicQuestions:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Delete a topic
   */
  async deleteTopic(topicId: string): Promise<TopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_delete_topic', {
        p_topic_id: topicId,
      });

      if (error) {
        console.error('Error deleting topic:', error);
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
      console.error('Exception in deleteTopic:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Delete a topic with its questions
   */
  async deleteTopicWithQuestions(topicId: string): Promise<TopicServiceResponse<boolean>> {
    try {
      // First get the topic name
      const topicResult = await supabase
        .from('subject_topics')
        .select('topic_name')
        .eq('id', topicId)
        .single();

      if (topicResult.error || !topicResult.data) {
        console.error('Error fetching topic:', topicResult.error);
        return {
          success: false,
          error: 'Topic not found',
          data: null,
        };
      }

      // Delete all questions by topic name
      const { error: questionsError } = await supabase
        .from('questions')
        .delete()
        .eq('topic', topicResult.data.topic_name);

      if (questionsError) {
        console.error('Error deleting topic questions:', questionsError);
        return {
          success: false,
          error: questionsError.message,
          data: null,
        };
      }

      // Then delete the topic
      return await this.deleteTopic(topicId);
    } catch (err) {
      console.error('Exception in deleteTopicWithQuestions:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Reorder topics
   */
  async reorderTopics(topicOrders: TopicOrder[]): Promise<TopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_reorder_topics', {
        p_topic_orders: topicOrders,
      });

      if (error) {
        console.error('Error reordering topics:', error);
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
      console.error('Exception in reorderTopics:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get or create a subtopic under a given topic.
   * Returns the subtopic UUID. Used during bulk import to resolve subtopic strings.
   */
  async ensureSubtopicExists(
    subjectId: string,
    topicId: string,
    subtopicName: string,
  ): Promise<TopicServiceResponse<string>> {
    try {
      // Try to find existing subtopic
      const { data: existing } = await supabase
        .from('subject_subtopics')
        .select('id')
        .eq('topic_id', topicId)
        .eq('subtopic_name', subtopicName)
        .maybeSingle();

      if (existing) {
        return { success: true, data: existing.id, error: null };
      }

      // Create new subtopic
      const { data: created, error } = await supabase
        .from('subject_subtopics')
        .insert({
          subject_id: subjectId,
          topic_id: topicId,
          subtopic_name: subtopicName,
          difficulty_level: 'intermediate',
          display_order: 0,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating subtopic:', error);
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data: created.id, error: null };
    } catch (err) {
      console.error('Exception in ensureSubtopicExists:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Toggle topic active status
   */
  async toggleTopicStatus(topicId: string, isActive: boolean): Promise<TopicServiceResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('admin_toggle_topic_status', {
        p_topic_id: topicId,
        p_is_active: isActive,
      });

      if (error) {
        console.error('Error toggling topic status:', error);
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
      console.error('Exception in toggleTopicStatus:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Touch updated_at on the given topics (by name) within a subject.
   * Called after a bulk question import so the topic cards show an accurate
   * "last updated" timestamp.
   */
  async touchTopicTimestamps(subjectId: string, topicNames: string[]): Promise<void> {
    if (!subjectId || topicNames.length === 0) return;
    try {
      await supabase
        .from('subject_topics')
        .update({ updated_at: new Date().toISOString() })
        .eq('subject_id', subjectId)
        .in('topic_name', topicNames);
    } catch (err) {
      console.error('Failed to touch topic timestamps:', err);
    }
  },
};
