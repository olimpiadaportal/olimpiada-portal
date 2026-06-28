// Exam types for Elmly Admin Panel
// Harmonized with mobile app schema

import { GradingRubric } from './questions';

export type ExamType = 'first_stage' | 'second_stage' | 'full_exam' | 'individual';
export type TargetGroup = 'I' | 'II' | 'III' | 'IV' | 'V';

// Main exam interface (matches mobile app's mock_exams table)
export interface Exam {
  id: string;
  title: string;
  exam_type: ExamType;
  target_group: TargetGroup;
  duration_minutes: number;
  total_questions: number;
  created_at: string;

  // Teacher exam columns (hotfix 73)
  is_official?: boolean;
  created_by_teacher?: string | null;
  is_approved?: boolean;
  uses_teacher_questions?: boolean;

  // Computed (from joins)
  question_count?: number;        // actual questions in exam (from questions table for Elmly, teacher_exam_questions for teacher)
  question_count_actual?: number; // actual count from teacher_exam_questions (teacher submissions)
  teacher_name?: string;
  teacher_avatar_url?: string;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_id: string;
  question_order: number;
  points: number;
  created_at: string;
  
  // Populated from join
  question_text?: string;
  question_type?: 'mcq' | 'codable_open' | 'written_open';
  
  // Question group fields (for written_open)
  group_id?: string;
  group_order?: number;
  context_text?: string; // Shared context from question_groups table
  
  // MCQ fields
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer?: string;
  
  // Open question fields
  expected_answer?: string;
  answer_keywords?: string[];
  max_points?: number;
  grading_rubric?: GradingRubric;
  sample_answer?: string;
  
  difficulty?: string;
  subject_id?: string;
  subject_name?: string;
}

export interface ExamDetails {
  exam: Exam;
  questions: ExamQuestion[];
}

export interface CreateExamInput {
  title: string;
  exam_type: ExamType;
  target_group: TargetGroup;
  duration_minutes: number;
  total_questions: number;
}

export interface UpdateExamInput {
  title?: string;
  exam_type?: ExamType;
  target_group?: TargetGroup;
  duration_minutes?: number;
  total_questions?: number;
}

export interface SearchExamsParams {
  exam_type?: ExamType;
  target_group?: TargetGroup;
  search_text?: string;
  limit?: number;
  offset?: number;
}

export interface QuestionDistribution {
  [subjectName: string]: {
    easy: number;
    medium: number;
    hard: number;
  };
}
