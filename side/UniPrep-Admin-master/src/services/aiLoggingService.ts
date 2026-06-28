/**
 * AI Logging Service
 * Tracks all AI API calls for monitoring and analytics
 * Stage 5.5 - Phase 1
 */

import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface AIUsageLog {
  id?: string;
  request_id: string;
  user_id?: string;
  feature_type: string;
  provider: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  status: 'success' | 'error' | 'timeout' | 'rate_limited';
  error_message?: string;
  error_code?: string;
  quality_score?: number;
  flagged_for_review?: boolean;
  review_status?: 'pending' | 'approved' | 'rejected' | 'needs_improvement';
  prompt_version?: string;
  request_metadata?: Record<string, any>;
  response_metadata?: Record<string, any>;
}

export interface AIRequest {
  feature_type: string;
  provider: string;
  model: string;
  prompt_version?: string;
  metadata?: Record<string, any>;
}

export interface AIResponse {
  success: boolean;
  data?: any;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost_usd?: number;
  latency_ms?: number;
  error?: string;
  error_code?: string;
}

// ============================================
// Cost Calculation
// ============================================

/**
 * AI Provider Pricing Configuration
 * Pricing as of November 2025 (per 1K tokens)
 * 
 * To add a new provider:
 * 1. Add provider key to this object
 * 2. Add models with their pricing
 * 3. Update the provider list in comments
 */
