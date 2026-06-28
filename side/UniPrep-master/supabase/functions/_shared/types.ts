// ============================================
// SHARED TYPES FOR EDGE FUNCTIONS
// ============================================

// DeepSeek API Types
export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekRequest {
  model: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: DeepSeekMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// AI Insights Types
export interface AIInsight {
  type: 'recommendation' | 'weak_area' | 'strength' | 'study_tip' | 'prediction';
  subject_id?: string;
  title: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
}

export interface InsightsRequest {
  studentId: string;
  forceRefresh?: boolean;
}

export interface InsightsResponse {
  insights: AIInsight[];
  cached: boolean;
  generatedAt: string;
  expiresAt: string;
}

// AI Explanation Types
export interface ExplanationRequest {
  questionId: string;
  studentAnswer: string;
  correctAnswer: string;
  questionText: string;
  subjectName: string;
  optionTexts?: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
}

export interface ExplanationResponse {
  explanation: string;
  keyPoints: string[];
  studyTip: string;
  relatedTopics?: string[];
}

// AI Question Generation Types
export interface GenerateQuestionsRequest {
  studentId: string;
  subjectId: string;
  weakTopics?: string[];
  questionCount?: number;
}

export interface GeneratedQuestion {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
}

export interface GenerateQuestionsResponse {
  questions: GeneratedQuestion[];
  sessionId: string;
  weakTopics: string[];
}

// Student Performance Types
export interface SubjectPerformance {
  subject_id: string;
  subject_name: string;
  total_attempted: number;
  total_correct: number;
  accuracy: number;
  weak_topics: string[];
  recent_scores: number[];
}

export interface StudentPerformanceData {
  student_id: string;
  subjects: SubjectPerformance[];
  overall_accuracy: number;
  total_practice_time: number;
  recent_activity: Array<{
    date: string;
    subject: string;
    score: number;
  }>;
}

// Usage Logging Types
export interface UsageLog {
  student_id?: string;
  request_type: 'insight_generation' | 'explanation' | 'question_generation';
  model_used: string;
  tokens_used: number;
  cost_usd: number;
  processing_time_ms: number;
  success: boolean;
  error_message?: string;
}

// Error Types
export interface APIError {
  error: string;
  message: string;
  details?: any;
  statusCode: number;
}

// CORS Headers (MEDIUM-08 security audit fix: restrict to allowed origins)
const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'https://uni-prep-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
