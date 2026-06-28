/**
 * AI Insights Context
 * 
 * Provides shared state for AI insights across Home tab and AllInsights screen
 * Ensures mark as read actions are synchronized between screens
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AIInsight } from '../types/ai';
import { aiInsightsService } from '../services/aiInsightsService';

interface AIInsightsContextType {
  insights: AIInsight[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  loadInsights: (studentId: string, forceRefresh?: boolean, showLoader?: boolean) => Promise<void>;
  refreshInsights: (studentId: string) => Promise<void>;
  markAsRead: (insightId: string) => Promise<void>;
  clearInsights: () => void;
}

const AIInsightsContext = createContext<AIInsightsContextType | undefined>(undefined);

interface AIInsightsProviderProps {
  children: ReactNode;
}

export const AIInsightsProvider: React.FC<AIInsightsProviderProps> = ({ children }) => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = insights.filter(i => !i.isRead).length;

  const loadInsights = useCallback(async (
    studentId: string,
    forceRefresh: boolean = false,
    showLoader: boolean = true
  ) => {
    if (!studentId) return;

    try {
      if (showLoader) setLoading(true);
      setError(null);

      const response = await aiInsightsService.fetchInsights(studentId, forceRefresh);

      if (response.success && response.data) {
        setInsights(response.data);
        setError(null);
      } else if (response.data && response.data.length > 0) {
        // Fallback insights available
        setInsights(response.data);
        setError(null);
      } else {
        if (response.error?.code === 'MAINTENANCE_MODE') {
          setError('AI Insights is in maintenance mode');
        } else {
          setError(response.error?.message || 'Failed to load insights');
        }
      }
    } catch (err) {
      console.error('Failed to load insights:', err);
      setError('Unable to load insights');
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  const refreshInsights = useCallback(async (studentId: string) => {
    if (!studentId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await aiInsightsService.refreshInsights(studentId);

      if (response.success && response.data) {
        setInsights(response.data);
        setError(null);
      } else if (response.data && response.data.length > 0) {
        setInsights(response.data);
        setError(null);
      } else {
        if (response.error?.code === 'MAINTENANCE_MODE') {
          setError('AI Insights is in maintenance mode');
        } else {
          setError(response.error?.message || 'Failed to refresh insights');
        }
      }
    } catch (err) {
      console.error('Failed to refresh insights:', err);
      setError('Unable to refresh insights');
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (insightId: string) => {
    try {
      // Optimistically update local state first
      setInsights(prev =>
        prev.map(insight =>
          insight.id === insightId
            ? { ...insight, isRead: true }
            : insight
        )
      );

      // Then update in backend
      await aiInsightsService.markInsightAsRead(insightId);
      console.log(`✅ Insight ${insightId} marked as read (synced)`);
    } catch (error) {
      console.error('Failed to mark insight as read:', error);
      // Revert on error
      setInsights(prev =>
        prev.map(insight =>
          insight.id === insightId
            ? { ...insight, isRead: false }
            : insight
        )
      );
    }
  }, []);

  const clearInsights = useCallback(() => {
    setInsights([]);
    setError(null);
  }, []);

  return (
    <AIInsightsContext.Provider
      value={{
        insights,
        loading,
        error,
        unreadCount,
        loadInsights,
        refreshInsights,
        markAsRead,
        clearInsights,
      }}
    >
      {children}
    </AIInsightsContext.Provider>
  );
};

export const useAIInsights = (): AIInsightsContextType => {
  const context = useContext(AIInsightsContext);
  if (context === undefined) {
    throw new Error('useAIInsights must be used within an AIInsightsProvider');
  }
  return context;
};

export default AIInsightsContext;
