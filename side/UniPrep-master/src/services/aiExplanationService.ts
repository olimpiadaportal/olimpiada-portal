/**
 * AI Explanation Service
 * 
 * Provides AI-powered explanations for wrong answers.
 * Features:
 * - Real-time explanations using DeepSeek Reasoner
 * - Per-question caching (no TTL - explanations don't change)
 * - Loading states
 * - Error handling with user-friendly messages
 */

import { supabase } from './supabase';
import { aiCache, CacheKeys } from '../utils/aiCache';
import { aiConfigService } from './aiConfigService';
import {
  ExplanationRequest,
  AIExplanation,
  ExplanationResponse,
  AIServiceError,
  ServiceResponse,
} from '../types/ai';

class AIExplanationService {
  private readonly EDGE_FUNCTION_URL = 'ai-explain';
  private readonly TIMEOUT_MS = 60000; // 60 seconds (AI reasoning takes time)

  /**
   * Get AI explanation for a wrong answer
   * Checks cache first, then calls API
   */
  async getExplanation(
    request: ExplanationRequest
  ): Promise<ServiceResponse<AIExplanation>> {
    try {
      // Check AI configuration FIRST
      const configCheck = await aiConfigService.checkAIFeatureAccess('answer_explanation');
      if (!configCheck.allowed) {
        return {
          success: false,
          error: {
            code: 'MAINTENANCE_MODE',
            message: configCheck.message || 'AI Explain is currently unavailable.',
          },
        };
      }

      // Check cache first
      const cacheKey = CacheKeys.explanation(
        request.questionId,
        request.studentAnswer
      );
      const cached = await aiCache.get<AIExplanation>(cacheKey);

      if (cached) {
        console.log('✅ Returning cached explanation');
        return {
          success: true,
          data: cached,
          cached: true,
        };
      }

      // Fetch from Edge Function with timeout
      console.log('🔄 Fetching explanation from AI...');
      const { data, error } = await this.fetchWithTimeout<AIExplanation>(
        request,
        this.TIMEOUT_MS
      );

      if (error) {
        throw new AIServiceError(
          'API_ERROR',
          'Failed to get explanation from AI',
          error
        );
      }

      if (!data || !data.explanation) {
        throw new AIServiceError(
          'API_ERROR',
          'Invalid response from AI',
          data
        );
      }

      // Parse and clean the response (sometimes AI returns wrapped JSON)
      const cleanedData = this.parseAndCleanResponse(data);

      // Cache the explanation (no TTL - explanations don't change)
      await aiCache.set(cacheKey, cleanedData);

      console.log('✅ Received AI explanation');
      return {
        success: true,
        data: cleanedData,
        cached: false,
      };
    } catch (error) {
      console.error('❌ Failed to get explanation:', error);

      // Check if it's a timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Request timed out. Please try again.',
          },
        };
      }

      // Check if it's a network error
      if (error instanceof Error && error.message.includes('network')) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Network error. Please check your connection.',
          },
        };
      }

      // Generic error
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to get explanation. Please try again.',
        },
      };
    }
  }

  /**
   * Get cached explanation if available
   */
  async getCachedExplanation(
    questionId: string,
    studentAnswer: string
  ): Promise<AIExplanation | null> {
    const cacheKey = CacheKeys.explanation(questionId, studentAnswer);
    return await aiCache.get<AIExplanation>(cacheKey);
  }

  /**
   * Check if explanation is cached
   */
  async hasExplanation(
    questionId: string,
    studentAnswer: string
  ): Promise<boolean> {
    const cacheKey = CacheKeys.explanation(questionId, studentAnswer);
    return await aiCache.has(cacheKey);
  }

  /**
   * Clear explanation cache for a specific question
   */
  async clearExplanation(
    questionId: string,
    studentAnswer: string
  ): Promise<void> {
    const cacheKey = CacheKeys.explanation(questionId, studentAnswer);
    await aiCache.remove(cacheKey);
  }

  /**
   * Clear all explanation cache
   */
  async clearAllExplanations(): Promise<void> {
    // This would require a more sophisticated cache key pattern
    // For now, we'll just clear the entire AI cache
    await aiCache.clearAll();
  }

  /**
   * Parse and clean AI response
   * Sometimes AI returns wrapped JSON or extra formatting
   */
  private parseAndCleanResponse(data: any): AIExplanation {
    let explanation = data.explanation;
    let keyPoints = data.keyPoints || [];
    let studyTip = data.studyTip || '';

    // Check if explanation is a JSON string (sometimes AI wraps it)
    if (typeof explanation === 'string' && explanation.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(explanation);
        explanation = parsed.explanation || explanation;
        keyPoints = parsed.keyPoints || keyPoints;
        studyTip = parsed.studyTip || studyTip;
      } catch (e) {
        // If parsing fails, use as-is
        console.warn('Failed to parse wrapped JSON, using raw text');
      }
    }

    // Remove any JSON formatting artifacts
    explanation = this.cleanText(explanation);
    keyPoints = keyPoints.map((point: string) => this.cleanText(point));
    studyTip = this.cleanText(studyTip);

    return {
      explanation,
      keyPoints,
      studyTip,
      relatedTopics: data.relatedTopics || [],
    };
  }

  /**
   * Clean text from JSON artifacts
   */
  private cleanText(text: string): string {
    if (!text || typeof text !== 'string') return text;

    return text
      .replace(/^["']|["']$/g, '') // Remove quotes at start/end
      .replace(/\\n/g, '\n') // Convert escaped newlines
      .replace(/\\"/g, '"') // Convert escaped quotes
      .replace(/^\s*{\s*"explanation":\s*"?/i, '') // Remove JSON prefix
      .replace(/"?\s*}?\s*$/i, '') // Remove JSON suffix
      .replace(/",\s*"keyPoints":\s*\[[\s\S]*$/i, '') // Remove keyPoints JSON that appears in explanation
      .replace(/",\s*"studyTip":\s*"[\s\S]*$/i, '') // Remove studyTip JSON that appears in explanation
      .trim();
  }

  /**
   * Fetch with timeout to prevent hanging requests
   */
  private async fetchWithTimeout<T>(
    request: ExplanationRequest,
    timeoutMs: number
  ): Promise<{ data: T | null; error: any }> {
    return Promise.race([
      supabase.functions.invoke<T>(this.EDGE_FUNCTION_URL, {
        body: request,
      }),
      new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout')),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Get explanation for multiple questions (batch)
   * Useful for review screens
   */
  async getExplanationsBatch(
    requests: ExplanationRequest[]
  ): Promise<ServiceResponse<Map<string, AIExplanation>>> {
    try {
      const results = new Map<string, AIExplanation>();
      const errors: string[] = [];

      // Process requests in parallel (max 3 at a time to avoid rate limits)
      const batchSize = 3;
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const promises = batch.map(req => this.getExplanation(req));
        const responses = await Promise.allSettled(promises);

        responses.forEach((response, index) => {
          const request = batch[index];
          if (response.status === 'fulfilled' && response.value.success && response.value.data) {
            results.set(request.questionId, response.value.data);
          } else {
            errors.push(request.questionId);
          }
        });
      }

      if (errors.length > 0) {
        console.warn(`⚠️ Failed to get explanations for ${errors.length} questions`);
      }

      return {
        success: errors.length === 0,
        data: results,
        error: errors.length > 0 ? {
          code: 'API_ERROR',
          message: `Failed to get ${errors.length} explanations`,
          details: errors,
        } : undefined,
      };
    } catch (error) {
      console.error('❌ Batch explanation error:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to get explanations',
        },
      };
    }
  }

  /**
   * Prefetch explanation (for better UX)
   * Fetches in background without blocking UI
   */
  async prefetchExplanation(request: ExplanationRequest): Promise<void> {
    try {
      // Check if already cached
      const hasCache = await this.hasExplanation(
        request.questionId,
        request.studentAnswer
      );

      if (hasCache) {
        return; // Already cached, no need to prefetch
      }

      // Fetch in background (don't await)
      this.getExplanation(request).catch(error => {
        console.warn('Prefetch failed:', error);
      });
    } catch (error) {
      console.warn('Prefetch error:', error);
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error: any): string {
    if (error?.code === 'TIMEOUT_ERROR') {
      return 'The request took too long. Please try again.';
    }

    if (error?.code === 'NETWORK_ERROR') {
      return 'Please check your internet connection and try again.';
    }

    if (error?.code === 'RATE_LIMIT_ERROR') {
      return 'Too many requests. Please wait a moment and try again.';
    }

    return 'Unable to get explanation. Please try again later.';
  }
}

// Export singleton instance
export const aiExplanationService = new AIExplanationService();
