/**
 * Competitive Mode Service for Webapp
 * Manages AI-powered competitive question sessions
 * Matches mobile app implementation
 */

import { createClient } from '@/lib/supabase/client'
import { aiCache, CacheKeys } from '@/lib/utils/aiCache'
import {
  CompetitiveModeRequest,
  CompetitiveModeResponse,
  GeneratedQuestion,
  ServiceResponse,
} from '@/types/ai'

class CompetitiveModeService {
  private readonly EDGE_FUNCTION_URL = 'ai-generate-questions'
  private readonly DEFAULT_QUESTION_COUNT = 15
  private readonly TIMEOUT_MS = 120000 // 120 seconds

  /**
   * Generate a new competitive session with AI questions
   */
  async generateSession(
    userId: string,
    subjectId: string,
    questionCount: number = this.DEFAULT_QUESTION_COUNT,
    focusTopics?: string[]
  ): Promise<ServiceResponse<CompetitiveModeResponse>> {
    try {
      // Check cache first (3-day TTL like mobile app)
      const cacheKey = CacheKeys.competitiveSession(userId, subjectId)
      const cached = await aiCache.get<CompetitiveModeResponse>(cacheKey)

      if (cached) {
        console.log('✅ Returning cached competitive session')
        return {
          success: true,
          data: cached,
          cached: true,
        }
      }

      // Get weak topics if not provided
      let topicsToUse = focusTopics || []
      if (topicsToUse.length === 0) {
        topicsToUse = await this.getWeakTopics(userId, subjectId)
      }

      // Prepare request
      const request: CompetitiveModeRequest = {
        userId,
        subjectId,
        questionCount,
        focusTopics: topicsToUse.length > 0 ? topicsToUse : undefined,
      }

      // Generate questions via Edge Function
      console.log(`🤖 Generating ${questionCount} AI questions...`)
      const supabase = createClient()
      
      const { data, error } = await Promise.race([
        supabase.functions.invoke<CompetitiveModeResponse>(
          this.EDGE_FUNCTION_URL,
          { body: request }
        ),
        new Promise<{ data: null; error: Error }>((_, reject) =>
          setTimeout(
            () => reject(new Error('Request timeout')),
            this.TIMEOUT_MS
          )
        ),
      ])

      if (error) {
        throw error
      }

      if (!data || !data.questions || !data.sessionId) {
        throw new Error('Invalid response from AI')
      }

      // Cache the session (3-day TTL)
      const CACHE_TTL = 3 * 24 * 60 * 60 * 1000
      await aiCache.set(cacheKey, data, { ttl: CACHE_TTL })

      console.log(`✅ Generated ${data.questions.length} questions`)
      return {
        success: true,
        data,
        cached: false,
      }
    } catch (error) {
      console.error('❌ Failed to generate session:', error)

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Question generation timed out. Please try again.',
          },
        }
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to generate questions. Please try again.',
        },
      }
    }
  }

  /**
   * Get weak topics for a student in a subject
   */
  private async getWeakTopics(
    userId: string,
    subjectId: string
  ): Promise<string[]> {
    try {
      const supabase = createClient()
      
      // Get recent answers for this subject
      const { data: answers } = await supabase
        .from('student_answers')
        .select('question_id, is_correct, questions(topic)')
        .eq('user_id', userId)
        .eq('questions.subject_id', subjectId)
        .order('answered_at', { ascending: false })
        .limit(100)

      if (!answers || answers.length === 0) {
        return []
      }

      // Calculate accuracy per topic
      const topicStats = new Map<string, { correct: number; total: number }>()
      answers.forEach((a: any) => {
        const topic = a.questions?.topic
        if (topic) {
          const stats = topicStats.get(topic) || { correct: 0, total: 0 }
          stats.total++
          if (a.is_correct) stats.correct++
          topicStats.set(topic, stats)
        }
      })

      // Find weak topics (< 60% accuracy, min 5 questions)
      const weakTopics = Array.from(topicStats.entries())
        .filter(([_, stats]) => stats.total >= 5 && (stats.correct / stats.total) < 0.6)
        .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
        .slice(0, 3)
        .map(([topic]) => topic)

      return weakTopics
    } catch (error) {
      console.error('Get weak topics error:', error)
      return []
    }
  }

  /**
   * Submit competitive session results
   */
  async submitSession(
    sessionId: string,
    userId: string,
    subjectId: string,
    answers: Map<string, string>,
    questions: GeneratedQuestion[]
  ): Promise<ServiceResponse<{ score: number; accuracy: number }>> {
    try {
      const supabase = createClient()

      // Calculate score
      let correctCount = 0
      const answerRecords: any[] = []

      questions.forEach((q) => {
        const userAnswer = answers.get(q.id)
        if (userAnswer) {
          const isCorrect = userAnswer === q.correctAnswer
          if (isCorrect) correctCount++

          answerRecords.push({
            user_id: userId,
            question_id: q.id,
            selected_answer: userAnswer,
            is_correct: isCorrect,
            answered_at: new Date().toISOString(),
          })
        }
      })

      const accuracy = Math.round((correctCount / questions.length) * 100)

      // Save session to database
      await supabase.from('competitive_sessions').insert({
        id: sessionId,
        user_id: userId,
        subject_id: subjectId,
        total_questions: questions.length,
        correct_answers: correctCount,
        accuracy,
        completed_at: new Date().toISOString(),
      })

      // Save answers
      if (answerRecords.length > 0) {
        await supabase.from('student_answers').insert(answerRecords)
      }

      return {
        success: true,
        data: {
          score: correctCount,
          accuracy,
        },
      }
    } catch (error) {
      console.error('Submit session error:', error)
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to submit session',
        },
      }
    }
  }
}

export const competitiveModeService = new CompetitiveModeService()
