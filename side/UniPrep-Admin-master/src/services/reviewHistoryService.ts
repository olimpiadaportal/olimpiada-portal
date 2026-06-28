import { supabaseAdmin } from '@/lib/supabase';

export interface ReviewHistoryItem {
  id: string;
  usage_log_id: string;
  reviewer_id: string;
  review_status: 'approved' | 'rejected' | 'needs_work';
  accuracy_score?: number;
  relevance_score?: number;
  coherence_score?: number;
  safety_score?: number;
  overall_score?: number;
  feedback?: string;
  issues?: string[];
  strengths?: string[];
  action_taken?: string;
  action_details?: string;
  created_at: string;
  updated_at: string;
  // Joined data from ai_usage_logs
  feature_type?: string;
  provider?: string;
  model?: string;
  quality_score?: number;
  cost_usd?: number;
  // Reviewer info
  reviewer_email?: string;
  reviewer_name?: string;
}

export interface ReviewHistoryStats {
  total_reviews: number;
  approved_count: number;
  rejected_count: number;
  needs_work_count: number;
  approval_rate: number;
  avg_overall_score: number;
  avg_accuracy_score: number;
  avg_relevance_score: number;
  avg_coherence_score: number;
  avg_safety_score: number;
  most_reviewed_feature: string;
  total_issues_found: number;
  total_strengths_noted: number;
}

export interface ReviewerStats {
  reviewer_id: string;
  reviewer_email: string;
  reviewer_name: string;
  total_reviews: number;
  approved: number;
  rejected: number;
  avg_score: number;
}

/**
 * Get review history with optional filters
 */
