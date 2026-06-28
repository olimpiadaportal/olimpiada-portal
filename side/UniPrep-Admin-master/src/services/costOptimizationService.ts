/**
 * Cost Optimization Service
 * Stage 5.5 - Phase 3: Cost Optimization Analyzer
 * 
 * Provides AI cost optimization insights and recommendations
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface OptimizationInsight {
  featureType: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgTokensPerRequest: number;
  avgCostPerRequest: number;
  maxCostRequest: number;
  minCostRequest: number;
  costTrend: 'increasing' | 'decreasing' | 'stable';
  optimizationScore: number; // 0-100
  optimizationPotential: number; // Estimated savings in USD
  primarySuggestion: string;
  detailedSuggestions: {
    model_optimization: string;
    token_optimization: string;
    caching_opportunity: string;
    batch_processing: string;
    cost_trend_action: string;
  };
}

export interface OptimizationSummary {
  totalCost: number;
  totalPotentialSavings: number;
  averageOptimizationScore: number;
  topOpportunity: OptimizationInsight | null;
  insights: OptimizationInsight[];
}

/**
 * Get cost optimization insights for all features
 */
export async function getCostOptimizationInsights(
  days: number = 30
): Promise<{ success: boolean; data?: OptimizationSummary; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_cost_optimization_insights', {
      p_days: days,
    });

    if (error) {
      console.error('Error fetching optimization insights:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: {
          totalCost: 0,
          totalPotentialSavings: 0,
          averageOptimizationScore: 100,
          topOpportunity: null,
          insights: [],
        },
      };
    }

    // Transform database response to TypeScript types
    const insights: OptimizationInsight[] = data.map((row: any) => ({
      featureType: row.feature_type,
      totalRequests: row.total_requests,
      totalTokens: row.total_tokens,
      totalCost: parseFloat(row.total_cost),
      avgTokensPerRequest: parseFloat(row.avg_tokens_per_request),
      avgCostPerRequest: parseFloat(row.avg_cost_per_request),
      maxCostRequest: parseFloat(row.max_cost_request),
      minCostRequest: parseFloat(row.min_cost_request),
      costTrend: row.cost_trend,
      optimizationScore: row.optimization_score,
      optimizationPotential: parseFloat(row.optimization_potential),
      primarySuggestion: row.primary_suggestion,
      detailedSuggestions: row.detailed_suggestions,
    }));

    // Calculate summary statistics
    const totalCost = insights.reduce((sum, i) => sum + i.totalCost, 0);
    const totalPotentialSavings = insights.reduce((sum, i) => sum + i.optimizationPotential, 0);
    const averageOptimizationScore =
      insights.reduce((sum, i) => sum + i.optimizationScore, 0) / insights.length;

    // Find top optimization opportunity (lowest score with highest potential savings)
    const topOpportunity = insights.reduce((top, current) => {
      if (!top) return current;
      
      const topPriority = (100 - top.optimizationScore) * top.optimizationPotential;
      const currentPriority = (100 - current.optimizationScore) * current.optimizationPotential;
      
      return currentPriority > topPriority ? current : top;
    }, null as OptimizationInsight | null);

    return {
      success: true,
      data: {
        totalCost,
        totalPotentialSavings,
        averageOptimizationScore: Math.round(averageOptimizationScore),
        topOpportunity,
        insights,
      },
    };
  } catch (error) {
    console.error('Error in getCostOptimizationInsights:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get optimization suggestions for a specific feature
 */
export async function getFeatureOptimizationSuggestions(
  featureType: string,
  days: number = 30
): Promise<{ success: boolean; data?: OptimizationInsight; error?: string }> {
  try {
    const result = await getCostOptimizationInsights(days);

    if (!result.success || !result.data) {
      return { success: false, error: result.error };
    }

    const insight = result.data.insights.find((i) => i.featureType === featureType);

    if (!insight) {
      return { success: false, error: 'Feature not found' };
    }

    return { success: true, data: insight };
  } catch (error) {
    console.error('Error in getFeatureOptimizationSuggestions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get quick optimization tips based on overall usage
 */
export function getQuickOptimizationTips(summary: OptimizationSummary): string[] {
  const tips: string[] = [];

  if (summary.averageOptimizationScore < 60) {
    tips.push('⚠️ Overall optimization score is low. Review model selection and prompt engineering.');
  }

  if (summary.totalPotentialSavings > summary.totalCost * 0.2) {
    tips.push(`💰 You could save up to $${summary.totalPotentialSavings.toFixed(2)} (${((summary.totalPotentialSavings / summary.totalCost) * 100).toFixed(0)}%) with optimizations.`);
  }

  if (summary.topOpportunity) {
    tips.push(`🎯 Top opportunity: ${summary.topOpportunity.featureType} - ${summary.topOpportunity.primarySuggestion}`);
  }

  const increasingTrends = summary.insights.filter((i) => i.costTrend === 'increasing');
  if (increasingTrends.length > 0) {
    tips.push(`📈 ${increasingTrends.length} feature(s) showing increasing costs. Review recent changes.`);
  }

  if (tips.length === 0) {
    tips.push('✅ Your AI usage is well optimized! Keep up the good work.');
  }

  return tips;
}