const AI_PRICING: Record<string, Record<string, { prompt: number; completion: number }>> = {
  // Deepseek AI - Current provider (Very cost-effective!)
  deepseek: {
    'deepseek-chat': { prompt: 0.00014, completion: 0.00028 },
    'deepseek-coder': { prompt: 0.00014, completion: 0.00028 },
    'deepseek-reasoner': { prompt: 0.00055, completion: 0.0022 },
  },
  
  // OpenAI - Alternative provider
  openai: {
    'gpt-4': { prompt: 0.03, completion: 0.06 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-4o': { prompt: 0.0025, completion: 0.01 },
    'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
    'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
    'gpt-3.5-turbo-16k': { prompt: 0.003, completion: 0.004 },
  },
  
  // Anthropic - Alternative provider
  anthropic: {
    'claude-3-opus': { prompt: 0.015, completion: 0.075 },
    'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
    'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
    'claude-3.5-sonnet': { prompt: 0.003, completion: 0.015 },
  },
  
  // Google - Alternative provider
  google: {
    'gemini-pro': { prompt: 0.000125, completion: 0.000375 },
    'gemini-pro-vision': { prompt: 0.00025, completion: 0.00075 },
    'gemini-1.5-pro': { prompt: 0.00125, completion: 0.005 },
    'gemini-1.5-flash': { prompt: 0.000075, completion: 0.0003 },
  },
  
  // Custom/Unknown providers - Default to zero cost
  custom: {
    'default': { prompt: 0, completion: 0 },
  },
};

/**
 * Calculate cost based on provider, model, and tokens
 * Supports dynamic provider addition through AI_PRICING configuration
 */
export function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Normalize provider name to lowercase
  const normalizedProvider = provider.toLowerCase();
  
  // Get provider pricing
  const providerPricing = AI_PRICING[normalizedProvider];
  
  if (!providerPricing) {
    console.warn(`Unknown provider: ${provider}, cost will be $0. Add pricing to AI_PRICING configuration.`);
    return 0;
  }
  
  // Get model pricing
  const modelPricing = providerPricing[model];
  
  if (!modelPricing) {
    console.warn(`Unknown model: ${model} for provider ${provider}, cost will be $0. Add pricing to AI_PRICING configuration.`);
    return 0;
  }

  // Calculate costs
  const promptCost = (promptTokens / 1000) * modelPricing.prompt;
  const completionCost = (completionTokens / 1000) * modelPricing.completion;

  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Get available providers
 */
export function getAvailableProviders(): string[] {
  return Object.keys(AI_PRICING).filter(p => p !== 'custom');
}

/**
 * Get available models for a provider
 */
export function getAvailableModels(provider: string): string[] {
  const normalizedProvider = provider.toLowerCase();
  return Object.keys(AI_PRICING[normalizedProvider] || {});
}

/**
 * Check if provider and model are supported
 */
export function isProviderSupported(provider: string, model?: string): boolean {
  const normalizedProvider = provider.toLowerCase();
  const providerExists = !!AI_PRICING[normalizedProvider];
  
  if (!model) return providerExists;
  
  return providerExists && !!AI_PRICING[normalizedProvider][model];
}

// ============================================
// Quality Scoring
// ============================================

/**
 * Calculate quality score based on various factors
 * Returns a score between 0.00 and 1.00
 */
export function calculateQualityScore(
  response: AIResponse,
  request: AIRequest
): number {
  let score = 1.0;

  // Penalize errors
  if (!response.success) {
    score -= 0.5;
  }

  // Penalize high latency (>10 seconds)
  if (response.latency_ms && response.latency_ms > 10000) {
    score -= 0.2;
  }

  // Penalize very short responses (likely incomplete)
  if (response.tokens && response.tokens.completion < 10) {
    score -= 0.3;
  }

  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

/**
 * Determine if response should be flagged for review
 */
export function shouldFlagForReview(
  qualityScore: number,
  response: AIResponse
): boolean {
  // Flag if quality score is below threshold
  if (qualityScore < 0.5) return true;

  // Flag if there was an error
  if (!response.success) return true;

  // Flag if latency is very high (>30 seconds)
  if (response.latency_ms && response.latency_ms > 30000) return true;

  return false;
}

// ============================================
// Logging Functions
// ============================================

/**
 * Log an AI request/response
 */
export async function logAIUsage(
  request: AIRequest,
  response: AIResponse
): Promise<{ success: boolean; log_id?: string; error?: string }> {
  try {
    const startTime = Date.now();

    // Calculate cost if tokens are provided
    const cost = response.tokens
      ? calculateCost(
          request.provider,
          request.model,
          response.tokens.prompt,
          response.tokens.completion
        )
      : response.cost_usd || 0;

    // Calculate quality score
    const qualityScore = calculateQualityScore(response, request);

    // Determine if should be flagged
    const flagged = shouldFlagForReview(qualityScore, response);

    // Build log entry
    const logEntry: AIUsageLog = {
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      feature_type: request.feature_type,
      provider: request.provider,
      model: request.model,
      prompt_tokens: response.tokens?.prompt,
      completion_tokens: response.tokens?.completion,
      total_tokens: response.tokens?.total,
      cost_usd: cost,
      latency_ms: response.latency_ms,
      status: response.success ? 'success' : 'error',
      error_message: response.error,
      error_code: response.error_code,
      quality_score: qualityScore,
      flagged_for_review: flagged,
      prompt_version: request.prompt_version,
      request_metadata: request.metadata,
      response_metadata: {
        logged_at: new Date().toISOString(),
        log_latency_ms: Date.now() - startTime,
      },
    };

    // Insert into database
    const { data, error } = await supabase
      .from('ai_usage_logs')
      .insert(logEntry)
      .select('id')
      .single();

    if (error) {
      console.error('Failed to log AI usage:', error);
      return { success: false, error: error.message };
    }

    // Update budget if applicable
    if (cost > 0) {
      await updateBudgetUsage(request.feature_type, request.provider, cost, response.tokens?.total || 0);
    }

    return { success: true, log_id: data.id };
  } catch (error: any) {
    console.error('Error logging AI usage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update budget usage in real-time
 */
async function updateBudgetUsage(
  featureType: string,
  provider: string,
  cost: number,
  tokens: number
): Promise<void> {
  try {
    // Get active budgets that apply to this request
    const { data: budgets, error } = await supabase
      .from('ai_budgets')
      .select('*')
      .eq('is_active', true)
      .lte('period_start', new Date().toISOString().split('T')[0])
      .gte('period_end', new Date().toISOString().split('T')[0]);

    if (error || !budgets) return;

    // Update each applicable budget
    for (const budget of budgets) {
      // Check if budget applies to this request
      const appliesToFeature =
        !budget.feature_types ||
        budget.feature_types.length === 0 ||
        budget.feature_types.includes(featureType);

      const appliesToProvider =
        !budget.providers ||
        budget.providers.length === 0 ||
        budget.providers.includes(provider);

      if (appliesToFeature && appliesToProvider) {
        const newSpend = Number(budget.current_spend_usd) + cost;
        const newTokens = Number(budget.current_tokens) + tokens;
        const newRequests = Number(budget.current_requests) + 1;

        // Check if threshold reached
        const thresholdAmount = (Number(budget.budget_usd) * budget.alert_threshold_percent) / 100;
        const alertSent = newSpend >= thresholdAmount;
        const limitReached = newSpend >= Number(budget.budget_usd);

        await supabase
          .from('ai_budgets')
          .update({
            current_spend_usd: newSpend,
            current_tokens: newTokens,
            current_requests: newRequests,
            alert_sent: alertSent || budget.alert_sent,
            alert_sent_at: alertSent && !budget.alert_sent ? new Date().toISOString() : budget.alert_sent_at,
            limit_reached: limitReached,
            limit_reached_at: limitReached && !budget.limit_reached ? new Date().toISOString() : budget.limit_reached_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);

        // TODO: Send alert notification if threshold reached
        if (alertSent && !budget.alert_sent) {
          console.warn(`Budget alert: ${budget.name} has reached ${budget.alert_threshold_percent}% of budget`);
        }

        // TODO: Block requests if hard limit reached
        if (limitReached && budget.hard_limit) {
          console.error(`Budget limit reached: ${budget.name} - AI requests may be blocked`);
        }
      }
    }
  } catch (error) {
    console.error('Error updating budget usage:', error);
  }
}

/**
 * Check if request is allowed based on budgets
 */
export async function checkBudgetLimit(
  featureType: string,
  provider: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data: budgets, error } = await supabase
      .from('ai_budgets')
      .select('*')
      .eq('is_active', true)
      .eq('hard_limit', true)
      .eq('limit_reached', true)
      .lte('period_start', new Date().toISOString().split('T')[0])
      .gte('period_end', new Date().toISOString().split('T')[0]);

    if (error || !budgets || budgets.length === 0) {
      return { allowed: true };
    }

    // Check if any budget with hard limit applies to this request
    for (const budget of budgets) {
      const appliesToFeature =
        !budget.feature_types ||
        budget.feature_types.length === 0 ||
        budget.feature_types.includes(featureType);

      const appliesToProvider =
        !budget.providers ||
        budget.providers.length === 0 ||
        budget.providers.includes(provider);

      if (appliesToFeature && appliesToProvider) {
        return {
          allowed: false,
          reason: `Budget limit reached for ${budget.name}`,
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking budget limit:', error);
    return { allowed: true }; // Allow on error to avoid blocking
  }
}

// ============================================
// Wrapper Function
// ============================================

/**
 * Wrap an AI API call with logging
 */
export async function withAILogging<T>(
  request: AIRequest,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    // Check budget limit
    const budgetCheck = await checkBudgetLimit(request.feature_type, request.provider);
    if (!budgetCheck.allowed) {
      throw new Error(budgetCheck.reason || 'Budget limit reached');
    }

    // Execute API call
    const result = await apiCall();

    // Log success
    const latency = Date.now() - startTime;
    await logAIUsage(request, {
      success: true,
      data: result,
      latency_ms: latency,
      // Note: Tokens and cost should be extracted from result if available
    });

    return result;
  } catch (error: any) {
    // Log error
    const latency = Date.now() - startTime;
    await logAIUsage(request, {
      success: false,
      error: error.message,
      error_code: error.code,
      latency_ms: latency,
    });

    throw error;
  }
}

export default {
  logAIUsage,
  checkBudgetLimit,
  withAILogging,
  calculateCost,
  calculateQualityScore,
  shouldFlagForReview,
  getAvailableProviders,
  getAvailableModels,
  isProviderSupported,
};
