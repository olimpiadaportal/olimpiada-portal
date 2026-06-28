/**
 * AI Quality Scoring Utility
 * Stage 5.5 - Quality Assurance Integration
 * 
 * Calculates quality scores for AI responses
 */

export interface QualityScoreParams {
  status: string;
  latency_ms: number;
  cost_usd: number;
  error_message?: string | null;
  total_tokens?: number;
}

export interface QualityScoreResult {
  quality_score: number; // 0.00 to 1.00
  flagged_for_review: boolean;
  review_status: string | null;
}

/**
 * Calculate quality score for AI response
 * 
 * Scoring criteria:
 * - Success: +0.30 (response succeeded)
 * - Low latency: +0.20 (< 2 seconds)
 * - Reasonable cost: +0.20 (< $0.01 per request)
 * - No errors: +0.30 (no error messages)
 * 
 * Total: 0.00 to 1.00
 */
export function calculateQualityScore(params: QualityScoreParams): QualityScoreResult {
  let score = 0;

  // 1. Success status (30%)
  if (params.status === 'success') {
    score += 0.30;
  }

  // 2. Low latency (20%)
  // < 2 seconds = full points
  // 2-5 seconds = partial points
  // > 5 seconds = no points
  if (params.latency_ms < 2000) {
    score += 0.20;
  } else if (params.latency_ms < 5000) {
    score += 0.10;
  }

  // 3. Reasonable cost (20%)
  // < $0.01 = full points
  // $0.01-$0.05 = partial points
  // > $0.05 = no points
  if (params.cost_usd < 0.01) {
    score += 0.20;
  } else if (params.cost_usd < 0.05) {
    score += 0.10;
  }

  // 4. No errors (30%)
  if (!params.error_message) {
    score += 0.30;
  }

  // Ensure score is between 0 and 1
  score = Math.max(0, Math.min(1, score));

  // Auto-flag for review if score < 0.50 (50%)
  const flagged_for_review = score < 0.50;
  const review_status = flagged_for_review ? 'pending' : null;

  return {
    quality_score: Number(score.toFixed(2)),
    flagged_for_review,
    review_status,
  };
}

/**
 * Calculate quality score for error responses
 */
export function calculateErrorQualityScore(
  error_message: string,
  latency_ms: number
): QualityScoreResult {
  return calculateQualityScore({
    status: 'error',
    latency_ms,
    cost_usd: 0,
    error_message,
  });
}

/**
 * Thresholds for quality scoring
 */
export const QUALITY_THRESHOLDS = {
  EXCELLENT: 0.80, // 80%+
  GOOD: 0.60, // 60-79%
  POOR: 0.50, // 50-59%
  FLAG_THRESHOLD: 0.50, // Auto-flag below 50%
  
  MAX_LATENCY_MS: 2000, // 2 seconds
  MAX_COST_USD: 0.01, // $0.01
  
  LATENCY_WARNING_MS: 5000, // 5 seconds
  COST_WARNING_USD: 0.05, // $0.05
};

/**
 * Get quality score description
 */
export function getQualityDescription(score: number): string {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) {
    return 'Excellent';
  } else if (score >= QUALITY_THRESHOLDS.GOOD) {
    return 'Good';
  } else if (score >= QUALITY_THRESHOLDS.POOR) {
    return 'Poor';
  } else {
    return 'Needs Review';
  }
}

/**
 * Get quality score color for UI
 */
export function getQualityColor(score: number): string {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) {
    return 'green';
  } else if (score >= QUALITY_THRESHOLDS.GOOD) {
    return 'yellow';
  } else {
    return 'red';
  }
}
