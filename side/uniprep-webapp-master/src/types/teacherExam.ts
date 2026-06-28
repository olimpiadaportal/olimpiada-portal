export interface TeacherQuestion {
  id: string
  teacher_id: string
  question_text: string
  question_type: 'mcq' | 'short_answer'
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  option_e: string | null
  correct_answer: string
  explanation: string | null
  difficulty: number | null
  subject_id: string | null
  subtopic_id: string | null
  created_at: string
}

export interface TeacherExam {
  id: string
  title: string
  exam_type: 'first_stage' | 'second_stage' | 'individual' | 'full_exam'
  target_group: 'I' | 'II' | 'III' | 'IV' | 'V' | null
  duration_minutes: number
  total_questions: number
  is_approved: boolean
  is_draft: boolean
  uses_teacher_questions: boolean
  created_at: string
  question_count: number
}

export interface TeacherExamQuestion {
  id: string
  question_order: number
  question_id: string | null
  question_text: string
  question_type: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  option_e: string | null
  correct_answer: string
  explanation: string | null
  difficulty: string | null
  subject_id: string | null
  subject_name: string | null
  source: 'teacher' | 'elmly'
}

export interface RecommendedTeacher {
  teacher_id: string
  full_name: string
  avatar_url: string | null
  subjects: Array<{ id: string; name_az: string; name_en: string }>
  exam_count: number
  avg_rating: number | null
  score: number
}

export interface ExamFormData {
  title: string
  exam_type: 'first_stage' | 'second_stage' | 'individual' | 'full_exam'
  target_group: 'I' | 'II' | 'III' | 'IV' | 'V' | null
  duration_minutes: number
  total_questions: number
}

export interface QuestionFormData {
  question_text: string
  question_type: 'mcq' | 'short_answer'
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string
  correct_answer: string
  explanation: string
  difficulty: number
  subject_id: string
  topic_id: string    // UI cascade only, not stored directly
  subtopic_id: string // stored in teacher_questions.subtopic_id
}

export interface SubjectTopic {
  id: string
  name: string
}

export interface SubjectSubtopic {
  id: string
  subtopic_name: string
}

export interface ExamGroupSubject {
  group_id: string
  subject_id: string
  subject_name_az: string
  subject_name_en: string
  coefficient: number
  questions_count: number
  subject_max_points: number
}

export interface ElmlyQuestion {
  id: string
  subject_id: string
  question_type: string
  question_text: string
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  correct_answer: string
  difficulty: number | null
  subject_name_az: string
  subject_name_en: string
}

// A unified question entry for exam building (either teacher or Elmly)
export interface SelectedQuestion {
  key: string                         // unique UI key: "teacher:{id}" or "elmly:{id}"
  teq_id: string | null               // teacher_exam_questions.id (set after DB insert)
  teacher_question_id: string | null  // set if from teacher library
  question_id: string | null          // set if from Elmly
  question_text: string
  question_type: string
  subject_id: string | null
  subject_name: string
  source: 'teacher' | 'elmly'
}
