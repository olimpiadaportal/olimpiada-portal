// Mock Exam Types

export type ExamType = 'first_stage' | 'second_stage' | 'full_exam' | 'individual';
export type ExamGroup = 'I' | 'II' | 'III' | 'IV' | 'V';
export type ExamStatus = 'not_started' | 'in_progress' | 'completed';

// Subject coefficient for scoring
export interface SubjectCoefficient {
  subjectId: string;
  subjectName: string;
  coefficient: 1.0 | 1.5;
  maxPoints: number; // 30 questions × coefficient × 10 points
}

// Mock Exam definition
export interface MockExam {
  id: string;
  title: string;
  exam_type: ExamType;
  target_group: ExamGroup;
  duration_minutes: number;
  total_questions: number;
  total_points: number;
  created_at: string;
  subjects?: SubjectCoefficient[];
  // Teacher exam fields
  is_official?: boolean;
  uses_teacher_questions?: boolean;
  created_by_teacher?: string;
  is_approved?: boolean;
}

// Mock Exam with user's attempt status
export interface MockExamWithStatus extends MockExam {
  attempt_count: number;
  best_score?: number;
  last_attempt_date?: string;
  current_attempt_id?: string; // If exam is in progress
  current_attempt_status?: ExamStatus;
}

// Question in exam context
export interface ExamQuestion {
  id: string;
  subject_id: string;
  subject_name: string;
  question_type: 'mcq' | 'codable_open' | 'written_open';
  question_text: string;
  question_image_url?: string;
  // MCQ fields
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  option_e?: string;
  correct_answer?: 'A' | 'B' | 'C' | 'D' | 'E';
  // Open question fields
  expected_answer?: string;
  max_points?: number;
  // Question group fields (for written_open)
  group_id?: string;
  group_order?: number; // 1, 2, or 3 within the group
  context_text?: string; // Shared context from question_groups table
  context_image_url?: string; // Image for the context
  difficulty: 'easy' | 'medium' | 'hard';
  exam_stage?: 'first' | 'second'; // Which stage of the EXAM this question is assigned to
  question_order: number; // Position in exam (1-90)
}

// User's answer to exam question
export interface ExamAnswer {
  question_id: string;
  selected_answer?: 'A' | 'B' | 'C' | 'D' | 'E' | null; // For MCQ
  text_answer?: string; // For codable_open and written_open
  image_url?: string; // For written_open (photo of handwritten work)
  is_marked: boolean; // Marked for review
  time_spent_seconds: number;
}

// Exam attempt (session)
export interface ExamAttempt {
  id: string;
  user_id: string;
  mock_exam_id: string;
  status: ExamStatus;
  started_at: string;
  completed_at?: string;
  submitted_at?: string;
  time_remaining_seconds: number;
  total_score?: number;
  percentage?: number;
  answers: Map<string, ExamAnswer>; // questionId -> answer
}

// Subject performance in exam
export interface SubjectPerformance {
  subject_id: string;
  subject_name: string;
  coefficient: 1.0 | 1.5;
  total_questions: number;
  correct_answers: number;
  raw_score: number; // correct × 10
  weighted_score: number; // raw_score × coefficient
  max_possible: number;
  percentage: number;
}

// Exam results with detailed breakdown
export interface ExamResult {
  attempt_id: string;
  mock_exam_id: string;
  exam_title: string;
  exam_type: ExamType;
  target_group: ExamGroup;
  started_at: string;
  completed_at: string;
  duration_minutes: number;
  time_taken_minutes: number;
  
  // Overall scores
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  unanswered_questions: number;
  
  // Points
  total_score: number;
  max_possible_score: number;
  percentage: number;
  
  // Subject breakdown
  subject_performances: SubjectPerformance[];
  
  // Analysis
  strengths: string[]; // Subjects with >70%
  weaknesses: string[]; // Subjects with <50%
  
  // Comparison
  average_score?: number; // Average of all attempts for this exam
  rank?: number; // Rank among all users (optional)
  // Teacher exam flag
  uses_teacher_questions?: boolean;
}

