import { supabase } from '@/lib/supabase';
import {
  Question,
  QuestionImport,
  QuestionBulkUpload,
  QuestionSearchFilters,
  QuestionStatistics,
  Subject,
  BulkImportResult,
} from '@/types/questions';

class QuestionService {
  /**
   * Get all subjects
   */
  async getSubjects(): Promise<{ success: boolean; data?: Subject[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .order('name_en');

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Get subjects error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search questions with filters (single batch - limited by Supabase API row limit)
   */
  async searchQuestions(
    filters: QuestionSearchFilters
  ): Promise<{ success: boolean; data?: Question[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('search_questions', {
        p_subject_id: filters.subject_id || null,
        p_difficulty: filters.difficulty || null,
        p_exam_stage: null, // exam_stage removed from questions - only Exams have stages
        p_search_text: filters.search_text || null,
        p_tags: filters.tags || null,
        p_is_active: filters.is_active ?? null,
        p_limit: filters.limit || 1000,
        p_offset: filters.offset || 0,
      });

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Search questions error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search ALL questions using batch pagination to bypass Supabase's 1000 row API limit
   * Fetches questions in batches of 1000 and combines them
   */
  async searchAllQuestions(
    filters: QuestionSearchFilters
  ): Promise<{ success: boolean; data?: Question[]; error?: string }> {
    try {
      const BATCH_SIZE = 1000;
      const maxQuestions = filters.limit || 100000;
      let allQuestions: Question[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && allQuestions.length < maxQuestions) {
        const { data, error } = await supabase.rpc('search_questions', {
          p_subject_id: filters.subject_id || null,
          p_difficulty: filters.difficulty || null,
          p_exam_stage: null,
          p_search_text: filters.search_text || null,
          p_tags: filters.tags || null,
          p_is_active: filters.is_active ?? null,
          p_limit: BATCH_SIZE,
          p_offset: offset,
        });

        if (error) throw error;

        if (data && data.length > 0) {
          allQuestions = [...allQuestions, ...data];
          offset += BATCH_SIZE;
          // If we got less than BATCH_SIZE, we've reached the end
          hasMore = data.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Trim to maxQuestions if needed
      if (allQuestions.length > maxQuestions) {
        allQuestions = allQuestions.slice(0, maxQuestions);
      }

      return { success: true, data: allQuestions };
    } catch (error: any) {
      console.error('Search all questions error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get question by ID
   */
  async getQuestionById(
    questionId: string
  ): Promise<{ success: boolean; data?: Question; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Get question error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a single question
   */
  async createQuestion(
    question: Partial<Question>,
    adminId?: string
  ): Promise<{ success: boolean; data?: Question; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('questions')
        .insert({
          ...question,
          created_by: adminId,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Create question error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a question
   */
  async updateQuestion(
    questionId: string,
    updates: Partial<Question>
  ): Promise<{ success: boolean; data?: Question; error?: string }> {
    try {
      // First, verify the question exists
      const { data: existing, error: checkError } = await supabase
        .from('questions')
        .select('id')
        .eq('id', questionId)
        .single();

      if (checkError || !existing) {
        throw new Error('Question not found');
      }

      // Perform the update
      const { error: updateError } = await supabase
        .from('questions')
        .update(updates)
        .eq('id', questionId);

      if (updateError) throw updateError;

      // Fetch the updated question
      const { data, error: fetchError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (fetchError) throw fetchError;

      return { success: true, data };
    } catch (error: any) {
      console.error('Update question error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a single question
   */
  async deleteQuestion(
    questionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', questionId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Delete question error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk insert questions from JSON
   */
  async bulkInsertQuestions(
    questions: QuestionBulkUpload[],
    subjectId: string,
    adminId?: string,
    filename?: string
  ): Promise<{ success: boolean; data?: BulkImportResult; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('bulk_insert_questions', {
        p_questions: questions,
        p_subject_id: subjectId,
        p_imported_by: adminId || null,
        p_filename: filename || 'Bulk Import',
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error('Bulk insert failed');
      }

      return { success: true, data: data.data };
    } catch (error: any) {
      console.error('Bulk insert error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk delete questions
   */
  async bulkDeleteQuestions(
    questionIds: string[]
  ): Promise<{ success: boolean; data?: { deleted_count: number }; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('bulk_delete_questions', {
        p_question_ids: questionIds,
      });

      if (error) throw error;

      return { success: true, data: data.data };
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle question active status
   */
  async toggleQuestionStatus(
    questionId: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('toggle_question_status', {
        p_question_id: questionId,
        p_is_active: isActive,
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Toggle status error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get question statistics
   */
  async getQuestionStatistics(
    subjectId?: string
  ): Promise<{ success: boolean; data?: QuestionStatistics; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_question_statistics', {
        p_subject_id: subjectId || null,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (error: any) {
      console.error('Get statistics error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get import history
   */
  async getImportHistory(
    limit: number = 20
  ): Promise<{ success: boolean; data?: QuestionImport[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('question_imports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return { success: true, data: data || [] };
    } catch (error: any) {
      console.error('Get import history error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log a manual (non-RPC) import into question_imports so it appears in Recent Uploads.
   * Used by group imports (written_open / codable_open) which bypass bulk_insert_questions.
   */
  async logImport(params: {
    subjectId: string;
    filename: string;
    totalQuestions: number;
    successful: number;
    failed: number;
  }): Promise<void> {
    try {
      const { error } = await supabase.from('question_imports').insert({
        subject_id: params.subjectId,
        filename: params.filename || 'Group Import',
        total_questions: params.totalQuestions,
        successful: params.successful,
        failed: params.failed,
      });
      if (error) console.error('Failed to log import record:', error);
    } catch (err) {
      console.error('Exception logging import record:', err);
    }
  }

  /**
   * Export questions to JSON
   * If no questions exist, returns a template with example questions
   */
  async exportQuestions(filters: QuestionSearchFilters): Promise<QuestionBulkUpload[]> {
    const result = await this.searchAllQuestions({ ...filters, limit: 100000 });
    
    // If no questions found, return template with examples
    if (!result.success || !result.data || result.data.length === 0) {
      return this.getExportTemplate();
    }

    // Note: exam_stage is NOT exported - it's only for Exams when assigning topics
    // All questions MUST have option_e - if missing in DB, use empty string (should not happen)
    return result.data.map((q) => ({
      question_text: q.question_text,
      question_image_url: q.question_image_url,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e || '', // Required: all questions must have 5 options
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic || undefined, // Include topic for bulk upload compatibility
      subtopic: (q as any).subtopic_name || undefined, // Include subtopic name if available
      tags: q.tags,
      source: q.source,
      year: q.year,
    }));
  }

  /**
   * Get export template with example questions
   * Used when no questions exist to show the expected format
   * Note: exam_stage is NOT part of questions - it's only for Exams when assigning topics
   */
  private getExportTemplate(): QuestionBulkUpload[] {
    // All questions MUST have 5 options (A-E)
    return [
      {
        question_text: "Example Question 1: What is the capital of Azerbaijan?",
        option_a: "Baku",
        option_b: "Ganja",
        option_c: "Sumgait",
        option_d: "Mingachevir",
        option_e: "Shaki",
        correct_answer: "A",
        explanation: "Baku is the capital and largest city of Azerbaijan.",
        difficulty: "easy",
        topic: "Geography",
        subtopic: "Capital Cities", // optional: must match a subtopic_name under the given topic
        tags: ["geography", "capitals"],
        source: "Sample",
        year: 2024,
      },
      {
        question_text: "Example Question 2: Solve the equation: 2x + 5 = 15",
        option_a: "x = 3",
        option_b: "x = 5",
        option_c: "x = 7",
        option_d: "x = 10",
        option_e: "x = 15",
        correct_answer: "B",
        explanation: "2x + 5 = 15 → 2x = 10 → x = 5",
        difficulty: "medium",
        topic: "Algebra",
        tags: ["algebra", "equations"],
        source: "Sample",
        year: 2024,
      },
      {
        question_text: "Example Question 3: Which element has the atomic number 79?",
        option_a: "Silver",
        option_b: "Gold",
        option_c: "Platinum",
        option_d: "Copper",
        option_e: "Iron",
        correct_answer: "B",
        explanation: "Gold (Au) has the atomic number 79 in the periodic table.",
        difficulty: "hard",
        topic: "Chemistry",
        tags: ["chemistry", "periodic-table"],
        source: "Sample",
        year: 2024,
      },
    ];
  }

  /**
   * Validate JSON format for bulk upload with enhanced security
   */
  async validateBulkUploadJSON(json: any, subjectId?: string, availableTopics?: string[]): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    // Use centralized security validation
    const { validateImport } = await import('@/utils/importValidation');
    
    const validation = validateImport(json, 'questions', {
      availableTopics,
      maxItems: 5000 // Max questions per import
    });

    return validation;
  }

  /**
   * Get question counts by difficulty for a subject (filtered by question types)
   */
  async getQuestionCountsByDifficulty(
    subjectId: string,
    questionTypes?: string[]
  ): Promise<{ success: boolean; data?: { easy: number; medium: number; hard: number }; error?: string }> {
    try {
      let query = supabase
        .from('questions')
        .select('difficulty')
        .eq('subject_id', subjectId)
        .eq('is_active', true)
        .neq('question_type', 'written_open');

      if (questionTypes && questionTypes.length > 0) {
        query = query.in('question_type', questionTypes);
      }

      const { data, error } = await query;

      if (error) throw error;

      const counts = {
        easy: 0,
        medium: 0,
        hard: 0,
      };

      (data || []).forEach((q: { difficulty: string }) => {
        if (q.difficulty === 'easy') counts.easy++;
        else if (q.difficulty === 'medium') counts.medium++;
        else if (q.difficulty === 'hard') counts.hard++;
      });

      return { success: true, data: counts };
    } catch (error: any) {
      console.error('Get question counts error:', error);
      return { success: false, error: error.message };
    }
  }
}

export const questionService = new QuestionService();
