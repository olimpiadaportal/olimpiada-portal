// Question Bank Types

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'mcq' | 'codable_open' | 'written_open';

// Grading rubric for written open questions
export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  max_points: number;
  weight?: number; // Optional weight for weighted scoring
}

export interface GradingRubric {
  criteria: RubricCriterion[];
  total_points: number;
  grading_notes?: string;
}

// Question Group (Situasiya) - for bundled written open questions
export interface QuestionGroup {
  id: string;
  subject_id: string;
  topic?: string;
  subtopic_id?: string;
  question_type?: QuestionType; // 'written_open' | 'codable_open'

  // Shared context/scenario (Situasiya)
  context_text: string;
  context_image_url?: string;

  // Metadata
  difficulty: 'easy' | 'medium' | 'hard';
  tags?: string[];
  source?: string;
  year?: number;

  // Status
  is_active: boolean;
  exclude_from_practice: boolean;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;

  // Related questions (populated when fetching)
  questions?: Question[];
}

export interface Question {
  id: string;
  subject_id: string;
  topic?: string;  // Links to subject_topics.topic_name
  subtopic_id?: string;    // NEW: FK → subject_subtopics(id), nullable
  subtopic_name?: string;  // NEW: denormalized for display (populated by join queries)
  question_text: string;
  question_image_url?: string;
  
  // Question type (default: mcq)
  question_type: QuestionType;
  
  // Question group (for bundled questions with shared context)
  group_id?: string;
  group_order?: number;  // Order within group (1, 2, 3)
  
  // MCQ fields (required for mcq, null for open questions)
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer?: 'A' | 'B' | 'C' | 'D' | 'E' | string;  // 'A'-'E' for MCQ, any text for codable_open
  
  // Open question fields
  expected_answer?: string;  // For written_open: sample answer for AI reference
  answer_keywords?: string[];  // For codable_open: keywords for partial matching
  max_points: number;  // Maximum points (default: 1 for MCQ)
  grading_rubric?: GradingRubric;  // For written_open: detailed grading criteria
  sample_answer?: string;  // Sample/model answer for reference
  
  // Practice session exclusion (auto-set for written_open)
  exclude_from_practice: boolean;
  
  explanation?: string;
  difficulty: QuestionDifficulty;
  tags?: string[];
  source?: string;
  year?: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

export interface QuestionImport {
  id: string;
  filename: string;
  total_questions: number;
  successful_imports: number;
  failed_imports: number;
  errors: ImportError[];
  imported_by?: string;
  created_at: string;
  completed_at?: string;
}

export interface ImportError {
  question: any;
  error: string;
}

export interface QuestionBulkUpload {
  topic?: string;  // Optional: topic name (must match subject_topics.topic_name)
  subtopic?: string;  // NEW: optional subtopic name (must match subject_subtopics.subtopic_name for the given topic)
  question_text: string;
  question_image_url?: string;
  
  // Question type (default: mcq if not specified)
  question_type?: QuestionType;
  
  // MCQ fields (required for mcq, optional for open questions)
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer?: 'A' | 'B' | 'C' | 'D' | 'E' | string;  // 'A'-'E' for MCQ, any text for codable_open
  
  // Open question fields
  expected_answer?: string;  // For written_open: sample answer for AI reference
  answer_keywords?: string[];
  max_points?: number;
  grading_rubric?: GradingRubric;
  sample_answer?: string;
  
  explanation?: string;
  difficulty?: QuestionDifficulty;
  tags?: string[];
  source?: string;
  year?: number;
  image_url?: string;
}

export interface QuestionSearchFilters {
  subject_id?: string;
  topic?: string;
  subtopic_id?: string;
  difficulty?: QuestionDifficulty;
  question_type?: QuestionType;  // Filter by question type
  search_text?: string;
  tags?: string[];
  is_active?: boolean;
  exclude_from_practice?: boolean;  // Filter practice-excluded questions
  limit?: number;
  offset?: number;
}

export interface QuestionStatistics {
  total_questions: number;
  active_questions: number;
  inactive_questions: number;
  by_difficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
  by_type: {
    mcq: number;
    codable_open: number;
    written_open: number;
  };
  by_subject: Record<string, number>;
}

export interface Subject {
  id: string;
  name_en: string;
  name_az: string;
  category: string;
  created_at: string;
}

export interface BulkImportResult {
  import_id: string;
  total: number;
  successful: number;
  failed: number;
  errors: ImportError[];
}
