/**
 * Competitive Mode Types
 * 
 * Types for AI-powered competitive practice sessions
 */

export interface CompetitiveSession {
  id: string;
  student_id: string;
  subject_id: string;
  subject_name: string;
  question_count: number;
  correct_answers: number;
  incorrect_answers: number;
  score_percentage: number;
  total_time_seconds: number;
  weak_topics: string[];
  created_at: string;
}

export interface CompetitiveQuestion {
  id: string;
  session_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e: string | null; // Option E is optional
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  ai_generated: boolean;
}

export interface CompetitiveAnswer {
  id: string;
  session_id: string;
  question_id: string;
  student_answer: string;
  is_correct: boolean;
  time_spent: number;
}

export interface WeakTopic {
  topic: string;
  accuracy: number;
  questionCount: number;
}

export interface SubjectWithWeakTopics {
  id: string;
  name: string; // Keep for backward compatibility
  name_en: string;
  name_az: string;
  weak_topics: WeakTopic[];
}

export interface GenerateQuestionsRequest {
  studentId: string;
  subjectId: string;
  subjectName: string;
  questionCount: number;
  weakTopics: string[];
}

export interface GenerateQuestionsResponse {
  sessionId: string;
  questions: CompetitiveQuestion[];
}

export interface SubmitAnswersRequest {
  sessionId: string;
  answers: {
    questionId: string;
    studentAnswer: string;
    timeSpent: number;
  }[];
  totalTime: number;
}

export interface SubmitAnswersResponse {
  session: CompetitiveSession;
  topicPerformance: {
    topic: string;
    correct: number;
    total: number;
    percentage: number;
  }[];
}
