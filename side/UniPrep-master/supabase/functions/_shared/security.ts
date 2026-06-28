// ============================================
// SHARED SECURITY UTILITIES FOR EDGE FUNCTIONS
// ============================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Known prompt injection patterns to strip from user input
const INJECTION_PATTERNS = [
  /^(IGNORE|SYSTEM|INSTRUCTION|NEW ROLE|ASSISTANT|OVERRIDE)\s*:/im,
  /forget (all )?(previous|prior|above) instructions/i,
  /you are now/i,
  /disregard (all )?(previous|prior|above)/i,
  /pretend you are/i,
  /act as (a |an )?/i,
  /ignore (all )?(previous|prior|above|the) (instructions|rules|constraints)/i,
  /do not follow/i,
  /new (instructions|rules|task)\s*:/i,
];

/**
 * Sanitize user-provided text before embedding in AI prompts.
 * Truncates to maxLength, strips null bytes, and removes known injection patterns.
 */
export function sanitizeUserInput(text: string, maxLength: number): string {
  if (!text || typeof text !== 'string') return '';

  // Strip null bytes
  let cleaned = text.replace(/\0/g, '');

  // Truncate to max length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }

  // Strip lines that match known injection patterns
  const lines = cleaned.split('\n');
  const safeLines = lines.filter(line => {
    const trimmed = line.trim();
    return !INJECTION_PATTERNS.some(pattern => pattern.test(trimmed));
  });

  return safeLines.join('\n').trim();
}

/**
 * Check per-user rate limit using ai_usage_logs table.
 * Returns { allowed, remaining } based on request count within the time window.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  featureType: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature_type', featureType)
      .gte('created_at', windowStart);

    if (error) {
      // On error, allow the request (fail-open for rate limiting)
      console.error('Rate limit check failed:', error.message);
      return { allowed: true, remaining: maxRequests };
    }

    const used = count || 0;
    return {
      allowed: used < maxRequests,
      remaining: Math.max(0, maxRequests - used),
    };
  } catch {
    // Fail-open
    return { allowed: true, remaining: maxRequests };
  }
}

/**
 * Return a safe, generic error response that never leaks internal details.
 */
export function safeErrorResponse(
  corsHeaders: Record<string, string>,
  statusCode: number = 500
): Response {
  return new Response(
    JSON.stringify({
      error: 'ServiceUnavailable',
      message: 'AI service temporarily unavailable. Please try again later.',
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: statusCode,
    }
  );
}

/**
 * Return a 429 rate limit exceeded response.
 */
export function rateLimitResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: 'RateLimitExceeded',
      message: 'Too many requests. Please wait a few minutes and try again.',
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 429,
    }
  );
}

/**
 * Verify that the authenticated user owns a mock exam attempt.
 * mock_exam_attempts.user_id references auth.users(id) directly — no student_id column.
 * Returns true if the attempt belongs to the user, false otherwise.
 */
export async function verifyAttemptOwnership(
  supabase: SupabaseClient,
  attemptId: string,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('mock_exam_attempts')
      .select('user_id')
      .eq('id', attemptId)
      .single();

    if (error || !data) return false;

    return data.user_id === userId;
  } catch {
    return false;
  }
}
