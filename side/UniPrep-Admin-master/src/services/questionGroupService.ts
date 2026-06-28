import { supabase } from '@/lib/supabase';
import { QuestionGroup, Question } from '@/types/questions';

export interface CreateQuestionGroupData {
  subject_id: string;
  topic?: string;
  subtopic_id?: string;
  question_type?: 'written_open' | 'codable_open';
  context_text: string;
  context_image_url?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  source?: string;
  year?: number;
  questions: Array<{
    question_text: string;
    question_image_url?: string;
    grading_rubric: any;
    sample_answer?: string;
    expected_answer?: string; // Correct answer for AI grading
    max_points: number;
    explanation?: string;
  }>;
}

export interface UpdateQuestionGroupData {
  subject_id?: string;
  topic?: string;
  subtopic_id?: string | null;
  context_text?: string;
  context_image_url?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  source?: string;
  year?: number;
  is_active?: boolean;
  questions?: Array<{
    question_text: string;
    question_image_url?: string;
    grading_rubric: any;
    sample_answer?: string;
    expected_answer?: string; // Correct answer for AI grading
    max_points: number;
    explanation?: string;
  }>;
}

class QuestionGroupService {
  async createQuestionGroup(data: CreateQuestionGroupData, userId?: string) {
    try {
      // Validate that we have exactly 3 questions
      if (data.questions.length !== 3) {
        return {
          success: false,
          error: 'Question groups must contain exactly 3 questions',
        };
      }

      // Create the question group
      const { data: group, error: groupError } = await supabase
        .from('question_groups')
        .insert({
          subject_id: data.subject_id,
          topic: data.topic,
          context_text: data.context_text,
          context_image_url: data.context_image_url,
          difficulty: data.difficulty,
          tags: data.tags,
          source: data.source,
          year: data.year,
          question_type: data.question_type || 'written_open',
          created_by: userId,
        })
        .select()
        .single();

      if (groupError) {
        console.error('Error creating question group:', groupError);
        return { success: false, error: groupError.message };
      }

      // Create the 3 questions linked to this group
      const questionsToInsert = data.questions.map((q, index) => ({
        subject_id: data.subject_id,
        topic: data.topic,
        subtopic_id: data.subtopic_id || null,
        question_type: (data.question_type || 'written_open') as 'written_open' | 'codable_open',
        question_text: q.question_text,
        question_image_url: q.question_image_url,
        grading_rubric: q.grading_rubric,
        sample_answer: q.sample_answer,
        expected_answer: q.expected_answer, // Correct answer for AI grading
        max_points: q.max_points,
        explanation: q.explanation,
        difficulty: data.difficulty,
        tags: data.tags,
        source: data.source,
        year: data.year,
        is_active: true,
        exclude_from_practice: true,
        group_id: group.id,
        group_order: index + 1, // 1, 2, 3
      }));

      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .insert(questionsToInsert)
        .select();

      if (questionsError) {
        console.error('Error creating questions:', questionsError);
        // Rollback: delete the group
        await supabase.from('question_groups').delete().eq('id', group.id);
        return { success: false, error: questionsError.message };
      }

      return {
        success: true,
        data: { ...group, questions },
      };
    } catch (error: any) {
      console.error('Exception in createQuestionGroup:', error);
      return { success: false, error: error.message };
    }
  }

  async getQuestionGroup(groupId: string) {
    try {
      const { data: group, error: groupError } = await supabase
        .from('question_groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle();

      if (groupError) {
        // Error occurred during query
        return { success: false, error: groupError.message };
      }

      if (!group) {
        // No group found with this ID (not an error, just not a group)
        return { success: false, error: 'Not a question group' };
      }

      // Fetch associated questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('group_id', groupId)
        .order('group_order', { ascending: true });

      if (questionsError) {
        console.error('Error fetching questions:', questionsError);
        return { success: false, error: questionsError.message };
      }

      return {
        success: true,
        data: { ...group, questions } as QuestionGroup,
      };
    } catch (error: any) {
      console.error('Exception in getQuestionGroup:', error);
      return { success: false, error: error.message };
    }
  }

  async getQuestionGroups(subjectId?: string, isActive?: boolean) {
    try {
      let query = supabase.from('question_groups').select('*, questions(*)');

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching question groups:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as QuestionGroup[] };
    } catch (error: any) {
      console.error('Exception in getQuestionGroups:', error);
      return { success: false, error: error.message };
    }
  }

