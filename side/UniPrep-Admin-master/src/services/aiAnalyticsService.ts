/**
 * AI Analytics Service
 * Fetches AI usage analytics and statistics
 * Stage 5.5 - Phase 2
 */

import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface AIUsageOverview {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
  success_rate: number;
  by_feature: FeatureUsage[];
  by_provider: ProviderUsage[];
  by_status: StatusBreakdown[];
  period: {
    start: string;
    end: string;
  };
  timestamp: string;
}

export interface FeatureUsage {
  feature: string;
  requests: number;
  tokens: number;
  cost: number;
  avg_quality: number;
}

export interface ProviderUsage {
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
  avg_latency: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface CostTrend {
  period_date: string;
  requests: number;
  tokens: number;
  cost: number;
  avg_cost_per_request: number;
}

export interface BudgetStatus {
  budget_id: string;
  budget_name: string;
  period_type: string;
  period_start: string;
  period_end: string;
  budget_amount: number;
  current_spend: number;
  remaining: number;
  percent_used: number;
  days_remaining: number;
  projected_spend: number;
  alert_threshold: number;
  is_over_threshold: boolean;
  is_over_budget: boolean;
  status: 'normal' | 'warning' | 'over_budget';
  hard_limit_enabled: boolean;
}

export interface QualityMetrics {
  avg_quality_score: number;
  total_reviewed: number;
  approval_rate: number;
  flagged_count: number;
  common_issues: Array<{ issue: string; count: number }>;
  trends: Array<{ date: string; avg_score: number; count: number }>;
  period: {
    start: string;
    end: string;
  };
  timestamp: string;
}

export interface ReviewQueueItem {
  log_id: string;
  request_id: string;
  feature_type: string;
  provider: string;
  model: string;
  quality_score: number;
  flagged_reason: string;
  created_at: string;
  priority: number;
}

// ============================================
// Analytics Functions
// ============================================

/**
 * Get AI usage overview
 */
export async function getAIUsageOverview(
  startDate?: Date,
  endDate?: Date,
  featureType?: string,
  provider?: string
): Promise<{ data: AIUsageOverview | null; error: any }> {
  try {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const { data, error } = await supabase.rpc('get_ai_usage_overview', {
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
      p_feature_type: featureType || null,
      p_provider: provider || null,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching AI usage overview:', error);
    return { data: null, error };
  }
}

/**
 * Get cost trends
 */
export async function getCostTrends(
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily',
  days: number = 30
): Promise<{ data: CostTrend[] | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_ai_cost_trends', {
      p_period: period,
      p_days: days,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching cost trends:', error);
    return { data: null, error };
  }
}

/**
 * Get budget status
 */
export async function getBudgetStatus(
  budgetId?: string
): Promise<{ data: BudgetStatus[] | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_ai_budget_status', {
      p_budget_id: budgetId || null,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching budget status:', error);
    return { data: null, error };
  }
}

/**
 * Get quality metrics
 */
export async function getQualityMetrics(
  startDate?: Date,
  endDate?: Date,
  featureType?: string
): Promise<{ data: QualityMetrics | null; error: any }> {
  try {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const { data, error } = await supabase.rpc('get_ai_quality_metrics', {
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
      p_feature_type: featureType || null,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching quality metrics:', error);
    return { data: null, error };
  }
}

/**
 * Get review queue
 */
export async function getReviewQueue(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
  limit: number = 20
): Promise<{ data: ReviewQueueItem[] | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc('get_ai_review_queue', {
      p_status: status,
      p_limit: limit,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching review queue:', error);
    return { data: null, error };
  }
}

/**
 * Get usage logs with pagination
 */
export async function getUsageLogs(
  page: number = 1,
  pageSize: number = 20,
  filters?: {
    featureType?: string;
    provider?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ data: any[] | null; count: number; error: any }> {
  try {
    let query = supabase
      .from('ai_usage_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filters?.featureType) {
      query = query.eq('feature_type', filters.featureType);
    }

    if (filters?.provider) {
      query = query.eq('provider', filters.provider);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    const { data, count, error } = await query;

    if (error) throw error;

    return { data, count: count || 0, error: null };
  } catch (error: any) {
    console.error('Error fetching usage logs:', error);
    return { data: null, count: 0, error };
  }
}

/**
 * Get budgets list
 */
export async function getBudgets(): Promise<{ data: any[] | null; error: any }> {
  try {
    const { data, error} = await supabase
      .from('ai_budgets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching budgets:', error);
    return { data: null, error };
  }
}

/**
 * Create budget
 * Phase 3: Added alert configuration fields
 */
export async function createBudget(budget: {
  name: string;
  description?: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  budget_usd: number;
  alert_threshold_percent?: number;
  hard_limit?: boolean;
  feature_types?: string[];
  providers?: string[];
  // Phase 3: Alert configuration
  alert_enabled?: boolean;
  alert_email?: string;
  alert_threshold_1?: number;
  alert_threshold_2?: number;
  alert_threshold_3?: number;
  hard_limit_enabled?: boolean;
  grace_period_hours?: number;
}): Promise<{ data: any | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('ai_budgets')
      .insert(budget)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error creating budget:', error);
    return { data: null, error };
  }
}

/**
 * Update budget
 */
export async function updateBudget(
  budgetId: string,
  updates: Partial<any>
): Promise<{ data: any | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('ai_budgets')
      .update(updates)
      .eq('id', budgetId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error updating budget:', error);
    return { data: null, error };
  }
}

/**
 * Delete budget
 */
export async function deleteBudget(budgetId: string): Promise<{ error: any }> {
  try {
    const { error } = await supabase
      .from('ai_budgets')
      .delete()
      .eq('id', budgetId);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error('Error deleting budget:', error);
    return { error };
  }
}

/**
 * Get single budget by ID
 */
export async function getBudget(budgetId: string): Promise<{ data: any | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('ai_budgets')
      .select('*')
      .eq('id', budgetId)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Error fetching budget:', error);
    return { data: null, error };
  }
}

export default {
  getAIUsageOverview,
  getCostTrends,
  getBudgetStatus,
  getQualityMetrics,
  getReviewQueue,
  getUsageLogs,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
};
