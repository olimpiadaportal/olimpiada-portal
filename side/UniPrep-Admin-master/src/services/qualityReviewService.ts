/**
 * Quality Review Service
 * Stage 5.5 - Phase 4: Quality Assurance System
 * 
 * Manages AI quality reviews and assessments
 * Harmonized with mobile app's ai_usage_logs structure
 */

import { supabaseAdmin } from '@/lib/supabase';

// ============================================
// Types
// ============================================

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
  user_id?: string;
  prompt_text?: string;
  response_text?: string;
  total_tokens?: number;
  cost_usd?: number;
}

export interface QualityReview {
  id: string;
  usage_log_id: string;
  reviewer_id: string;
  review_status: 'approved' | 'rejected' | 'needs_improvement' | 'flagged';
  accuracy_score?: number; // 1-5
  relevance_score?: number; // 1-5
  coherence_score?: number; // 1-5
  safety_score?: number; // 1-5
  overall_score?: number; // 0.00-1.00
  feedback?: string;
  issues?: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  strengths?: Array<{ aspect: string; description: string }>;
  action_taken?: string;
  action_details?: any;
  created_at: string;
  updated_at: string;
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
}

export interface SubmitReviewParams {
  usageLogId: string;
  reviewerId: string;
  reviewStatus: 'approved' | 'rejected' | 'needs_improvement' | 'flagged';
  accuracyScore?: number;
  relevanceScore?: number;
  coherenceScore?: number;
  safetyScore?: number;
  feedback?: string;
  issues?: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  strengths?: Array<{ aspect: string; description: string }>;
  actionTaken?: string;
  actionDetails?: any;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get review queue items
 * Fetches AI usage logs flagged for review
 */
export async function getReviewQueue(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
  limit: number = 20
): Promise<{ success: boolean; data?: ReviewQueueItem[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_ai_review_queue', {
      p_status: status,
      p_limit: limit,
    });

    if (error) {
      console.error('Error fetching review queue:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error in getReviewQueue:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get quality metrics
 * Fetches quality statistics and trends
 */
export async function getQualityMetrics(
  startDate?: Date,
  endDate?: Date,
  featureType?: string
): Promise<{ success: boolean; data?: QualityMetrics; error?: string }> {
  try {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const { data, error } = await supabaseAdmin.rpc('get_ai_quality_metrics', {
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
      p_feature_type: featureType || null,
    });

    if (error) {
      console.error('Error fetching quality metrics:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as QualityMetrics };
  } catch (error) {
    console.error('Error in getQualityMetrics:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get usage log details
 * Fetches full details of a specific AI usage log for review
 */
export async function getUsageLogDetails(
  logId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error) {
      console.error('Error fetching usage log details:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in getUsageLogDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Submit quality review
 * Creates or updates a quality review for an AI usage log
 */
export async function submitReview(
  params: SubmitReviewParams
): Promise<{ success: boolean; data?: QualityReview; error?: string }> {
  try {
    // Calculate overall score from individual scores
    const scores = [
      params.accuracyScore,
      params.relevanceScore,
      params.coherenceScore,
      params.safetyScore,
    ].filter((score) => score !== undefined) as number[];

    const overallScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length / 5 // Normalize to 0-1
        : undefined;

    // Check if review already exists
    const { data: existingReview } = await supabaseAdmin
      .from('ai_quality_reviews')
      .select('id')
      .eq('usage_log_id', params.usageLogId)
      .single();

    let result;

    if (existingReview) {
      // Update existing review
      result = await supabaseAdmin
        .from('ai_quality_reviews')
        .update({
          reviewer_id: params.reviewerId,
          review_status: params.reviewStatus,
          accuracy_score: params.accuracyScore,
          relevance_score: params.relevanceScore,
          coherence_score: params.coherenceScore,
          safety_score: params.safetyScore,
          overall_score: overallScore,
          feedback: params.feedback,
          issues: params.issues || [],
          strengths: params.strengths || [],
          action_taken: params.actionTaken,
          action_details: params.actionDetails,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id)
        .select()
        .single();
    } else {
      // Create new review
      result = await supabaseAdmin
        .from('ai_quality_reviews')
        .insert({
          usage_log_id: params.usageLogId,
          reviewer_id: params.reviewerId,
          review_status: params.reviewStatus,
          accuracy_score: params.accuracyScore,
          relevance_score: params.relevanceScore,
          coherence_score: params.coherenceScore,
          safety_score: params.safetyScore,
          overall_score: overallScore,
          feedback: params.feedback,
          issues: params.issues || [],
          strengths: params.strengths || [],
          action_taken: params.actionTaken,
          action_details: params.actionDetails,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error submitting review:', result.error);
      return { success: false, error: result.error.message };
    }

    // Update the usage log's review status
    await supabaseAdmin
      .from('ai_usage_logs')
      .update({
        review_status: params.reviewStatus,
      })
      .eq('id', params.usageLogId);

    return { success: true, data: result.data as QualityReview };
  } catch (error) {
    console.error('Error in submitReview:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get review history for a specific usage log
 */
export async function getReviewHistory(
  usageLogId: string
): Promise<{ success: boolean; data?: QualityReview[]; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_quality_reviews')
      .select('*')
      .eq('usage_log_id', usageLogId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching review history:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as QualityReview[] };
  } catch (error) {
    console.error('Error in getReviewHistory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Bulk update review status
 * Useful for approving/rejecting multiple items at once
 */
export async function bulkUpdateReviewStatus(
  logIds: string[],
  status: 'approved' | 'rejected',
  reviewerId: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    // Update usage logs
    const { error: updateError } = await supabaseAdmin
      .from('ai_usage_logs')
      .update({ review_status: status })
      .in('id', logIds);

    if (updateError) {
      console.error('Error bulk updating review status:', updateError);
      return { success: false, error: updateError.message };
    }

    // Create review records for each
    const reviews = logIds.map((logId) => ({
      usage_log_id: logId,
      reviewer_id: reviewerId,
      review_status: status,
      feedback: `Bulk ${status}`,
    }));

    const { error: insertError, count } = await supabaseAdmin
      .from('ai_quality_reviews')
      .insert(reviews);

    if (insertError) {
      console.error('Error creating bulk reviews:', insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true, count: count || logIds.length };
  } catch (error) {
    console.error('Error in bulkUpdateReviewStatus:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get quality statistics by feature type
 */
export async function getQualityByFeature(
  startDate?: Date,
  endDate?: Date
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const { data, error } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('feature_type, quality_score, review_status')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .not('quality_score', 'is', null);

    if (error) {
      console.error('Error fetching quality by feature:', error);
      return { success: false, error: error.message };
    }

    // Aggregate by feature type
    const featureMap = new Map();
    data?.forEach((log: any) => {
      if (!featureMap.has(log.feature_type)) {
        featureMap.set(log.feature_type, {
          feature_type: log.feature_type,
          total: 0,
          avg_score: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
        });
      }

      const feature = featureMap.get(log.feature_type);
      feature.total++;
      feature.avg_score += log.quality_score;

      if (log.review_status === 'approved') feature.approved++;
      else if (log.review_status === 'rejected') feature.rejected++;
      else feature.pending++;
    });

    // Calculate averages
    const result = Array.from(featureMap.values()).map((feature) => ({
      ...feature,
      avg_score: feature.total > 0 ? feature.avg_score / feature.total : 0,
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('Error in getQualityByFeature:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
