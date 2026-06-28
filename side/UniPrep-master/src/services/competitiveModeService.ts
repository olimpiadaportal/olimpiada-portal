/**
 * Competitive Mode Service
 * 
 * Manages AI-powered competitive question sessions.
 * Features:
 * - Generate adaptive questions (40-50% weak topics, 50-60% general for variety)
 * - Submit and track session results
 * - Weak topic detection
 * - Session history
 */

import { supabase } from './supabase';
import { aiCache, CacheKeys } from '../utils/aiCache';
import { adaptiveLearningService } from './adaptiveLearningService';
import { aiConfigService } from './aiConfigService';
import {
  CompetitiveSession,
  CompetitiveQuestion,
  SessionAnswer,
  SessionResult,
  GenerateSessionRequest,
  GenerateSessionResponse,
  WeakTopicAnalysis,
  SubjectWeakTopics,
  AIServiceError,
  ServiceResponse,
} from '../types/ai';

class CompetitiveModeService {
  private readonly EDGE_FUNCTION_URL = 'ai-generate-questions';
  private readonly DEFAULT_QUESTION_COUNT = 15; // Standard question count for competitive mode
  private readonly TIMEOUT_MS = 120000; // 120 seconds (2 minutes - allows for batched generation)

  /**
   * Generate a new competitive session with AI questions
   * Uses adaptive learning to personalize difficulty and topics
   * @param subjectId - Subject ID
   * @param studentId - Student ID
   * @param questionCount - Number of questions to generate
   * @param options - Optional: selectedTopics and difficultyPreference
   */
  async generateSession(
    subjectId: string,
    studentId: string,
    questionCount: number = this.DEFAULT_QUESTION_COUNT,
    options?: {
      selectedTopics?: string[];
      difficultyPreference?: 'adaptive' | 'balanced' | 'easy' | 'medium' | 'hard';
    }
  ): Promise<ServiceResponse<CompetitiveSession>> {
    try {
      // Check AI configuration FIRST
      const configCheck = await aiConfigService.checkAIFeatureAccess('question_generation');
      if (!configCheck.allowed) {
        return {
          success: false,
          error: {
            code: 'MAINTENANCE_MODE',
            message: configCheck.message || 'AI Generate Questions is currently unavailable.',
          },
        };
      }

      // Check if this is the first session (diagnostic vs personalized)
      console.log('🔍 Checking session type...');
      const isFirstSession = await adaptiveLearningService.isFirstSession(studentId, subjectId);

      // Determine topics to use
      let topicsToUse: string[] = [];
      if (options?.selectedTopics && options.selectedTopics.length > 0) {
        // User selected specific topics
        topicsToUse = options.selectedTopics;
        console.log('📝 Using user-selected topics:', topicsToUse);
      } else if (!isFirstSession) {
        // Fall back to weak topics for personalized sessions
        console.log('🔍 Analyzing weak topics...');
        topicsToUse = await this.getWeakTopics(studentId, subjectId);
      }

      // Determine difficulty mix based on preference
      console.log('🎯 Calculating difficulty mix...');
      let difficultyMix: { easy: number; medium: number; hard: number; description: string };
      
      const diffPref = options?.difficultyPreference || 'adaptive';
      
      switch (diffPref) {
        case 'easy':
          difficultyMix = { easy: 70, medium: 25, hard: 5, description: 'Easy Focus' };
          break;
        case 'medium':
          difficultyMix = { easy: 20, medium: 60, hard: 20, description: 'Medium Focus' };
          break;
        case 'hard':
          difficultyMix = { easy: 10, medium: 30, hard: 60, description: 'Hard Focus' };
          break;
        case 'balanced':
          difficultyMix = { easy: 30, medium: 50, hard: 20, description: 'Balanced' };
          break;
        case 'adaptive':
        default:
          difficultyMix = isFirstSession 
            ? { easy: 30, medium: 50, hard: 20, description: 'Balanced (Diagnostic)' }
            : await adaptiveLearningService.getAdaptiveDifficultyMix(studentId, subjectId);
          break;
      }
      
      console.log('📊 Difficulty mix:', difficultyMix);

      // Prepare request (Edge Function gets studentId from auth, not from body)
      const request = {
        subjectId,
        questionCount,
        selectedTopics: topicsToUse.length > 0 ? topicsToUse : undefined,
        weakTopics: topicsToUse.length > 0 ? topicsToUse : undefined, // Keep for backward compatibility
        isFirstSession: isFirstSession && topicsToUse.length === 0, // Only true if no topics selected
        difficultyMix: `${difficultyMix.easy}% easy, ${difficultyMix.medium}% medium, ${difficultyMix.hard}% hard`,
        difficultyPreference: diffPref,
      };

      // Generate questions via Edge Function
      console.log(`🤖 Generating ${questionCount} AI questions...`);
      const { data, error } = await this.fetchWithTimeout<GenerateSessionResponse>(
        request,
        this.TIMEOUT_MS
      );

      if (error) {
        console.error('❌ Edge function returned error:', {
          error,
          errorMessage: error?.message,
          errorDetails: JSON.stringify(error, null, 2),
        });
        throw new AIServiceError(
          'API_ERROR',
          'Failed to generate questions',
          error
        );
      }

      // Debug logging
      console.log('📦 Raw API Response:', JSON.stringify(data, null, 2));
      console.log('📊 Response structure:', {
        hasData: !!data,
        hasQuestions: !!data?.questions,
        questionsLength: data?.questions?.length,
        hasSessionId: !!data?.sessionId,
        sessionId: data?.sessionId,
      });

      if (!data || !data.questions || !data.sessionId) {
        console.error('❌ Invalid response structure:', {
          data,
          hasQuestions: !!data?.questions,
          questionsType: typeof data?.questions,
          questionsIsArray: Array.isArray(data?.questions),
        });
        throw new AIServiceError(
          'API_ERROR',
          'Invalid response from AI',
          data
        );
      }

      // Log first question for debugging
      if (data.questions.length > 0) {
        console.log('📝 Sample question (raw):', JSON.stringify(data.questions[0], null, 2));
      }

      // Transform questions to match database/screen format (snake_case)
      // Support both camelCase and snake_case from AI
      const transformedQuestions: any[] = data.questions.map((q: any, index: number) => {
        const transformed = {
          id: `${data.sessionId}_q${index + 1}`,
          session_id: data.sessionId,
          question_text: q.questionText || q.question_text || '',
          option_a: q.optionA || q.option_a || '',
          option_b: q.optionB || q.option_b || '',
          option_c: q.optionC || q.option_c || '',
          option_d: q.optionD || q.option_d || '',
          option_e: q.optionE || q.option_e || null,
          correct_answer: q.correctAnswer || q.correct_answer || 'A',
          explanation: q.explanation || '',
          difficulty: (q.difficulty || 'medium').toLowerCase() as 'easy' | 'medium' | 'hard',
          topic: q.topic || 'General',
          ai_generated: true,
        };

        // Validate required fields
        if (!transformed.question_text || !transformed.option_a || !transformed.option_b) {
          console.warn('⚠️ Question missing required fields:', q);
        }

        return transformed;
      });

      console.log('📝 Sample question (transformed):', JSON.stringify(transformedQuestions[0], null, 2));

      // Create session object
      const session: any = {
        id: data.sessionId,
        studentId,
        subjectId,
        questions: transformedQuestions,
        totalQuestions: transformedQuestions.length,
        weakTopics: data.weakTopics || topicsToUse,
        createdAt: new Date().toISOString(),
      };

      console.log('✅ Session created:', {
        id: session.id,
        questionCount: session.questions.length,
        hasQuestions: session.questions.length > 0,
      });

      // Cache the session
      await aiCache.set(CacheKeys.session(session.id), session);

      console.log(`✅ Generated ${data.questions.length} questions`);
      return {
        success: true,
        data: session,
      };
    } catch (error) {
      console.error('❌ Failed to generate session:', error);

      // Check for timeout
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: {
            code: 'TIMEOUT_ERROR',
            message: 'Question generation timed out. Please try again.',
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to generate questions. Please try again.',
        },
      };
    }
  }

  /**
   * Submit completed session and calculate results
   */
  async submitSession(
    sessionId: string,
    answers: SessionAnswer[]
  ): Promise<ServiceResponse<SessionResult>> {
    try {
      // Get session from cache or database
      const session = await this.getSession(sessionId);

      if (!session) {
        throw new AIServiceError(
          'API_ERROR',
          'Session not found',
          { sessionId }
        );
      }

      // Calculate results
      let correctAnswers = 0;
      let totalTimeSeconds = 0;

      answers.forEach(answer => {
        const question = session.questions[answer.questionIndex];
        if (question && answer.selectedAnswer === question.correctAnswer) {
          correctAnswers++;
        }
        totalTimeSeconds += answer.timeSpentSeconds;
      });

      const accuracy = (correctAnswers / session.totalQuestions) * 100;

      // Update session in database
      const { error: updateError } = await supabase
        .from('competitive_sessions')
        .update({
          answers_data: answers,
          correct_answers: correctAnswers,
          total_time_seconds: totalTimeSeconds,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Failed to update session:', updateError);
        // Don't throw - we still want to return results
      }

      // Create result object
      const result: SessionResult = {
        sessionId,
        correctAnswers,
        totalQuestions: session.totalQuestions,
        accuracy,
        totalTimeSeconds,
        weakTopics: session.weakTopics,
      };

      // Clear session cache
      await aiCache.remove(CacheKeys.session(sessionId));

      console.log(`✅ Session completed: ${correctAnswers}/${session.totalQuestions} (${accuracy.toFixed(1)}%)`);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('❌ Failed to submit session:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to submit session. Please try again.',
        },
      };
    }
  }

  /**
   * Get session by ID (from cache or database)
   */
  async getSession(sessionId: string): Promise<CompetitiveSession | null> {
    try {
      // Check cache first
      const cached = await aiCache.get<CompetitiveSession>(
        CacheKeys.session(sessionId)
      );

      if (cached) {
        return cached;
      }

      // Fetch from database
      const { data, error } = await supabase
        .from('competitive_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error || !data) {
        return null;
      }

      // Convert database format to session format
      const session: CompetitiveSession = {
        id: data.id,
        studentId: data.student_id,
        subjectId: data.subject_id,
        questions: data.questions_data,
        totalQuestions: data.total_questions,
        weakTopics: data.weak_topics || [],
        createdAt: data.created_at,
        completedAt: data.completed_at,
        correctAnswers: data.correct_answers,
        totalTimeSeconds: data.total_time_seconds,
      };

      return session;
    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  /**
   * Get session history for a student
   */
  async getSessionHistory(
    studentId: string,
    limit: number = 10
  ): Promise<ServiceResponse<CompetitiveSession[]>> {
    try {
      const { data, error } = await supabase
        .from('competitive_sessions')
        .select('*')
        .eq('student_id', studentId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new AIServiceError(
          'API_ERROR',
          'Failed to fetch session history',
          error
        );
      }

      const sessions: CompetitiveSession[] = (data || []).map(item => ({
        id: item.id,
        studentId: item.student_id,
        subjectId: item.subject_id,
        questions: item.questions_data,
        totalQuestions: item.total_questions,
        weakTopics: item.weak_topics || [],
        createdAt: item.created_at,
        completedAt: item.completed_at,
        correctAnswers: item.correct_answers,
        totalTimeSeconds: item.total_time_seconds,
      }));

      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      console.error('❌ Failed to get session history:', error);
      return {
        success: false,
        data: [],
        error: {
          code: 'API_ERROR',
          message: 'Failed to load session history',
        },
      };
    }
  }

  /**
   * Get weak topics for a student in a subject
   * Uses adaptive learning service for topic-level tracking
   * Topics with < 60% accuracy are considered weak
   */
  async getWeakTopics(
    studentId: string,
    subjectId: string
  ): Promise<string[]> {
    try {
      // Check cache first
      const cacheKey = CacheKeys.weakTopics(studentId, subjectId);
      const cached = await aiCache.get<string[]>(cacheKey);

      if (cached) {
        console.log('✅ Returning cached weak topics');
        return cached;
      }

      // Use adaptive learning service to get weak topics from actual performance
      const weakTopicData = await adaptiveLearningService.getWeakTopics(
        studentId,
        subjectId,
        10 // Get top 10 weak topics
      );

      // Extract topic names
      const weakTopics = weakTopicData.map(t => t.topic);

      // If no weak topics found (first session or all topics strong), return empty
      // Edge Function will handle first session logic
      if (weakTopics.length === 0) {
        console.log('✅ No weak topics found - first session or strong performance');
        return [];
      }

      console.log(`✅ Found ${weakTopics.length} weak topics:`, weakTopics);

      // Cache for 1 hour
      await aiCache.set(cacheKey, weakTopics, 60 * 60 * 1000);

      return weakTopics;
    } catch (error) {
      console.error('❌ Failed to get weak topics:', error);
      return [];
    }
  }

  /**
   * Get detailed weak topic analysis for all subjects
   */
  async getWeakTopicAnalysis(
    studentId: string
  ): Promise<ServiceResponse<SubjectWeakTopics[]>> {
    try {
      const { data, error } = await supabase
        .from('study_progress')
        .select('*, subjects(id, name_en)')
        .eq('student_id', studentId);

      if (error) {
        throw new AIServiceError(
          'API_ERROR',
          'Failed to fetch weak topic analysis',
          error
        );
      }

      const analysis: SubjectWeakTopics[] = (data || []).map(item => {
        const overallAccuracy =
          item.questions_attempted > 0
            ? (item.questions_correct / item.questions_attempted) * 100
            : 0;

        // Simplified weak topic detection
        const weakTopics: WeakTopicAnalysis[] = [];

        if (overallAccuracy < 60 && item.questions_attempted >= 10) {
          weakTopics.push({
            topic: 'General Concepts',
            totalQuestions: item.questions_attempted,
            correctAnswers: item.questions_correct,
            accuracy: overallAccuracy,
            isWeak: true,
          });
        }

        return {
          subjectId: item.subject_id,
          subjectName: item.subjects?.name_en || 'Unknown',
          weakTopics,
          overallAccuracy,
        };
      });

      return {
        success: true,
        data: analysis,
      };
    } catch (error) {
      console.error('❌ Failed to get weak topic analysis:', error);
      return {
        success: false,
        data: [],
        error: {
          code: 'API_ERROR',
          message: 'Failed to analyze weak topics',
        },
      };
    }
  }

  /**
   * Clear weak topics cache
   */
  async clearWeakTopicsCache(studentId: string, subjectId: string): Promise<void> {
    const cacheKey = CacheKeys.weakTopics(studentId, subjectId);
    await aiCache.remove(cacheKey);
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout<T>(
    request: GenerateSessionRequest,
    timeoutMs: number
  ): Promise<{ data: T | null; error: any }> {
    try {
      const result = await Promise.race([
        supabase.functions.invoke<T>(this.EDGE_FUNCTION_URL, {
          body: request,
        }),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: new Error('Request timeout') }),
            timeoutMs
          )
        ),
      ]);

      // Log the raw result for debugging
      console.log('🔍 Edge function result:', {
        hasData: !!result.data,
        hasError: !!result.error,
        errorMessage: result.error?.message,
      });

      return result;
    } catch (error) {
      console.error('❌ Edge function invocation failed:', error);
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error: any): string {
    if (error?.code === 'TIMEOUT_ERROR') {
      return 'Question generation took too long. Please try again.';
    }

    if (error?.code === 'NETWORK_ERROR') {
      return 'Please check your internet connection and try again.';
    }

    return 'Unable to generate questions. Please try again later.';
  }
}

// Export singleton instance
export const competitiveModeService = new CompetitiveModeService();
