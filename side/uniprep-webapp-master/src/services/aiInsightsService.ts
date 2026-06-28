/**
 * AI Insights Service for Webapp
 * Manages AI-powered study insights and recommendations
 * Matches mobile app implementation
 */

import { createClient } from '@/lib/supabase/client'
import { aiCache, CacheKeys } from '@/lib/utils/aiCache'
import {
  AIInsight,
  InsightsResponse,
  ServiceResponse,
  StudentAnswerRow,
} from '@/types/ai'

class AIInsightsService {
  private readonly EDGE_FUNCTION_URL = 'ai-insights'
  private readonly CACHE_TTL = 3 * 24 * 60 * 60 * 1000 // 3 days

  /**
   * Fetch AI insights for a student
   * Server-side caching is handled by the Edge Function (3-day expiration)
   * This ensures insights are synced between web and mobile apps
   */
  async fetchInsights(
    userId: string,
    forceRefresh: boolean = false
  ): Promise<ServiceResponse<AIInsight[]>> {
    try {
      // Fetch from Edge Function (server-side cache handled there)
      const supabase = createClient()
      
      const { data, error } = await supabase.functions.invoke<InsightsResponse>(
        this.EDGE_FUNCTION_URL,
        {
          body: { forceRefresh },
        }
      )

      if (error) {
        throw error
      }

      if (!data || !data.insights) {
        throw new Error('Invalid response from API')
      }

      // Map insights with database IDs and read status (matching mobile app)
      const mappedInsights = await this.mapInsightsWithDbStatus(userId, data.insights)

      return {
        success: true,
        data: mappedInsights,
        cached: data.cached || false,
      }
    } catch (error) {
      // Fallback to rule-based insights
      const fallbackInsights = await this.getFallbackInsights(userId)

      return {
        success: false,
        data: fallbackInsights,
        cached: false,
        error: {
          code: 'API_ERROR',
          message: 'Using rule-based insights',
        },
      }
    }
  }