export async function getReviewHistory(
  filters?: {
    reviewerId?: string;
    reviewStatus?: string;
    featureType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<{ success: boolean; data?: ReviewHistoryItem[]; error?: string }> {
  try {
    let query = supabaseAdmin
      .from('ai_quality_reviews')
      .select(`
        *,
        ai_usage_logs(
          feature_type,
          provider,
          model,
          quality_score,
          cost_usd
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.reviewerId) {
      query = query.eq('reviewer_id', filters.reviewerId);
    }

    if (filters?.reviewStatus) {
      query = query.eq('review_status', filters.reviewStatus);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching review history:', error);
      return { success: false, error: error.message };
    }

    // Transform the data to flatten nested objects
    const transformedData = data?.map((review: any) => ({
      ...review,
      feature_type: review.ai_usage_logs?.feature_type,
      provider: review.ai_usage_logs?.provider,
      model: review.ai_usage_logs?.model,
      quality_score: review.ai_usage_logs?.quality_score,
      cost_usd: review.ai_usage_logs?.cost_usd,
      reviewer_email: 'Admin User', // Placeholder - profiles table not linked
      reviewer_name: 'Admin User',
    }));

    return { success: true, data: transformedData };
  } catch (error) {
    console.error('Error in getReviewHistory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get review history statistics
 */
export async function getReviewHistoryStats(
  filters?: {
    reviewerId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ success: boolean; data?: ReviewHistoryStats; error?: string }> {
  try {
    let query = supabaseAdmin
      .from('ai_quality_reviews')
      .select(`
        review_status,
        overall_score,
        accuracy_score,
        relevance_score,
        coherence_score,
        safety_score,
        issues,
        strengths,
        ai_usage_logs(feature_type)
      `);

    if (filters?.reviewerId) {
      query = query.eq('reviewer_id', filters.reviewerId);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching review stats:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        data: {
          total_reviews: 0,
          approved_count: 0,
          rejected_count: 0,
          needs_work_count: 0,
          approval_rate: 0,
          avg_overall_score: 0,
          avg_accuracy_score: 0,
          avg_relevance_score: 0,
          avg_coherence_score: 0,
          avg_safety_score: 0,
          most_reviewed_feature: 'N/A',
          total_issues_found: 0,
          total_strengths_noted: 0,
        },
      };
    }

    // Calculate statistics
    const total_reviews = data.length;
    const approved_count = data.filter((r: any) => r.review_status === 'approved').length;
    const rejected_count = data.filter((r: any) => r.review_status === 'rejected').length;
    const needs_work_count = data.filter((r: any) => r.review_status === 'needs_work').length;
    const approval_rate = total_reviews > 0 ? (approved_count / total_reviews) * 100 : 0;

    // Calculate average scores
    const scoresWithValues = data.filter((r: any) => r.overall_score !== null);
    const avg_overall_score =
      scoresWithValues.length > 0
        ? scoresWithValues.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) /
          scoresWithValues.length
        : 0;

    const accuracyScores = data.filter((r: any) => r.accuracy_score !== null);
    const avg_accuracy_score =
      accuracyScores.length > 0
        ? accuracyScores.reduce((sum: number, r: any) => sum + (r.accuracy_score || 0), 0) /
          accuracyScores.length
        : 0;

    const relevanceScores = data.filter((r: any) => r.relevance_score !== null);
    const avg_relevance_score =
      relevanceScores.length > 0
        ? relevanceScores.reduce((sum: number, r: any) => sum + (r.relevance_score || 0), 0) /
          relevanceScores.length
        : 0;

    const coherenceScores = data.filter((r: any) => r.coherence_score !== null);
    const avg_coherence_score =
      coherenceScores.length > 0
        ? coherenceScores.reduce((sum: number, r: any) => sum + (r.coherence_score || 0), 0) /
          coherenceScores.length
        : 0;

    const safetyScores = data.filter((r: any) => r.safety_score !== null);
    const avg_safety_score =
      safetyScores.length > 0
        ? safetyScores.reduce((sum: number, r: any) => sum + (r.safety_score || 0), 0) /
          safetyScores.length
        : 0;

    // Find most reviewed feature
    const featureCounts: Record<string, number> = {};
    data.forEach((r: any) => {
      const feature = r.ai_usage_logs?.feature_type || 'unknown';
      featureCounts[feature] = (featureCounts[feature] || 0) + 1;
    });
    const most_reviewed_feature =
      Object.keys(featureCounts).length > 0
        ? Object.entries(featureCounts).sort((a, b) => b[1] - a[1])[0][0]
        : 'N/A';

    // Count issues and strengths
    const total_issues_found = data.reduce(
      (sum: number, r: any) => sum + (r.issues?.length || 0),
      0
    );
    const total_strengths_noted = data.reduce(
      (sum: number, r: any) => sum + (r.strengths?.length || 0),
      0
    );

    const stats: ReviewHistoryStats = {
      total_reviews,
      approved_count,
      rejected_count,
      needs_work_count,
      approval_rate,
      avg_overall_score,
      avg_accuracy_score,
      avg_relevance_score,
      avg_coherence_score,
      avg_safety_score,
      most_reviewed_feature,
      total_issues_found,
      total_strengths_noted,
    };

    return { success: true, data: stats };
  } catch (error) {
    console.error('Error in getReviewHistoryStats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get reviewer statistics (all reviewers)
 */
export async function getReviewerStats(
  filters?: {
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{ success: boolean; data?: ReviewerStats[]; error?: string }> {
  try {
    let query = supabaseAdmin
      .from('ai_quality_reviews')
      .select(`
        reviewer_id,
        review_status,
        overall_score
      `);

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reviewer stats:', error);
      return { success: false, error: error.message };
    }

    // Group by reviewer
    const reviewerMap = new Map<string, ReviewerStats>();

    data?.forEach((review: any) => {
      const reviewerId = review.reviewer_id;
      if (!reviewerMap.has(reviewerId)) {
        reviewerMap.set(reviewerId, {
          reviewer_id: reviewerId,
          reviewer_email: 'Admin User',
          reviewer_name: 'Admin User',
          total_reviews: 0,
          approved: 0,
          rejected: 0,
          avg_score: 0,
        });
      }

      const stats = reviewerMap.get(reviewerId)!;
      stats.total_reviews++;
      if (review.review_status === 'approved') stats.approved++;
      if (review.review_status === 'rejected') stats.rejected++;
      if (review.overall_score) {
        stats.avg_score += review.overall_score;
      }
    });

    // Calculate averages
    const reviewerStats = Array.from(reviewerMap.values()).map((stats) => ({
      ...stats,
      avg_score: stats.total_reviews > 0 ? stats.avg_score / stats.total_reviews : 0,
    }));

    // Sort by total reviews
    reviewerStats.sort((a, b) => b.total_reviews - a.total_reviews);

    return { success: true, data: reviewerStats };
  } catch (error) {
    console.error('Error in getReviewerStats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
