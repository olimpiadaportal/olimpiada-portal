import { createClient } from '@/lib/supabase/client'
import {
  TeacherQuestion,
  TeacherExam,
  TeacherExamQuestion,
  RecommendedTeacher,
  ExamFormData,
  QuestionFormData,
  SubjectTopic,
  SubjectSubtopic,
  ExamGroupSubject,
  ElmlyQuestion,
} from '@/types/teacherExam'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDb = () => createClient() as any

class TeacherExamService {
  // ─── Questions ────────────────────────────────────────────────────────────

  async getMyQuestions(teacherId: string): Promise<TeacherQuestion[]> {
    const db = getDb()
    const { data, error } = await db
      .from('teacher_questions')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async createQuestion(
    teacherId: string,
    formData: QuestionFormData
  ): Promise<TeacherQuestion> {
    const db = getDb()
    const payload: Record<string, unknown> = {
      teacher_id: teacherId,
      question_text: formData.question_text.trim(),
      question_type: formData.question_type,
      correct_answer: formData.correct_answer.trim(),
      explanation: formData.explanation?.trim() || null,
      difficulty: formData.difficulty || null,
      subject_id: formData.subject_id || null,
      subtopic_id: formData.subtopic_id || null,
    }

    if (formData.question_type === 'mcq') {
      payload.option_a = formData.option_a?.trim() || null
      payload.option_b = formData.option_b?.trim() || null
      payload.option_c = formData.option_c?.trim() || null
      payload.option_d = formData.option_d?.trim() || null
      payload.option_e = formData.option_e?.trim() || null
    }

    const { data, error } = await db
      .from('teacher_questions')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }

  async updateQuestion(
    teacherId: string,
    questionId: string,
    formData: QuestionFormData
  ): Promise<TeacherQuestion> {
    const db = getDb()
    const payload: Record<string, unknown> = {
      question_text: formData.question_text.trim(),
      question_type: formData.question_type,
      correct_answer: formData.correct_answer.trim(),
      explanation: formData.explanation?.trim() || null,
      difficulty: formData.difficulty || null,
      subject_id: formData.subject_id || null,
      subtopic_id: formData.subtopic_id || null,
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      option_e: null,
    }

    if (formData.question_type === 'mcq') {
      payload.option_a = formData.option_a?.trim() || null
      payload.option_b = formData.option_b?.trim() || null
      payload.option_c = formData.option_c?.trim() || null
      payload.option_d = formData.option_d?.trim() || null
      payload.option_e = formData.option_e?.trim() || null
    }

    const { data, error } = await db
      .from('teacher_questions')
      .update(payload)
      .eq('id', questionId)
      .eq('teacher_id', teacherId) // explicit owner guard
      .select()
      .single()
    if (error) throw error
    return data
  }

  async deleteQuestion(teacherId: string, questionId: string): Promise<void> {
    const db = getDb()
    const { error } = await db
      .from('teacher_questions')
      .delete()
      .eq('id', questionId)
      .eq('teacher_id', teacherId) // explicit owner guard
    if (error) throw error
  }

  // ─── Exams ─────────────────────────────────────────────────────────────────

  async getMyExams(teacherId: string): Promise<TeacherExam[]> {
    const db = getDb()
    const { data, error } = await db.rpc('get_my_teacher_exams', {
      p_teacher_id: teacherId,
    })
    if (error) throw error
    return data || []
  }

  async createExam(
    teacherId: string,
    formData: ExamFormData
  ): Promise<string> {
    const db = getDb()
    const { data, error } = await db
      .from('mock_exams')
      .insert({
        title: formData.title.trim(),
        exam_type: formData.exam_type,
        target_group: formData.target_group,
        duration_minutes: formData.duration_minutes,
        created_by_teacher: teacherId,
        uses_teacher_questions: true,
        is_approved: false,
        is_official: false,
        is_draft: true,
        total_questions: formData.total_questions || 0,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async updateExam(
    teacherId: string,
    examId: string,
    formData: Partial<ExamFormData>
  ): Promise<void> {
    const db = getDb()
    const payload: Record<string, unknown> = {}
    if (formData.title !== undefined) payload.title = formData.title.trim()
    if (formData.exam_type !== undefined) payload.exam_type = formData.exam_type
    if (formData.target_group !== undefined) payload.target_group = formData.target_group
    if (formData.duration_minutes !== undefined) payload.duration_minutes = formData.duration_minutes
    if (formData.total_questions !== undefined) payload.total_questions = formData.total_questions

    const { error } = await db
      .from('mock_exams')
      .update(payload)
      .eq('id', examId)
      .eq('created_by_teacher', teacherId) // explicit owner guard
    if (error) throw error
  }

  async deleteExam(teacherId: string, examId: string): Promise<void> {
    const db = getDb()
    const { error } = await db
      .from('mock_exams')
      .delete()
      .eq('id', examId)
      .eq('created_by_teacher', teacherId) // explicit owner guard
    if (error) throw error
  }

  async publishExam(teacherId: string, examId: string): Promise<void> {
    const db = getDb()
    const { error } = await db
      .from('mock_exams')
      .update({ is_draft: false })
      .eq('id', examId)
      .eq('created_by_teacher', teacherId) // explicit owner guard
    if (error) throw error
  }

  // ─── Exam Questions ────────────────────────────────────────────────────────

  async getExamQuestions(examId: string): Promise<TeacherExamQuestion[]> {
    const db = getDb()
    const { data, error } = await db.rpc('get_teacher_exam_questions', {
      p_exam_id: examId,
    })
    if (error) throw error
    return data || []
  }

  async addQuestionsToExam(
    examId: string,
    teacherQuestionIds: string[]
  ): Promise<{ id: string; teacher_question_id: string }[]> {
    const db = getDb()
    const { data: existing } = await db
      .from('teacher_exam_questions')
      .select('question_order')
      .eq('exam_id', examId)
      .order('question_order', { ascending: false })
      .limit(1)

    let nextOrder = (existing?.[0]?.question_order ?? 0) + 1

    const rows = teacherQuestionIds.map((qId) => ({
      exam_id: examId,
      teacher_question_id: qId,
      question_order: nextOrder++,
    }))

    const { data: inserted, error } = await db
      .from('teacher_exam_questions')
      .insert(rows)
      .select('id, teacher_question_id')
    if (error) throw error

    return inserted || []
  }

  async removeQuestionFromExam(
    examId: string,
    teacherExamQuestionId: string
  ): Promise<void> {
    const db = getDb()
    const { error } = await db
      .from('teacher_exam_questions')
      .delete()
      .eq('id', teacherExamQuestionId)
      .eq('exam_id', examId)
    if (error) throw error
  }

  async addElmlyQuestionsToExam(
    examId: string,
    elmlyQuestionIds: string[]
  ): Promise<{ id: string; question_id: string }[]> {
    const db = getDb()
    const { data: existing } = await db
      .from('teacher_exam_questions')
      .select('question_order')
      .eq('exam_id', examId)
      .order('question_order', { ascending: false })
      .limit(1)

    let nextOrder = (existing?.[0]?.question_order ?? 0) + 1

    const rows = elmlyQuestionIds.map((qId) => ({
      exam_id: examId,
      question_id: qId,
      question_order: nextOrder++,
    }))

    const { data: inserted, error } = await db
      .from('teacher_exam_questions')
      .insert(rows)
      .select('id, question_id')
    if (error) throw error

    return inserted || []
  }

  async clearExamQuestions(examId: string): Promise<void> {
    const db = getDb()
    const { error } = await db
      .from('teacher_exam_questions')
      .delete()
      .eq('exam_id', examId)
    if (error) throw error
  }

  async reorderExamQuestions(
    examId: string,
    orderedIds: string[]
  ): Promise<void> {
    const db = getDb()
    await Promise.all(
      orderedIds.map((id, index) =>
        db
          .from('teacher_exam_questions')
          .update({ question_order: index + 1 })
          .eq('id', id)
          .eq('exam_id', examId)
      )
    )
  }

  // ─── Subject hierarchy ─────────────────────────────────────────────────────

  async getTopics(subjectId: string): Promise<SubjectTopic[]> {
    const db = getDb()
    const { data, error } = await db
      .from('subject_topics')
      .select('id, topic_name')
      .eq('subject_id', subjectId)
      .order('topic_name')
    if (error) throw error
    return (data || []).map((row: any) => ({ id: row.id, name: row.topic_name }))
  }

  async getSubtopics(topicId: string): Promise<SubjectSubtopic[]> {
    const db = getDb()
    const { data, error } = await db
      .from('subject_subtopics')
      .select('id, subtopic_name')
      .eq('topic_id', topicId)
      .order('subtopic_name')
    if (error) throw error
    return data || []
  }

  // ─── Exam group config (stage exams) ─────────────────────────────────────

  async getExamGroupConfig(groupCode: string, stage: 'first' | 'second'): Promise<ExamGroupSubject[]> {
    const db = getDb()
    const { data, error } = await db.rpc('get_teacher_exam_group_subjects', {
      p_group_code: groupCode,
      p_stage: stage,
    })
    if (error) throw error
    return data || []
  }

  async searchElmlyQuestions(subjectId: string, search?: string, limit = 30): Promise<ElmlyQuestion[]> {
    const db = getDb()
    let query = db
      .from('questions')
      .select('id, subject_id, question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, difficulty, subjects!subject_id(name_az, name_en)')
      .eq('subject_id', subjectId)
      .in('question_type', ['mcq', 'codable_open'])
      .limit(limit)
    if (search?.trim()) {
      query = query.ilike('question_text', `%${search.trim()}%`)
    }
    const { data, error } = await query
    if (error) throw error
    return (data || []).map((row: any) => ({
      id: row.id,
      subject_id: row.subject_id,
      question_type: row.question_type,
      question_text: row.question_text,
      option_a: row.option_a,
      option_b: row.option_b,
      option_c: row.option_c,
      option_d: row.option_d,
      correct_answer: row.correct_answer,
      difficulty: row.difficulty,
      subject_name_az: row.subjects?.name_az ?? '',
      subject_name_en: row.subjects?.name_en ?? '',
    }))
  }

  // ─── Student-facing ────────────────────────────────────────────────────────

  async getRecommendedTeachers(
    studentUserId: string
  ): Promise<RecommendedTeacher[]> {
    const db = getDb()
    const { data, error } = await db.rpc('get_recommended_teacher_exams', {
      p_student_id: studentUserId,
    })
    if (error) throw error
    return (data || []).map((row: any) => ({
      ...row,
      subjects: Array.isArray(row.subjects) ? row.subjects : [],
    }))
  }

  async getTeacherApprovedExams(teacherId: string): Promise<TeacherExam[]> {
    const db = getDb()
    const { data, error } = await db
      .from('mock_exams')
      .select('*')
      .eq('created_by_teacher', teacherId)
      .eq('is_approved', true)
      .eq('is_draft', false)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async getTeacherPublicProfile(
    teacherId: string
  ): Promise<{ full_name: string; avatar_url: string | null; specializations: string[] } | null> {
    const db = getDb()
    const { data, error } = await db
      .from('teachers')
      .select('id, specializations, profiles!inner(full_name, avatar_url)')
      .eq('id', teacherId)
      .single()
    if (error) return null
    return {
      full_name: data.profiles?.full_name ?? '',
      avatar_url: data.profiles?.avatar_url ?? null,
      specializations: data.specializations ?? [],
    }
  }

  async getExamRating(attemptId: string): Promise<number | null> {
    try {
      const db = getDb()
      const { data, error } = await db
        .from('teacher_exam_ratings')
        .select('rating')
        .eq('attempt_id', attemptId)
        .maybeSingle()
      if (error) throw error
      return data?.rating ?? null
    } catch (error) {
      console.error('getExamRating error:', error)
      return null
    }
  }

  async submitExamRating(examId: string, attemptId: string, rating: number): Promise<void> {
    const db = getDb()
    const { error } = await db.rpc('submit_teacher_exam_rating', {
      p_exam_id: examId,
      p_attempt_id: attemptId,
      p_rating: rating,
    })
    if (error) throw error
  }
}

export const teacherExamService = new TeacherExamService()
