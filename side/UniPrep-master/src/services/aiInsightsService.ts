/**
 * AI Insights Service
 * 
 * Manages AI-powered study insights and recommendations.
 * Features:
 * - Client-side caching (3-day TTL - 2x per week)
 * - Fallback to rule-based insights
 * - Mark insights as read
 * - Force refresh capability
 */

import { supabase } from './supabase';
import { aiCache, CacheKeys } from '../utils/aiCache';
import { aiConfigService } from './aiConfigService';
import {
  AIInsight,
  InsightsResponse,
  FallbackInsight,
  AIServiceError,
  ServiceResponse,
} from '../types/ai';

class AIInsightsService {
  private readonly EDGE_FUNCTION_URL = 'ai-insights';
  private readonly CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days (same as competitive mode - 2x per week)

  /**
   * Fetch AI insights for a student
   * Server-side caching is handled by the Edge Function (3-day expiration)
   * This ensures insights are synced between web and mobile apps
   */
  async fetchInsights(
    studentId: string,
    forceRefresh: boolean = false
  ): Promise<ServiceResponse<AIInsight[]>> {
    try {
      // Check AI configuration FIRST
      const configCheck = await aiConfigService.checkAIFeatureAccess('student_insights');
      if (!configCheck.allowed) {
        return {
          success: false,
          error: {
            code: 'MAINTENANCE_MODE',
            message: configCheck.message || 'AI Insights is currently unavailable.',
          },
        };
      }

      // Fetch from Edge Function (server-side cache handled there)
      console.log('🔄 Fetching insights from API (server-side cache)...');
      const { data, error } = await supabase.functions.invoke<InsightsResponse>(
        this.EDGE_FUNCTION_URL,
        {
          body: { forceRefresh },
        }
      );

      if (error) {
        throw new AIServiceError(
          'API_ERROR',
          'Failed to fetch insights from API',
          error
        );
      }

      if (!data || !data.insights) {
        throw new AIServiceError(
          'API_ERROR',
          'Invalid response from API',
          data
        );
      }

      // Map insights and fetch IDs from database
      const mappedInsights = await this.mapInsightsWithIds(studentId, data.insights);

      console.log(`✅ Fetched ${mappedInsights.length} insights (cached: ${data.cached || false})`);
      return {
        success: true,
        data: mappedInsights,
        cached: data.cached || false,
      };
    } catch (error) {
      console.error('❌ Failed to fetch insights:', error);

      // Fallback to rule-based insights
      console.log('⚠️ Using fallback insights');
      const fallbackInsights = await this.getFallbackInsights(studentId);

      return {
        success: false,
        data: fallbackInsights,
        cached: false,
        error: {
          code: 'API_ERROR',
          message: 'Using rule-based insights',
        },
      };
    }
  }

  /**
   * Force refresh insights (bypass server-side cache)
   */
  async refreshInsights(studentId: string): Promise<ServiceResponse<AIInsight[]>> {
    // Fetch fresh data (forceRefresh=true tells Edge Function to bypass cache)
    return this.fetchInsights(studentId, true);
  }

  /**
   * Map insights with database IDs
   */
  private async mapInsightsWithIds(
    studentId: string,
    insights: any[]
  ): Promise<AIInsight[]> {
    try {
      console.log(`🔍 Mapping ${insights.length} insights with database IDs...`);
      
      // Fetch all insights from database for this student
      const { data: dbInsights, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('❌ Database query error:', error);
      }

      console.log(`📊 Found ${dbInsights?.length || 0} insights in database`);

      if (!dbInsights || dbInsights.length === 0) {
        console.log('⚠️ No database insights found - using temporary IDs');
        // No database insights, return with temporary IDs
        return insights.map((insight, index) => ({
          id: `temp-${index}`,
          studentId,
          type: insight.type,
          subjectId: insight.subject_id,
          title: insight.title,
          content: insight.content,
          priority: insight.priority,
          isRead: false,
          generatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
        }));
      }

      // Map backend insights to database insights by matching title/content
      const mapped = insights.map((insight, index) => {
        const dbInsight = dbInsights.find(
          db => db.title === insight.title && db.content === insight.content
        ) || dbInsights[index];

        const hasDbMatch = !!dbInsights.find(
          db => db.title === insight.title && db.content === insight.content
        );

        console.log(`  ${hasDbMatch ? '✅' : '⚠️'} "${insight.title.substring(0, 30)}..." - ${hasDbMatch ? 'Matched with DB' : 'Using fallback'}`);

        return {
          id: dbInsight?.id || `temp-${index}`,
          studentId,
          type: insight.type,
          subjectId: insight.subject_id,
          title: insight.title,
          content: insight.content,
          priority: insight.priority,
          isRead: dbInsight?.is_read || false,
          generatedAt: dbInsight?.created_at || new Date().toISOString(),
          expiresAt: dbInsight?.expires_at || new Date(Date.now() + this.CACHE_TTL).toISOString(),
        };
      });

      const dbMatchCount = mapped.filter(m => !m.id.startsWith('temp-')).length;
      console.log(`✅ Mapped ${dbMatchCount}/${insights.length} insights with database IDs`);

      return mapped;
    } catch (error) {
      console.error('❌ Failed to map insights with IDs:', error);
      // Return insights with temporary IDs
      return insights.map((insight, index) => ({
        id: `temp-${index}`,
        studentId,
        type: insight.type,
        subjectId: insight.subject_id,
        title: insight.title,
        content: insight.content,
        priority: insight.priority,
        isRead: false,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
      }));
    }
  }