// Question review item
export interface QuestionReview {
  question: ExamQuestion;
  user_answer: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  text_answer?: string; // For codable_open and written_open
  image_url?: string; // For written_open image uploads
  correct_answer: 'A' | 'B' | 'C' | 'D' | 'E';
  is_correct: boolean | null; // null = pending grading for open questions
  ai_explanation?: string; // AI-generated explanation and feedback (JSON string)
  time_spent_seconds: number;
  was_marked: boolean;
  is_skipped?: boolean;
}

// Group scoring configuration
export interface GroupScoringConfig {
  group: ExamGroup;
  subjects: {
    name: string;
    coefficient: 1.0 | 1.5;
    questions: number;
  }[];
  max_total_points: number;
}

// Helper function to calculate max points per subject
const calculateSubjectMaxPoints = (coefficient: number, totalPoints: number, totalCoefficient: number): number => {
  return Math.round((coefficient / totalCoefficient) * totalPoints);
};

// ============================================
// STAGE I (First Stage) - SAME FOR ALL GROUPS
// ============================================
// Subjects: Native Language, Foreign Language, Mathematics
// All coefficients: 1.0 (equal weight)
// Max points: 300 (100 + 100 + 100)
export const STAGE_I_CONFIG = {
  subjects: [
    { name: 'Native Language', coefficient: 1.0, questions: 30, maxPoints: 100 },
    { name: 'Foreign Language', coefficient: 1.0, questions: 30, maxPoints: 100 },
    { name: 'Mathematics', coefficient: 1.0, questions: 30, maxPoints: 100 },
  ],
  max_total_points: 300,
};

// ============================================
// STAGE II (Second Stage) - DIFFERENT PER GROUP
// ============================================
// 2 subjects with coefficient 1.5 (150 pts each)
// 1 subject with coefficient 1.0 (100 pts)
// Max points: 400 (150 + 150 + 100)
// Group V has NO Stage II
export const GROUP_SCORING: Record<ExamGroup, GroupScoringConfig> = {
  'I': {
    group: 'I',
    subjects: [
      { name: 'Mathematics', coefficient: 1.5, questions: 30 },
      { name: 'Physics', coefficient: 1.5, questions: 30 },
      { name: 'Chemistry', coefficient: 1.0, questions: 30 },
    ],
    max_total_points: 400,
  },
  'II': {
    group: 'II',
    subjects: [
      { name: 'Mathematics', coefficient: 1.5, questions: 30 },
      { name: 'Geography', coefficient: 1.5, questions: 30 },
      { name: 'History', coefficient: 1.0, questions: 30 },
    ],
    max_total_points: 400,
  },
  'III': {
    group: 'III',
    subjects: [
      { name: 'Native Language', coefficient: 1.5, questions: 30 },
      { name: 'History', coefficient: 1.5, questions: 30 },
      { name: 'Literature', coefficient: 1.0, questions: 30 },
    ],
    max_total_points: 400,
  },
  'IV': {
    group: 'IV',
    subjects: [
      { name: 'Biology', coefficient: 1.5, questions: 30 },
      { name: 'Chemistry', coefficient: 1.5, questions: 30 },
      { name: 'Physics', coefficient: 1.0, questions: 30 },
    ],
    max_total_points: 400,
  },
  'V': {
    group: 'V',
    subjects: [], // Group V has NO Stage II
    max_total_points: 0, // No second stage for Group V
  },
};

// Calculate actual max points for each subject in a group
export const getSubjectMaxPoints = (group: ExamGroup, subjectName: string): number => {
  const config = GROUP_SCORING[group];
  const totalCoefficient = config.subjects.reduce((sum, s) => sum + s.coefficient, 0);
  const subject = config.subjects.find(s => s.name === subjectName);
  
  if (!subject) return 0;
  
  return calculateSubjectMaxPoints(subject.coefficient, config.max_total_points, totalCoefficient);
};

// Timer warnings
export const TIMER_WARNINGS = {
  TEN_MINUTES: 10 * 60,
  FIVE_MINUTES: 5 * 60,
  ONE_MINUTE: 60,
};

// Auto-save interval (30 seconds)
export const AUTO_SAVE_INTERVAL = 30 * 1000;