  async updateQuestionGroup(groupId: string, updates: UpdateQuestionGroupData) {
    try {
      // Separate questions and subtopic_id from group-level updates.
      // subtopic_id lives on child `questions` rows — question_groups has no such column.
      const { questions, subtopic_id, ...groupUpdates } = updates;

      // Update the question group
      const { data: groupData, error: groupError } = await supabase
        .from('question_groups')
        .update(groupUpdates)
        .eq('id', groupId)
        .select()
        .single();

      if (groupError) {
        console.error('Error updating question group:', groupError);
        return { success: false, error: groupError.message };
      }

      // If questions are provided, update them
      if (questions && questions.length === 3) {
        // Fetch existing questions to get their IDs
        const { data: existingQuestions, error: fetchError } = await supabase
          .from('questions')
          .select('id, group_order')
          .eq('group_id', groupId)
          .order('group_order', { ascending: true });

        if (fetchError) {
          console.error('Error fetching existing questions:', fetchError);
          return { success: false, error: fetchError.message };
        }

        if (!existingQuestions || existingQuestions.length !== 3) {
          console.error('Expected 3 questions in group, found:', existingQuestions?.length);
          return { success: false, error: 'Invalid question group structure' };
        }

        // Update each question in place (preserves question IDs and exam references)
        for (let i = 0; i < 3; i++) {
          const questionUpdate = {
            subject_id: updates.subject_id || groupData.subject_id,
            topic: updates.topic,
            subtopic_id: subtopic_id !== undefined ? subtopic_id : undefined,
            question_text: questions[i].question_text,
            question_image_url: questions[i].question_image_url,
            grading_rubric: questions[i].grading_rubric,
            sample_answer: questions[i].sample_answer,
            expected_answer: questions[i].expected_answer, // Correct answer for AI grading
            max_points: questions[i].max_points,
            explanation: questions[i].explanation,
            difficulty: updates.difficulty || groupData.difficulty,
            tags: updates.tags,
            source: updates.source,
            year: updates.year,
          };

          const { error: updateError } = await supabase
            .from('questions')
            .update(questionUpdate)
            .eq('id', existingQuestions[i].id);

          if (updateError) {
            console.error(`Error updating question ${i + 1}:`, updateError);
            return { success: false, error: updateError.message };
          }
        }
      }

      return { success: true, data: groupData };
    } catch (error: any) {
      console.error('Exception in updateQuestionGroup:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteQuestionGroup(groupId: string) {
    try {
      // Delete will cascade to questions due to ON DELETE CASCADE
      const { error } = await supabase
        .from('question_groups')
        .delete()
        .eq('id', groupId);

      if (error) {
        console.error('Error deleting question group:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Exception in deleteQuestionGroup:', error);
      return { success: false, error: error.message };
    }
  }

  async updateQuestion(questionId: string, updates: Partial<Question>) {
    try {
      const { data, error } = await supabase
        .from('questions')
        .update(updates)
        .eq('id', questionId)
        .select()
        .single();

      if (error) {
        console.error('Error updating question:', error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Exception in updateQuestion:', error);
      return { success: false, error: error.message };
    }
  }

  async getQuestionGroupStats(subjectId?: string) {
    try {
      let query = supabase
        .from('question_groups')
        .select('id, difficulty, is_active', { count: 'exact' });

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching question group stats:', error);
        return { success: false, error: error.message };
      }

      const stats = {
        total: count || 0,
        active: data?.filter((g) => g.is_active).length || 0,
        inactive: data?.filter((g) => !g.is_active).length || 0,
        by_difficulty: {
          easy: data?.filter((g) => g.difficulty === 'easy').length || 0,
          medium: data?.filter((g) => g.difficulty === 'medium').length || 0,
          hard: data?.filter((g) => g.difficulty === 'hard').length || 0,
        },
      };

      return { success: true, data: stats };
    } catch (error: any) {
      console.error('Exception in getQuestionGroupStats:', error);
      return { success: false, error: error.message };
    }
  }
}

export const questionGroupService = new QuestionGroupService();
