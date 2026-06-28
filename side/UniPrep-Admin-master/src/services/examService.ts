import { supabase } from '@/lib/supabase';
import {
  Exam,
  ExamDetails,
  CreateExamInput,
  UpdateExamInput,
  SearchExamsParams,
  QuestionDistribution,
} from '@/types/exams';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export const examService = {
  /**
   * Create a new exam
   */
  async createExam(input: CreateExamInput): Promise<ApiResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('create_mock_exam', {
        p_title: input.title,
        p_exam_type: input.exam_type,
        p_target_group: input.target_group,
        p_duration_minutes: input.duration_minutes,
        p_total_questions: input.total_questions,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Create exam error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update an existing exam
   */
  async updateExam(
    examId: string,
    updates: UpdateExamInput
  ): Promise<ApiResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('update_mock_exam', {
        p_exam_id: examId,
        p_title: updates.title || null,
        p_exam_type: updates.exam_type || null,
        p_target_group: updates.target_group || null,
        p_duration_minutes: updates.duration_minutes || null,
        p_total_questions: updates.total_questions || null,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Update exam error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete an exam
   */
  async deleteExam(examId: string): Promise<ApiResponse<boolean>> {
    try {
      const { data, error } = await supabase.rpc('delete_mock_exam', {
        p_exam_id: examId,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Delete exam error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Search and filter exams
   */
  async searchExams(params: SearchExamsParams = {}): Promise<ApiResponse<Exam[]>> {
    try {
      const { data, error } = await supabase.rpc('search_mock_exams', {
        p_exam_type: params.exam_type || null,
        p_target_group: params.target_group || null,
        p_search_text: params.search_text || null,
        p_limit: params.limit || 50,
        p_offset: params.offset || 0,
      });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Search exams error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get exam details with questions
   */
  async getExamDetails(examId: string): Promise<ApiResponse<ExamDetails>> {
    try {
      const { data, error } = await supabase.rpc('get_mock_exam_details', {
        p_exam_id: examId,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Get exam details error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Add questions to exam (manual selection)
   * Handles both individual questions and question groups
   */
  async addQuestionsToExam(
    examId: string,
    questionOrGroupIds: string[]
  ): Promise<ApiResponse<number>> {
    try {
      // Separate group IDs from question IDs by checking question_groups table
      const allQuestionIds: string[] = [];
      
      for (const id of questionOrGroupIds) {
        // Check if this is a group ID
        const { data: group, error: groupError } = await supabase
          .from('question_groups')
          .select('id')
          .eq('id', id)
          .maybeSingle();
        
        if (group) {
          // This is a group - fetch all questions in the group
          const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select('id')
            .eq('group_id', id)
            .order('group_order', { ascending: true });
          
          if (questionsError) throw questionsError;
          
          if (questions && questions.length > 0) {
            allQuestionIds.push(...questions.map(q => q.id));
          }
        } else {
          // This is a regular question ID
          allQuestionIds.push(id);
        }
      }
      
      if (allQuestionIds.length === 0) {
        return { success: false, error: 'No valid questions to add' };
      }
      
      const { data, error } = await supabase.rpc('add_questions_to_mock_exam', {
        p_exam_id: examId,
        p_question_ids: allQuestionIds,
      });

      if (error) throw error;
      
      // Reorder questions to ensure written_open questions are at the end of each subject
      const { error: reorderError } = await supabase.rpc('reorder_exam_questions_by_type', {
        p_exam_id: examId,
      });
      
      if (reorderError) {
        console.warn('Failed to reorder questions:', reorderError);
        // Don't fail the entire operation if reordering fails
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Add questions error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Auto-select questions based on distribution
   */
  async autoSelectQuestions(
    examId: string,
    distribution: QuestionDistribution,
    examStage: 'first' | 'second',
    topicConfig?: Record<string, any>,
    questionTypes?: string[]
  ): Promise<ApiResponse<number>> {
    try {
      const { data, error } = await supabase.rpc('auto_select_questions_for_exam', {
        p_exam_id: examId,
        p_distribution: distribution,
        p_exam_stage: examStage,
        p_topic_config: topicConfig || null,
        p_question_types: questionTypes && questionTypes.length > 0 ? questionTypes : ['mcq'],
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Auto select questions error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove questions from exam
   */
  async removeQuestionsFromExam(
    examId: string,
    questionIds: string[]
  ): Promise<ApiResponse<number>> {
    try {
      const { data, error } = await supabase.rpc('remove_questions_from_mock_exam', {
        p_exam_id: examId,
        p_question_ids: questionIds,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Remove questions error:', error);
      return { success: false, error: error.message };
    }
  },


  /**
   * Get all teacher-submitted exams (with teacher info + actual question count)
   * Uses SECURITY DEFINER RPC to bypass RLS on teacher_exam_questions.
   * Direct PostgREST embedding of teacher_exam_questions(count) fails with 0
   * because the admin user is not the exam owner (RLS blocks cross-owner reads).
   */
  async getTeacherSubmissions(statusFilter?: 'pending' | 'approved' | 'rejected'): Promise<ApiResponse<Exam[]>> {
    try {
      const { data, error } = await supabase.rpc('admin_get_teacher_submissions', {
        p_status: statusFilter === 'pending' ? 'pending'
                : statusFilter === 'approved' ? 'approved'
                : null,
      });

      if (error) throw error;

      const exams: Exam[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        exam_type: row.exam_type,
        target_group: row.target_group,
        duration_minutes: row.duration_minutes,
        total_questions: row.total_questions,
        created_at: row.created_at,
        is_official: row.is_official,
        created_by_teacher: row.created_by_teacher,
        is_approved: row.is_approved,
        uses_teacher_questions: row.uses_teacher_questions,
        teacher_name: row.teacher_name ?? null,
        teacher_avatar_url: row.teacher_avatar_url ?? null,
        question_count_actual: Number(row.question_count ?? 0),
      }));

      return { success: true, data: exams };
    } catch (error: any) {
      console.error('Get teacher submissions error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Approve or reject a teacher exam (calls admin_approve_teacher_exam RPC)
   */
  async approveTeacherExam(examId: string, approved: boolean): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase.rpc('admin_approve_teacher_exam', {
        p_exam_id: examId,
        p_approved: approved,
      });
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Approve teacher exam error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Set or remove the Official Elmly stamp on an exam (calls admin_set_exam_official RPC)
   */
  async setExamOfficial(examId: string, isOfficial: boolean): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase.rpc('admin_set_exam_official', {
        p_exam_id: examId,
        p_is_official: isOfficial,
      });
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Set exam official error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get exam by ID (direct table query)
   */
  async getExamById(examId: string): Promise<ApiResponse<Exam>> {
    try {
      const { data, error } = await supabase
        .from('mock_exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Get exam by ID error:', error);
      return { success: false, error: error.message };
    }
  },
};
