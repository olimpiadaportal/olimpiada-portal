import { supabase } from './supabase';
import { ExamType, ExamGroup } from '../types/mockExam';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherQuestion {
  id: string;
  teacher_id: string;
  subject_id: string;
  topic_id?: string;
  subtopic_id?: string;
  question_type: 'mcq' | 'short_answer';
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer: string;
  explanation?: string;
  image_url?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  created_at: string;
  // joined fields
  subject_name?: string;
  topic_name?: string;
  subtopic_name?: string;
}

export interface CreateTeacherQuestionData {
  subject_id: string;
  topic_id?: string;
  subtopic_id?: string;
  question_type: 'mcq' | 'short_answer';
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer: string;
  explanation?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface TeacherExamSummary {
  id: string;
  title: string;
  exam_type: ExamType;
  target_group?: ExamGroup;
  duration_minutes: number;
  total_questions: number;
  is_approved: boolean;
  is_draft: boolean;
  uses_teacher_questions: boolean;
  created_at: string;
  question_count: number;
}

export interface CreateTeacherExamData {
  title: string;
  exam_type: ExamType;
  target_group?: ExamGroup;     // optional for 'individual' type
  duration_minutes: number;
  total_questions: number;
  exam_group_id?: string;       // for first_stage/second_stage — links to exam_groups table
}

export interface ExamQuestionEntry {
  // exactly one of these set:
  question_id?: string;        // Elmly question
  teacher_question_id?: string; // Teacher question
  question_order: number;
}

// Used for building the selected-questions list in both create and edit mode
export interface SelectedQuestion {
  id: string;                    // local list key (either question_id or teacher_question_id)
  question_id?: string;          // Elmly question id
  teacher_question_id?: string;  // Teacher question id
  question_text: string;
  subject_name?: string;
  subject_id?: string;           // for group-based progress tracking
  source: 'mine' | 'elmly';
}

export interface SubjectOption {
  id: string;
  name_en: string;
  name_az: string;
}

export interface TopicOption {
  id: string;
  topic_name: string;
}

export interface SubtopicOption {
  id: string;
  subtopic_name: string;
  topic_id: string;
}

// Simple Elmly question for search results
export interface ElmlyQuestionResult {
  id: string;
  subject_id: string;
  subject_name: string;
  question_type: string;
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer: string;
  difficulty: string;
}

export interface RecommendedTeacherCard {
  teacher_id: string;
  full_name: string;
  avatar_url?: string;
  subjects: SubjectInfo[];      // [{id, name_az, name_en}] — matched from subjects table
  exam_count: number;
  avg_rating?: number;
  score?: number;
}

export interface SubjectInfo {
  id: string;
  name_az: string;
  name_en: string;
}

export interface ExamGroupSubject {
  group_id: string;
  subject_id: string;
  subject_name_az: string;
  subject_name_en: string;
  coefficient: number;
  questions_count: number;
  subject_max_points: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const teacherExamService = {

  // ── Questions ────────────────────────────────────────────────────────────

  async getMyQuestions(
    teacherId: string,
    subjectId?: string,
    search?: string,
  ): Promise<TeacherQuestion[]> {
    let query = supabase
      .from('teacher_questions')
      .select(`
        *,
        subjects!subject_id ( name_en, name_az ),
        subject_topics!topic_id ( topic_name ),
        subject_subtopics!subtopic_id ( subtopic_name )
      `)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });

    if (subjectId) query = query.eq('subject_id', subjectId);
    if (search) query = query.ilike('question_text', `%${search}%`);