  /**
   * Mark an insight as read
   */
  async markInsightAsRead(insightId: string): Promise<ServiceResponse<void>> {
    try {
      console.log(`🔄 Marking insight as read: ${insightId}`);

      // Check if this is a temporary ID (not in database)
      if (!insightId || insightId.startsWith('temp-') || insightId.startsWith('fallback-') || insightId.startsWith('default-')) {
        console.log('⚠️ Cannot mark temporary insight as read');
        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message: 'This insight is not saved in the database',
          },
        };
      }
      
      const { error } = await supabase
        .from('ai_insights')
        .update({ is_read: true })
        .eq('id', insightId);

      if (error) {
        console.error('❌ Database error:', error);
        throw new AIServiceError(
          'API_ERROR',
          'Failed to mark insight as read',
          error
        );
      }

      console.log(`✅ Marked insight ${insightId} as read`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to mark insight as read:', error);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: 'Failed to mark insight as read',
          details: error,
        },
      };
    }
  }

  /**
   * Get unread insights count
   */
  async getUnreadCount(studentId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('ai_insights')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('is_read', false)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Failed to get unread count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * Clear insights cache for a student
   */
  async clearCache(studentId: string): Promise<void> {
    await aiCache.remove(CacheKeys.insights(studentId));
  }

  /**
   * Get fallback rule-based insights
   * Used when AI API fails
   */
  private async getFallbackInsights(studentId: string): Promise<AIInsight[]> {
    try {
      // Fetch student's study progress
      const { data: progress, error } = await supabase
        .from('study_progress')
        .select('*, subjects(name_en, name_az)')
        .eq('student_id', studentId)
        .order('questions_attempted', { ascending: false })
        .limit(5);

      if (error || !progress || progress.length === 0) {
        return this.getDefaultInsights();
      }

      const insights: AIInsight[] = [];

      // Analyze progress and generate rule-based insights
      progress.forEach((subjectProgress, index) => {
        const accuracy =
          subjectProgress.questions_attempted > 0
            ? (subjectProgress.questions_correct / subjectProgress.questions_attempted) * 100
            : 0;

        const subjectName = subjectProgress.subjects?.name_az || subjectProgress.subjects?.name_en || 'this subject';

        // Weak area insight
        if (accuracy < 60 && subjectProgress.questions_attempted >= 10) {
          insights.push({
            id: `fallback-weak-${index}`,
            studentId,
            type: 'weak_area',
            subjectId: subjectProgress.subject_id,
            title: `${subjectName} üzərində işlə`,
            content: `${subjectName} fənnində dəqiqliyiniz ${accuracy.toFixed(1)}%-dir. Yaxşılaşdırmaq üçün daha çox sual həll edin.`,
            priority: 'high',
            isRead: false,
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
          });
        }

        // Strength insight
        if (accuracy >= 80 && subjectProgress.questions_attempted >= 20) {
          insights.push({
            id: `fallback-strength-${index}`,
            studentId,
            type: 'strength',
            subjectId: subjectProgress.subject_id,
            title: `${subjectName} - əla nəticə!`,
            content: `${subjectName} fənnində ${accuracy.toFixed(1)}% dəqiqliyiniz var. Belə davam edin!`,
            priority: 'medium',
            isRead: false,
            generatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
          });
        }
      });

      // Add general study tip
      insights.push({
        id: 'fallback-tip-1',
        studentId,
        type: 'study_tip',
        title: 'Gündəlik məşq',
        content: 'Ən yaxşı nəticələr üçün hər gün 30 dəqiqə məqsədyönlü məşq edin.',
        priority: 'medium',
        isRead: false,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
      });

      return insights.slice(0, 5); // Return max 5 insights
    } catch (error) {
      console.error('Failed to generate fallback insights:', error);
      return this.getDefaultInsights();
    }
  }

  /**
   * Get default insights when no data is available
   */
  private getDefaultInsights(): AIInsight[] {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.CACHE_TTL).toISOString();

    return [
      {
        id: 'default-1',
        studentId: '',
        type: 'recommendation',
        title: 'Elmly-yə xoş gəlmisiniz!',
        content: 'Fərdiləşdirilmiş təhsil məsləhətləri almaq üçün sualları həll etməyə başlayın.',
        priority: 'high',
        isRead: false,
        generatedAt: now,
        expiresAt,
      },
      {
        id: 'default-2',
        studentId: '',
        type: 'study_tip',
        title: 'Gündəlik məşq',
        content: 'Ən yaxşı nəticələr üçün hər gün 30 dəqiqə məşq etməyə çalışın.',
        priority: 'medium',
        isRead: false,
        generatedAt: now,
        expiresAt,
      },
      {
        id: 'default-3',
        studentId: '',
        type: 'study_tip',
        title: 'Səhvləri nəzərdən keçirin',
        content: 'Səhvlərdən öyrənmək üçün həmişə yanlış cavablarınızı nəzərdən keçirin.',
        priority: 'medium',
        isRead: false,
        generatedAt: now,
        expiresAt,
      },
    ];
  }
}

// Export singleton instance
export const aiInsightsService = new AIInsightsService();
