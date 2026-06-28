// Grading types for Open Question Types
// Supports AI grading and manual grading workflows

import { GradingRubric } from './questions';

// AI Grading Request
export interface AIGradingRequest {
  question_id: string;
  question_text: string;
  question_type: 'codable_open' | 'written_open';
  student_answer: string;
  image_url?: string; // For math diagrams
  expected_answer?: string; // For codable_open
  answer_keywords?: string[]; // For codable_open
  grading_rubric?: GradingRubric; // For written_open
  max_points: number;
}

// AI Grading Response
export interface AIGradingResponse {
  score: number;
  feedback: string; // In Azerbaijani
  confidence: number; // 0-1
  rubric_scores?: RubricScore[]; // For written_open
  suggestions?: string; // Improvement suggestions
  graded_at: string;
}

// Rubric score breakdown
export interface RubricScore {
  criterion_id: string;
  criterion_name: string;
  points_earned: number;
  max_points: number;
  feedback: string;
}

// Exam Answer with Grading Data
export interface ExamAnswerWithGrading {
  id: string;
  attempt_id: string;
  question_id: string;
  
  // Answer data
  selected_answer?: 'A' | 'B' | 'C' | 'D' | 'E'; // For MCQ
  text_answer?: string; // For open questions
  image_url?: string; // For math diagrams
  image_uploaded_at?: string;
  image_deleted_at?: string;
  
  // AI grading
  ai_score?: number;
  ai_feedback?: string;
  ai_confidence?: number;
  ai_graded_at?: string;
  
  // Manual grading
  manual_score?: number;
  graded_by?: string; // Admin user ID
  graded_at?: string;
  grading_notes?: string;
  
  // Final score (manual || ai)
  final_score?: number;
  
  // Metadata
  is_marked: boolean;
  time_spent_seconds: number;
  answered_at: string;
  created_at: string;
  updated_at: string;
}

// Manual Grading Queue Item
export interface ManualGradingQueueItem {
  answer_id: string;
  attempt_id: string;
  student_id: string;
  student_name: string;
  question_id: string;
  question_text: string;
  question_type: 'codable_open' | 'written_open';
  subject_name: string;
  
  // Student answer
  text_answer: string;
  image_url?: string;
  
  // AI grading (if available)
  ai_score?: number;
  ai_feedback?: string;
  ai_confidence?: number;
  
  // Grading criteria
  max_points: number;
  grading_rubric?: GradingRubric;
  sample_answer?: string;
  
  // Queue metadata
  submitted_at: string;
  priority: 'high' | 'medium' | 'low'; // Based on AI confidence
}

// Manual Grading Submission
export interface ManualGradingSubmission {
  answer_id: string;
  manual_score: number;
  grading_notes?: string;
  rubric_scores?: RubricScore[]; // For written_open
  graded_by: string; // Admin user ID
}

// Grading Statistics
export interface GradingStatistics {
  total_answers: number;
  ai_graded: number;
  manually_graded: number;
  pending_grading: number;
  
  // AI performance
  average_ai_confidence: number;
  low_confidence_count: number; // confidence < 0.7
  
  // Manual grading workload
  pending_manual_review: number;
  average_grading_time_seconds: number;
  
  // By question type
  by_type: {
    codable_open: {
      total: number;
      ai_graded: number;
      manually_graded: number;
    };
    written_open: {
      total: number;
      ai_graded: number;
      manually_graded: number;
    };
  };
}

// Grading Quality Metrics
export interface GradingQualityMetrics {
  total_reviewed: number;
  ai_accuracy_rate: number; // % where manual score matches AI score (±10%)
  average_score_difference: number; // Average difference between AI and manual scores
  
  // Common issues
  common_issues: {
    issue: string;
    count: number;
    percentage: number;
  }[];
  
  // Grader performance
  graders: {
    grader_id: string;
    grader_name: string;
    total_graded: number;
    average_time_seconds: number;
    consistency_score: number; // How consistent with other graders
  }[];
}

// Batch Grading Request
export interface BatchGradingRequest {
  attempt_id: string;
  answers: {
    answer_id: string;
    question_id: string;
    question_type: 'codable_open' | 'written_open';
    text_answer: string;
    image_url?: string;
  }[];
}

// Batch Grading Response
export interface BatchGradingResponse {
  attempt_id: string;
  total_questions: number;
  graded_count: number;
  failed_count: number;
  results: {
    answer_id: string;
    success: boolean;
    score?: number;
    feedback?: string;
    confidence?: number;
    error?: string;
  }[];
  total_time_seconds: number;
}
