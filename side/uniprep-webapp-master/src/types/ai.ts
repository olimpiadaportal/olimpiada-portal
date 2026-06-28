/**
 * AI Service Types
 * Type definitions for AI features matching mobile app
 */

// ============================================================================
// Common Types
// ============================================================================

export interface ServiceResponse<T> {
  success: boolean
  data?: T
  error?: AIServiceError
  cached?: boolean
}

export interface AIServiceError {
  code: string
  message: string
  details?: any
}

// ============================================================================
// AI Explanation Types
// ============================================================================

export interface ExplanationRequest {
  questionId: string
  questionText: string
  correctAnswer: string
  studentAnswer: string
  subject?: string
  topic?: string
  difficulty?: string
}

export interface AIExplanation {
  explanation: string
  keyPoints: string[]
  studyTip: string
  relatedTopics?: string[]
}

export interface ExplanationResponse {
  explanation: AIExplanation
  cached: boolean
}

// ============================================================================
// AI Insights Types
// ============================================================================

export interface InsightsRequest {
  userId: string
  timeframe?: 'week' | 'month' | 'all'
}

export interface AIInsight {
  id: string
  type: 'strength' | 'weakness' | 'recommendation' | 'achievement'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  actionable: boolean
  actionText?: string
  relatedSubjects?: string[]
  relatedTopics?: string[]
  viewed?: boolean
  metadata?: {
    accuracy?: number
    questionsAttempted?: number
    improvementRate?: number
    [key: string]: any
  }
}

export interface InsightsResponse {
  insights: AIInsight[]
  summary: {
    totalInsights: number
    strengths: number
    weaknesses: number
    recommendations: number
  }
  generatedAt: string
  cached?: boolean
}

// Database types for fallback queries
export interface StudentAnswerRow {
  question_id: string
  is_correct: boolean
  questions: {
    subject_id: string
    topic: string
    subtopic_id?: string | null          // Stage 7
    subject_subtopics?: {
      subtopic_name: string
    } | null                             // Stage 7
  } | null
}

// ============================================================================
// Competitive Mode Types
// ============================================================================

export interface CompetitiveModeRequest {
  userId: string
  subjectId: string
  difficulty?: 'easy' | 'medium' | 'hard'
  questionCount: number
  focusTopics?: string[]
}

export interface GeneratedQuestion {
  id: string
  questionText: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  optionE: string
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E'
  explanation: string
  difficulty: string
  topic: string
  aiGenerated: boolean
}

export interface CompetitiveModeResponse {
  questions: GeneratedQuestion[]
  sessionId: string
  weakTopics: string[]
  focusAreas: string[]
}

// ============================================================================
// AI Situasiya (Written Open) Types
// ============================================================================

export interface SituasiyaGradingRequest {
  questionId: string
  questionText: string
  correctAnswer: string
  studentAnswer: string
  maxScore?: number
}

export interface SituasiyaGradingResponse {
  score: number
  maxScore: number
  percentage: number
  feedback: string
  strengths: string[]
  improvements: string[]
  isCorrect: boolean
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl?: number
}

export interface CacheConfig {
  ttl?: number // Time to live in milliseconds
  prefix?: string
}