    const { data, error } = await query;
    if (error) {
      console.error('getMyQuestions error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      subject_name: row.subjects?.name_az || row.subjects?.name_en,
      topic_name: row.subject_topics?.topic_name,
      subtopic_name: row.subject_subtopics?.subtopic_name,
    }));
  },

  async createQuestion(
    teacherId: string,
    data: CreateTeacherQuestionData,
  ): Promise<string | null> {
    const { data: result, error } = await supabase
      .from('teacher_questions')
      .insert({ ...data, teacher_id: teacherId })
      .select('id')
      .single();

    if (error) {
      console.error('createQuestion error:', error);
      return null;
    }
    return result.id;
  },

  // Update an existing teacher question — only allowed if the teacher owns it
  async updateQuestion(
    teacherId: string,
    questionId: string,
    data: CreateTeacherQuestionData,
  ): Promise<boolean> {
    const { error } = await supabase
      .from('teacher_questions')
      .update(data)
      .eq('id', questionId)
      .eq('teacher_id', teacherId);  // RLS + explicit owner guard

    if (error) {
      console.error('updateQuestion error:', error);
      return false;
    }
    return true;
  },

  // Fetch a single teacher question by ID (for edit pre-fill)
  async getQuestion(questionId: string): Promise<TeacherQuestion | null> {
    const { data, error } = await supabase
      .from('teacher_questions')
      .select(`
        *,
        subjects!subject_id ( name_en, name_az ),
        subject_topics!topic_id ( topic_name ),
        subject_subtopics!subtopic_id ( subtopic_name )
      `)
      .eq('id', questionId)
      .single();

    if (error || !data) {
      console.error('getQuestion error:', error);
      return null;
    }
    return {
      ...data,
      subject_name: data.subjects?.name_az || data.subjects?.name_en,
      topic_name: data.subject_topics?.topic_name,
      subtopic_name: data.subject_subtopics?.subtopic_name,
    } as TeacherQuestion;
  },

  async deleteQuestion(teacherId: string, questionId: string): Promise<boolean> {
    const { error } = await supabase
      .from('teacher_questions')
      .delete()
      .eq('id', questionId)
      .eq('teacher_id', teacherId);  // explicit owner guard (defense in depth over RLS)

    if (error) {
      console.error('deleteQuestion error:', error);
      return false;
    }
    return true;
  },

  // ── Exams ─────────────────────────────────────────────────────────────────

  async getMyExams(teacherId: string): Promise<TeacherExamSummary[]> {
    const { data, error } = await supabase
      .rpc('get_my_teacher_exams', { p_teacher_id: teacherId });

    if (error) {
      console.error('getMyExams error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      exam_type: row.exam_type,
      target_group: row.target_group,
      duration_minutes: row.duration_minutes,
      total_questions: row.total_questions,
      is_approved: row.is_approved,
      is_draft: row.is_draft ?? false,
      uses_teacher_questions: row.uses_teacher_questions,
      created_at: row.created_at,
      question_count: Number(row.question_count) || 0,
    }));
  },

  async createExam(
    teacherId: string,
    examData: CreateTeacherExamData,
    questions: ExamQuestionEntry[],
    isDraft = false,
  ): Promise<string | null> {
    // Insert exam row — is_official=FALSE, is_approved=FALSE per spec
    const { data: exam, error: examError } = await supabase
      .from('mock_exams')
      .insert({
        ...examData,
        created_by_teacher: teacherId,
        uses_teacher_questions: true, // ALL teacher exams store questions in teacher_exam_questions
        is_official: false,
        is_approved: false,
        is_draft: isDraft,
      })
      .select('id')
      .single();

    if (examError || !exam) {
      console.error('createExam error:', examError);
      return null;
    }

    if (questions.length > 0) {
      const rows = questions.map((q) => ({
        exam_id: exam.id,
        question_id: q.question_id ?? null,
        teacher_question_id: q.teacher_question_id ?? null,
        question_order: q.question_order,
      }));

      const { error: qError } = await supabase
        .from('teacher_exam_questions')
        .insert(rows);

      if (qError) {
        console.error('createExam — insert questions error:', qError);
        // Rollback exam row on failure
        await supabase.from('mock_exams').delete().eq('id', exam.id);
        return null;
      }
    }

    return exam.id;
  },

  async deleteExam(teacherId: string, examId: string): Promise<boolean> {
    const { error } = await supabase
      .from('mock_exams')
      .delete()
      .eq('id', examId)
      .eq('created_by_teacher', teacherId);  // explicit owner guard (defense in depth over RLS)

    if (error) {
      console.error('deleteExam error:', error);
      return false;
    }
    return true;
  },

  // Update an existing pending exam — replaces exam metadata + all questions.
  // Security: only the teacher who created it can update it (RLS enforces created_by_teacher).
  // Editing a pending exam keeps is_approved=false so admin re-reviews it.
  async updateExam(
    teacherId: string,
    examId: string,
    examData: CreateTeacherExamData,
    questions: ExamQuestionEntry[],
    isDraft = false,
  ): Promise<boolean> {
    // Only update if this teacher owns the exam and it is still pending (not yet approved)
    const { error: updateError } = await supabase
      .from('mock_exams')
      .update({
        title: examData.title,
        exam_type: examData.exam_type,
        target_group: examData.target_group ?? null,
        duration_minutes: examData.duration_minutes,
        total_questions: examData.total_questions,
        exam_group_id: examData.exam_group_id ?? null,
        is_approved: false,  // reset approval so admin re-reviews updated exam
        is_draft: isDraft,
      })
      .eq('id', examId)
      .eq('created_by_teacher', teacherId)
      .eq('is_approved', false);  // guard: only editable while pending

    if (updateError) {
      console.error('updateExam error:', updateError);
      return false;
    }

    // Replace all existing questions for this exam
    await supabase.from('teacher_exam_questions').delete().eq('exam_id', examId);

    if (questions.length > 0) {
      const rows = questions.map((q) => ({
        exam_id: examId,
        question_id: q.question_id ?? null,
        teacher_question_id: q.teacher_question_id ?? null,
        question_order: q.question_order,
      }));

      const { error: qError } = await supabase
        .from('teacher_exam_questions')
        .insert(rows);

      if (qError) {
        console.error('updateExam — insert questions error:', qError);
        return false;
      }
    }

    return true;
  },

  // Load exam metadata + existing questions for edit mode pre-fill.
  // Only loads if exam is pending (is_approved=false) to prevent editing approved exams.
  async getExamForEdit(examId: string): Promise<{
    examMeta: CreateTeacherExamData & { id: string; title: string };
    questions: SelectedQuestion[];
  } | null> {
    const { data: exam, error } = await supabase
      .from('mock_exams')
      .select('id, title, exam_type, target_group, duration_minutes, total_questions, exam_group_id')
      .eq('id', examId)
      .eq('is_approved', false)
      .single();

    if (error || !exam) {
      console.error('getExamForEdit error:', error);
      return null;
    }

    const { data: teqRows, error: tqError } = await supabase
      .rpc('get_teacher_exam_questions', { p_exam_id: examId });

    if (tqError) {
      console.error('getExamForEdit — fetch questions error:', tqError);
    }

    const questions: SelectedQuestion[] =
      (teqRows || [])
        .sort((a: any, b: any) => (a.question_order || 0) - (b.question_order || 0))
        .map((q: any) => ({
          id: String(q.question_id),
          question_id: q.source === 'elmly' ? String(q.question_id) : undefined,
          teacher_question_id: q.source === 'teacher' ? String(q.question_id) : undefined,
          question_text: q.question_text || '',
          subject_name: q.subject_name || '',
          subject_id: q.subject_id ? String(q.subject_id) : undefined,
          source: (q.source === 'elmly' ? 'elmly' : 'mine') as 'mine' | 'elmly',
        }));

    return {
      examMeta: {
        id: exam.id,
        title: exam.title,
        exam_type: exam.exam_type as ExamType,
        target_group: exam.target_group as ExamGroup | undefined,
        duration_minutes: exam.duration_minutes,
        total_questions: exam.total_questions,
        exam_group_id: exam.exam_group_id,
      },
      questions,
    };
  },

  // ── Reference data ────────────────────────────────────────────────────────

  async getSubjects(): Promise<SubjectOption[]> {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name_en, name_az')
      .order('name_az');

    if (error) return [];
    return data || [];
  },

  async getTopics(subjectId: string): Promise<TopicOption[]> {
    const { data, error } = await supabase
      .from('subject_topics')
      .select('id, topic_name')
      .eq('subject_id', subjectId)
      .order('topic_name');

    if (error) return [];
    return data || [];
  },

  async getSubtopics(topicId: string): Promise<SubtopicOption[]> {
    const { data, error } = await supabase
      .from('subject_subtopics')
      .select('id, subtopic_name, topic_id')
      .eq('topic_id', topicId)
      .order('subtopic_name');

    if (error) return [];
    return data || [];
  },

  // ── Exam Group Config (for first_stage / second_stage teacher exams) ─────────

  async getExamGroupConfig(
    groupCode: string,
    stage: 'first' | 'second',
  ): Promise<ExamGroupSubject[]> {
    const { data, error } = await supabase
      .rpc('get_teacher_exam_group_subjects', {
        p_group_code: groupCode,
        p_stage: stage,
      });

    if (error) {
      console.error('getExamGroupConfig error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      group_id: row.group_id,
      subject_id: row.subject_id,
      subject_name_az: row.subject_name_az,
      subject_name_en: row.subject_name_en,
      coefficient: Number(row.coefficient),
      questions_count: Number(row.questions_count),
      subject_max_points: Number(row.subject_max_points),
    }));
  },

  // ── Elmly question search (for including official questions in teacher exam) ─

  async searchElmlyQuestions(
    subjectId: string,
    search?: string,
    limit = 30,
  ): Promise<ElmlyQuestionResult[]> {
    let query = supabase
      .from('questions')
      .select(`
        id, subject_id, question_type, question_text,
        option_a, option_b, option_c, option_d, correct_answer, difficulty,
        subjects!subject_id ( name_az, name_en )
      `)
      .eq('subject_id', subjectId)
      .in('question_type', ['mcq', 'codable_open'])  // Only standard question types from Elmly DB
      .limit(limit);

    if (search) query = query.ilike('question_text', `%${search}%`);

    const { data, error } = await query;
    if (error) {
      console.error('searchElmlyQuestions error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...row,
      subject_name: row.subjects?.name_az || row.subjects?.name_en || '',
    }));
  },

  // ── Recommended teachers for ExamsHubScreen ───────────────────────────────

  async getRecommendedTeacherExams(studentId: string): Promise<RecommendedTeacherCard[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_recommended_teacher_exams', { p_student_id: studentId });

      if (error) throw error;
      return (data || []) as RecommendedTeacherCard[];
    } catch (error) {
      console.error('getRecommendedTeacherExams error:', error);
      return [];
    }
  },

  // ── Teacher exam ratings ──────────────────────────────────────────────────

  async getExamRating(attemptId: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('teacher_exam_ratings')
        .select('rating')
        .eq('attempt_id', attemptId)
        .maybeSingle();
      if (error) throw error;
      return data?.rating ?? null;
    } catch (error) {
      console.error('getExamRating error:', error);
      return null;
    }
  },

  async submitExamRating(examId: string, attemptId: string, rating: number): Promise<void> {
    const { error } = await supabase.rpc('submit_teacher_exam_rating', {
      p_exam_id: examId,
      p_attempt_id: attemptId,
      p_rating: rating,
    });
    if (error) throw error;
  },
};
