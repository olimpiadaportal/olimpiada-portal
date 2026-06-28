/**
 * AI Explanation Service for Webapp
 * Provides AI-powered explanations for wrong answers
 * Matches mobile app implementation
 */

import { createClient } from '@/lib/supabase/client'
import { aiCache, CacheKeys } from '@/lib/utils/aiCache'
import {
  ExplanationRequest,
  AIExplanation,
  ServiceResponse,
} from '@/types/ai'

class AIExplanationService {
  private readonly EDGE_FUNCTION_URL = 'ai-explain'
  private readonly TIMEOUT_MS = 60000 // 60 seconds

  /**
   * Get AI explanation for a wrong answer
   */
  async getExplanation(
    request: ExplanationRequest
  ): Promise<ServiceResponse<AIExplanation>> {
    try {
      // Check cache first
      const cacheKey = CacheKeys.explanation(
        request.questionId,
        request.studentAnswer
      )
      const cached = await aiCache.get<AIExplanation>(cacheKey)

      if (cached) {
        return {
          success: true,
          data: cached,
          cached: true,
        }
      }

      // Fetch from Edge Function
      const supabase = createClient()
      
      const { data, error } = await Promise.race([
        supabase.functions.invoke<AIExplanation>(this.EDGE_FUNCTION_URL, {
          body: request,
        }),
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

      if (!data || !data.explanation) {
        throw new Error('Invalid response from AI')
      }

      // Parse and clean the response
      const cleanedData = this.parseAndCleanResponse(data)

      // Cache the explanation (no TTL - explanations don't change)
      await aiCache.set(cacheKey, cleanedData)

      return {
        success: true,
        data: cleanedData,
        cached: false,
      }
    } catch (error) {
      console.error('❌ Failed to get explanation:', error)

      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Request timed out. Please try again.',
          },
        }
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to get explanation. Please try again.',
        },
      }
    }
  }

  /**
   * Get cached explanation if available
   */
  async getCachedExplanation(
    questionId: string,
    studentAnswer: string
  ): Promise<AIExplanation | null> {
    const cacheKey = CacheKeys.explanation(questionId, studentAnswer)
    return await aiCache.get<AIExplanation>(cacheKey)
  }

  /**
   * Check if explanation is cached
   */
  async hasExplanation(
    questionId: string,
    studentAnswer: string
  ): Promise<boolean> {
    const cacheKey = CacheKeys.explanation(questionId, studentAnswer)
    return await aiCache.has(cacheKey)
  }

  /**
   * Parse and clean AI response
   */
  private parseAndCleanResponse(data: any): AIExplanation {
    let explanation = data.explanation
    let keyPoints = data.keyPoints || []
    let studyTip = data.studyTip || ''

    // Check if explanation is a JSON string
    if (typeof explanation === 'string' && explanation.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(explanation)
        explanation = parsed.explanation || explanation
        keyPoints = parsed.keyPoints || keyPoints
        studyTip = parsed.studyTip || studyTip
      } catch (e) {
        console.warn('Failed to parse wrapped JSON, using raw text')
      }
    }

    // Clean text
    explanation = this.cleanText(explanation)
    keyPoints = keyPoints.map((point: string) => this.cleanText(point))
    studyTip = this.cleanText(studyTip)

    return {
      explanation,
      keyPoints,
      studyTip,
      relatedTopics: data.relatedTopics || [],
    }
  }

  /**
   * Clean text from JSON artifacts
   */
  private cleanText(text: string): string {
    if (!text || typeof text !== 'string') return text

    return text
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim()
  }

  /**
   * Prefetch explanation (for better UX)
   */
  async prefetchExplanation(request: ExplanationRequest): Promise<void> {
    try {
      const hasCache = await this.hasExplanation(
        request.questionId,
        request.studentAnswer
      )

      if (hasCache) {
        return
      }

      this.getExplanation(request).catch(error => {
        console.warn('Prefetch failed:', error)
      })
    } catch (error) {
      console.warn('Prefetch error:', error)
    }
  }
}

export const aiExplanationService = new AIExplanationService()
