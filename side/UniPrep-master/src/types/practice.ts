export type ExamStage = 'first' | 'second'; // Only used for Exams, not Questions or Subjects
export type PracticeMode = 'practice' | 'quiz';

export interface Question {
  id: string;
  subject_id: string;
  subject_name?: string;
  topic?: string;
  subtopic_id?: string;   // NEW: FK → subject_subtopics, nullable
  question_text: string;
  question_image_url?: string;
  question_type?: 'mcq' | 'codable_open' | 'written_open';
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  correct_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  explanation?: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  // Note: exam_stage removed - questions don't have stages, only Exams do
  exam_group: string;
  created_at: string;
}

// Subtopic item returned by getTopicsWithSubtopics
export interface SubtopicItem {
  id: string;
  topic_id: string;
  subtopic_name: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order: number;
  is_active: boolean;
}

// Topic including its subtopics — used by TopicSelectionModal (Stage 5)
export interface TopicWithSubtopics {
  id: string;
  topic_name: string;
  question_count: number;
  is_active: boolean;
  subtopics: SubtopicItem[];
}

export interface Answer {
  id?: string;
  user_id: string;
  question_id: string;
  selected_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  is_correct: boolean;
  time_spent_seconds: number;
  practice_session_id?: string;
  answered_at: string;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  subject_id: string;
  mode: PracticeMode;
  total_questions: number;
  correct_answers: number;
  total_time_seconds: number;
  completed: boolean;
  started_at: string;
  completed_at?: string;
}

export interface BookmarkedQuestion {
  id: string;
  user_id: string;
  question_id: string;
  question?: Question;
  notes?: string;
  created_at: string;
}

export interface SubjectWithProgress {
  id: string;
  name_en: string;
  name_az: string;
  // Note: exam_stage removed - subjects don't have stages, only Exams do
  exam_group: string;
  total_questions: number;
  practiced_questions: number;
  accuracy: number;
  progress_percentage: number;
  last_practiced?: string;
  cached_questions?: number;
  is_available_offline?: boolean;
  offline_last_sync?: string | null;
}

export interface QuizResult {
  session_id: string;
  subject_id: string;
  subject_name: string;
  total_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  skipped_questions: number;
  score_percentage: number;
  total_time_seconds: number;
  average_time_per_question: number;
  questions_with_answers: Array<{
    question: Question;
    user_answer: 'A' | 'B' | 'C' | 'D' | 'E' | string | null;
    is_correct: boolean;
    time_spent: number;
    question_number?: number;
  }>;
}
