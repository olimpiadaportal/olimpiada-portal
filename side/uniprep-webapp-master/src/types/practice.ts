/**
 * Practice Mode Types
 * Supports MCQ, Codable Open, and Written Open question types
 * Matches mobile app implementation for 100% feature parity
 */

export type QuestionType = 'mcq' | 'codable_open' | 'written_open';
export type PracticeMode = 'practice' | 'quiz';

/**
 * Question interface supporting all question types
 * - MCQ: Uses option_a through option_e, correct_answer is 'A'-'E'
 * - Codable Open: Uses correct_answer as text (e.g., "H2O", "42")
 * - Written Open: Uses correct_answer as model answer text
 */
export interface Question {
  id: string;
  subject_id: string;
  topic: string;
  subtopic_id?: string;
  question_text: string;
  question_image_url?: string;
  question_type?: QuestionType; // Defaults to 'mcq' if not specified
  
  // MCQ fields (required for MCQ, empty/null for open questions)
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  
  // Unified correct_answer field
  // - MCQ: 'A', 'B', 'C', 'D', or 'E'
  // - Codable Open: Exact answer text (case-insensitive comparison)
  // - Written Open: Model answer for AI grading reference
  correct_answer: string;
  
  explanation?: string;
  difficulty: string;
  created_at?: string;
}

/**
 * Answer interface for student responses
 * Supports both MCQ (A-E) and text answers (codable_open)
 */
export interface Answer {
  id?: string;
  user_id: string;
  question_id: string;
  selected_answer?: string; // For MCQ: 'A'-'E'
  text_answer?: string; // For codable_open/written_open
  is_correct: boolean;
  time_spent_seconds: number;
  practice_session_id?: string;
  answered_at: string;
}

/**
 * Practice session tracking
 */
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

/**
 * Bookmarked question
 */
export interface BookmarkedQuestion {
  id: string;
  user_id: string;
  question_id: string;
  question?: Question;
  notes?: string;
  created_at: string;
}

/**
 * Question review data for results screen
 */
export interface QuestionReview {
  id: string;
  question_text: string;
  question_type?: QuestionType;
  question_image_url?: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string;
  correct_answer: string;
  user_answer: string; // Can be 'A'-'E' for MCQ or text for codable_open
  is_correct: boolean;
  explanation?: string;
  time_spent_seconds: number;
}

/**
 * Practice results summary
 */
export interface PracticeResults {
  session_id: string;
  subject_id: string;
  subject_name: string;
  mode: PracticeMode;
  total_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  skipped_questions: number;
  accuracy: number;
  total_time_seconds: number;
  average_time_per_question: number;
  questions: QuestionReview[];
}

/**
 * Subtopic item matching subject_subtopics table row
 */
export interface SubtopicItem {
  id: string;
  topic_id: string;
  subtopic_name: string;
  description?: string;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  display_order: number;
  is_active: boolean;
}

/**
 * Topic with its nested subtopics — used by TopicSelectionModal
 */
export interface TopicWithSubtopics {
  id: string;
  topic_name: string;
  question_count: number;
  is_active: boolean;
  subtopics: SubtopicItem[];
}