  /**
   * Map insights with database IDs and read status
   * Matches mobile app implementation for sync
   */
  private async mapInsightsWithDbStatus(
    userId: string,
    insights: any[]
  ): Promise<AIInsight[]> {
    try {
      const supabase = createClient()
      
      // First, get the student ID from user ID (Edge Function stores with student_id, not user_id)
      const { data: student, error: studentError } = await (supabase as any)
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle() as { data: { id: string } | null; error: any }

      if (studentError || !student) {
        // No student record, return with temporary IDs
        return insights.map((insight, index) => ({
          id: `temp-${index}`,
          type: insight.type || 'recommendation',
          title: insight.title,
          description: insight.content || insight.description,
          priority: insight.priority || 'medium',
          actionable: insight.actionable || false,
          actionText: insight.actionText,
          relatedSubjects: insight.relatedSubjects,
          relatedTopics: insight.relatedTopics,
          viewed: false,
          metadata: insight.metadata,
        }))
      }

      // Fetch all insights from database for this student using student.id
      const { data: dbInsights, error } = await (supabase as any)
        .from('ai_insights')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Database query error:', error)
      }

      if (!dbInsights || dbInsights.length === 0) {
        // No database insights, return with temporary IDs and unread status
        return insights.map((insight, index) => ({
          id: `temp-${index}`,
          type: insight.type || 'recommendation',
          title: insight.title,
          description: insight.content || insight.description,
          priority: insight.priority || 'medium',
          actionable: insight.actionable || false,
          actionText: insight.actionText,
          relatedSubjects: insight.relatedSubjects,
          relatedTopics: insight.relatedTopics,
          viewed: false, // Unread by default
          metadata: insight.metadata,
        }))
      }

      // Map backend insights to database insights by matching title/content
      return insights.map((insight, index) => {
        const dbInsight = dbInsights.find(
          (db: any) => db.title === insight.title && db.content === (insight.content || insight.description)
        ) || dbInsights[index]

        return {
          id: dbInsight?.id || `temp-${index}`,
          type: insight.type || 'recommendation',
          title: insight.title,
          description: insight.content || insight.description,
          priority: insight.priority || 'medium',
          actionable: insight.actionable || false,
          actionText: insight.actionText,
          relatedSubjects: insight.relatedSubjects,
          relatedTopics: insight.relatedTopics,
          viewed: dbInsight?.is_read || false, // Map is_read from DB to viewed
          metadata: insight.metadata,
        }
      })
    } catch (error) {
      console.error('Failed to map insights with DB status:', error)
      // Return insights with temporary IDs and unread status
      return insights.map((insight, index) => ({
        id: `temp-${index}`,
        type: insight.type || 'recommendation',
        title: insight.title,
        description: insight.content || insight.description,
        priority: insight.priority || 'medium',
        actionable: insight.actionable || false,
        actionText: insight.actionText,
        relatedSubjects: insight.relatedSubjects,
        relatedTopics: insight.relatedTopics,
        viewed: false,
        metadata: insight.metadata,
      }))
    }
  }

  /**
   * Force refresh insights (bypass server-side cache)
   */
  async refreshInsights(userId: string): Promise<ServiceResponse<AIInsight[]>> {
    return this.fetchInsights(userId, true)
  }

  /**
   * Get fallback rule-based insights
   */
  private async getFallbackInsights(userId: string): Promise<AIInsight[]> {
    try {
      const supabase = createClient()
      
      // Get user's recent performance
      const { data } = await supabase
        .from('student_answers')
        .select('question_id, is_correct, questions(subject_id, topic, subtopic_id, subject_subtopics(subtopic_name))')
        .eq('user_id', userId)
        .order('answered_at', { ascending: false })
        .limit(100)

      // Type assertion for the query result
      const answers = data as StudentAnswerRow[] | null

      if (!answers || answers.length === 0) {
        return this.getDefaultInsights()
      }

      const insights: AIInsight[] = []

      // Calculate accuracy
      const correctCount = answers.filter(a => a.is_correct).length
      const accuracy = Math.round((correctCount / answers.length) * 100)

      // Overall performance insight
      if (accuracy >= 80) {
        insights.push({
          id: 'fallback-1',
          type: 'strength',
          title: 'Excellent Performance!',
          description: `You're doing great with ${accuracy}% accuracy. Keep up the good work!`,
          priority: 'high',
          actionable: false,
        })
      } else if (accuracy < 60) {
        insights.push({
          id: 'fallback-2',
          type: 'weakness',
          title: 'Room for Improvement',
          description: `Your current accuracy is ${accuracy}%. Focus on understanding concepts better.`,
          priority: 'high',
          actionable: true,
          actionText: 'Review weak topics',
        })
      }

      // Topic-based insights
      const topicStats = new Map<string, { correct: number; total: number }>()
      answers.forEach(a => {
        const topic = a.questions?.topic
        if (topic) {
          const stats = topicStats.get(topic) || { correct: 0, total: 0 }
          stats.total++
          if (a.is_correct) stats.correct++
          topicStats.set(topic, stats)
        }
      })

      // Find weak topics
      const weakTopics = Array.from(topicStats.entries())
        .filter(([_, stats]) => stats.total >= 5 && (stats.correct / stats.total) < 0.6)
        .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
        .slice(0, 2)

      weakTopics.forEach(([topic, stats], index) => {
        const topicAccuracy = Math.round((stats.correct / stats.total) * 100)
        insights.push({
          id: `fallback-weak-${index}`,
          type: 'recommendation',
          title: `Focus on ${topic}`,
          description: `You have ${topicAccuracy}% accuracy in this topic. Practice more questions to improve.`,
          priority: 'medium',
          actionable: true,
          actionText: 'Practice this topic',
          relatedTopics: [topic],
        })
      })

      // Stage 7: Subtopic-level weak area insights
      const subtopicStats = new Map<string, { correct: number; total: number; topic: string }>()
      answers.forEach(a => {
        const subtopicName = a.questions?.subject_subtopics?.subtopic_name
        const topic = a.questions?.topic || ''
        if (!subtopicName) return
        const stats = subtopicStats.get(subtopicName) || { correct: 0, total: 0, topic }
        stats.total++
        if (a.is_correct) stats.correct++
        subtopicStats.set(subtopicName, stats)
      })

      const weakSubtopics = Array.from(subtopicStats.entries())
        .filter(([_, s]) => s.total >= 5 && (s.correct / s.total) < 0.6)
        .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
        .slice(0, 2)

      weakSubtopics.forEach(([subtopic, stats], index) => {
        const subtopicAccuracy = Math.round((stats.correct / stats.total) * 100)
        insights.push({
          id: `fallback-weak-subtopic-${index}`,
          type: 'recommendation',
          title: `Drill down on ${subtopic}`,
          description: `You have ${subtopicAccuracy}% accuracy in "${subtopic}" (${stats.topic}). Target this subtopic to improve faster.`,
          priority: 'medium',
          actionable: true,
          actionText: 'Practice this subtopic',
          relatedTopics: [stats.topic],
        })
      })

      return insights.length > 0 ? insights : this.getDefaultInsights()
    } catch (error) {
      return this.getDefaultInsights()
    }
  }

  /**
   * Get default insights when no data available
   */
  private getDefaultInsights(): AIInsight[] {
    return [
      {
        id: 'default-1',
        type: 'recommendation',
        title: 'Start Practicing',
        description: 'Begin your practice journey to get personalized insights.',
        priority: 'medium',
        actionable: true,
        actionText: 'Start Practice',
      },
    ]
  }

  /**
   * Mark an insight as read
   */
  async markInsightAsRead(insightId: string): Promise<ServiceResponse<void>> {
    try {
      // Check if this is a temporary/fallback ID
      if (!insightId || insightId.startsWith('fallback-') || insightId.startsWith('default-')) {
        return {
          success: false,
          error: {
            code: 'INVALID_ID',
            message: 'Cannot mark temporary insight as read',
          },
        }
      }

      const supabase = createClient()
      // Use RPC or raw query since ai_insights table not in generated Supabase types
      const { error } = await (supabase as any)
        .from('ai_insights')
        .update({ is_read: true })
        .eq('id', insightId)

      if (error) {
        throw error
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to mark insight as read:', error)
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to mark insight as read',
        },
      }
    }
  }

  /**
   * Get unread insights count
   * @param userId - The auth user ID (will be converted to student ID internally)
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const supabase = createClient()
      
      // First, get the student ID from user ID
      const { data: student, error: studentError } = await (supabase as any)
        .from('students')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle() as { data: { id: string } | null; error: any }

      if (studentError || !student) {
        return 0
      }

      const { count, error } = await (supabase as any)
        .from('ai_insights')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', student.id)
        .eq('is_read', false)
        .gt('expires_at', new Date().toISOString())

      if (error) {
        console.error('Failed to get unread count:', error)
        return 0
      }

      return count || 0
    } catch (error) {
      console.error('Failed to get unread count:', error)
      return 0
    }
  }
}

export const aiInsightsService = new AIInsightsService()
