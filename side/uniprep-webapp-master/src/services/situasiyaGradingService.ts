/**
 * Situasiya (Written Open) Grading Service for Webapp
 * AI-powered grading for written_open questions
 * Matches mobile app implementation
 */

import { createClient } from '@/lib/supabase/client'
import { aiCache, CacheKeys } from '@/lib/utils/aiCache'
import {
  SituasiyaGradingRequest,
  SituasiyaGradingResponse,
  ServiceResponse,
} from '@/types/ai'

class SituasiyaGradingService {
  private readonly EDGE_FUNCTION_URL = 'grade-open-questions'
  private readonly TIMEOUT_MS = 60000 // 60 seconds

  /**
   * Grade a written open question using AI
   */
  async gradeAnswer(
    request: SituasiyaGradingRequest
  ): Promise<ServiceResponse<SituasiyaGradingResponse>> {
    try {
      // Check cache first
      const cacheKey = CacheKeys.situasiyaGrading(
        request.questionId,
        request.studentAnswer
      )
      const cached = await aiCache.get<SituasiyaGradingResponse>(cacheKey)

      if (cached) {
        console.log('✅ Returning cached grading')
        return {
          success: true,
          data: cached,
          cached: true,
        }
      }

      // Grade via Edge Function
      console.log('🔄 Grading answer with AI...')
      const supabase = createClient()
      
      const { data, error } = await Promise.race([
        supabase.functions.invoke<SituasiyaGradingResponse>(
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

      if (!data || typeof data.score !== 'number') {
        throw new Error('Invalid response from AI')
      }

      // Cache the grading result
      await aiCache.set(cacheKey, data)

      console.log('✅ Answer graded:', data.score, '/', data.maxScore)
      return {
        success: true,
        data,
        cached: false,
      }
    } catch (error) {
      console.error('❌ Failed to grade answer:', error)

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Grading timed out. Please try again.',
          },
        }
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to grade answer. Please try again.',
        },
      }
    }
  }

  /**
   * Grade multiple answers in batch
   */
  async gradeAnswersBatch(
    requests: SituasiyaGradingRequest[]
  ): Promise<ServiceResponse<Map<string, SituasiyaGradingResponse>>> {
    try {
      const results = new Map<string, SituasiyaGradingResponse>()
      const errors: string[] = []

      // Process in batches of 3 to avoid rate limits
      const batchSize = 3
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize)
        const promises = batch.map(req => this.gradeAnswer(req))
        const responses = await Promise.allSettled(promises)

        responses.forEach((response, index) => {
          const request = batch[index]
          if (response.status === 'fulfilled' && response.value.success && response.value.data) {
            results.set(request.questionId, response.value.data)
          } else {
            errors.push(request.questionId)
          }
        })
      }

      return {
        success: errors.length === 0,
        data: results,
        error: errors.length > 0 ? {
          code: 'API_ERROR',
          message: `Failed to grade ${errors.length} answers`,
          details: errors,
        } : undefined,
      }
    } catch (error) {
      console.error('❌ Batch grading error:', error)
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to grade answers',
        },
      }
    }
  }
}

export const situasiyaGradingService = new SituasiyaGradingService()
