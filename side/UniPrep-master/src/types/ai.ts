/**
 * AI-Related Type Definitions
 * 
 * This file contains all TypeScript types for AI features including:
 * - AI Insights & Recommendations
 * - AI Explanations
 * - Competitive Mode Sessions
 */

// ============================================
// AI INSIGHTS
// ============================================

export type InsightType = 'recommendation' | 'weak_area' | 'strength' | 'study_tip';
export type InsightPriority = 'high' | 'medium' | 'low';

export interface AIInsight {
  id: string;
  studentId: string;
  type: InsightType;
  subjectId?: string;
  title: string;
  content: string;
  priority: InsightPriority;
  isRead: boolean;
  generatedAt: string;
  expiresAt: string;
  metadata?: Record<string, any>;
}

export interface InsightsResponse {
  insights: AIInsight[];
  cached: boolean;
  generatedAt: string;
  expiresAt: string;
}

export interface FallbackInsight {
  type: InsightType;
  title: string;
  content: string;
  priority: InsightPriority;
}

// ============================================
// AI EXPLANATIONS
// ============================================

export interface ExplanationRequest {
  questionId: string;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  subjectName: string;
  optionTexts?: {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
  };
}

export interface AIExplanation {
  explanation: string;
  keyPoints: string[];
  studyTip: string;
  relatedTopics?: string[];
}

export interface ExplanationResponse extends AIExplanation {
  questionId: string;
  cached: boolean;
  generatedAt: string;
}

// ============================================
// COMPETITIVE MODE
// ============================================

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface CompetitiveQuestion {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
  difficulty: QuestionDifficulty;
  topic: string;
}

export interface CompetitiveSession {
  id: string;
  studentId: string;
  subjectId: string;
  questions: CompetitiveQuestion[];
  totalQuestions: number;
  weakTopics: string[];
  createdAt: string;
  completedAt?: string;
  correctAnswers?: number;
  totalTimeSeconds?: number;
}

export interface SessionAnswer {
  questionIndex: number;
  selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  timeSpentSeconds: number;
}

export interface SessionResult {
  sessionId: string;
  correctAnswers: number;
  totalQuestions: number;
  accuracy: number;
  totalTimeSeconds: number;
  weakTopics: string[];
}

export interface GenerateSessionRequest {
  subjectId: string;
  studentId?: string; // Optional - Edge Function gets this from auth
  questionCount?: number;
  weakTopics?: string[];
}

export interface GenerateSessionResponse {
  questions: CompetitiveQuestion[];
  sessionId: string;
  weakTopics: string[];
}

// ============================================
// ERROR TYPES
// ============================================

export interface AIError {
  code: string;
  message: string;
  details?: any;
}

export type AIErrorCode =
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'TIMEOUT_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'UNKNOWN_ERROR';

export class AIServiceError extends Error {
  code: AIErrorCode;
  details?: any;

  constructor(code: AIErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.details = details;
  }
}

// ============================================
// CACHE TYPES
// ============================================

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  forceRefresh?: boolean;
}

// ============================================
// SERVICE RESPONSE TYPES
// ============================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: AIError;
  cached?: boolean;
}

// ============================================
// ANALYTICS TYPES
// ============================================

export interface AIUsageLog {
  id: string;
  studentId: string;
  requestType: 'insight_generation' | 'explanation' | 'question_generation';
  tokensUsed?: number;
  costUsd?: number;
  processingTimeMs?: number;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

// ============================================
// WEAK TOPIC DETECTION
// ============================================

export interface WeakTopicAnalysis {
  topic: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  isWeak: boolean; // accuracy < 60%
}

export interface SubjectWeakTopics {
  subjectId: string;
  subjectName: string;
  weakTopics: WeakTopicAnalysis[];
  overallAccuracy: number;
}
