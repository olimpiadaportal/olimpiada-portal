interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Simple in-memory rate limiter with sliding window
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  /**
   * Check if request is allowed
   * @param key Unique identifier (e.g., userId, IP)
   * @param config Rate limit configuration
   * @returns true if allowed, false if rate limited
   */
  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get existing requests for this key
    let timestamps = this.requests.get(key) || [];

    // Remove old requests outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= config.maxRequests) {
      console.warn(`Rate limit exceeded for key: ${key}`);
      return false;
    }

    // Add current request
    timestamps.push(now);
    this.requests.set(key, timestamps);

    return true;
  }

  /**
   * Get remaining requests in current window
   */
  getRemainingRequests(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const timestamps = (this.requests.get(key) || []).filter((ts) => ts > windowStart);
    return Math.max(0, config.maxRequests - timestamps.length);
  }

  /**
   * Get time until next request is allowed (in ms)
   */
  getRetryAfter(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const timestamps = (this.requests.get(key) || []).filter((ts) => ts > windowStart);

    if (timestamps.length < config.maxRequests) {
      return 0; // Can make request now
    }

    // Time until oldest request expires
    const oldestTimestamp = timestamps[0];
    return oldestTimestamp + config.windowMs - now;
  }

  /**
   * Clear all rate limit data for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limit data
   */
  resetAll(): void {
    this.requests.clear();
  }
}

export const rateLimiter = new RateLimiter();

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // AI endpoints - 10 requests per minute
  AI_EXPLAIN: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
  },
  
  // AI insights - 20 requests per minute
  AI_INSIGHTS: {
    maxRequests: 20,
    windowMs: 60000,
  },
  
  // Competitive mode generation - 5 per 5 minutes
  COMPETITIVE_GENERATE: {
    maxRequests: 5,
    windowMs: 300000, // 5 minutes
  },
  
  // Message sending - 30 per minute
  SEND_MESSAGE: {
    maxRequests: 30,
    windowMs: 60000,
  },
  
  // Profile updates - 10 per minute
  PROFILE_UPDATE: {
    maxRequests: 10,
    windowMs: 60000,
  },
};

// Helper functions for specific endpoints
export function checkAIExplainRateLimit(userId: string): boolean {
  return rateLimiter.check(`ai_explain:${userId}`, RATE_LIMITS.AI_EXPLAIN);
}

export function checkAIInsightsRateLimit(userId: string): boolean {
  return rateLimiter.check(`ai_insights:${userId}`, RATE_LIMITS.AI_INSIGHTS);
}

export function checkCompetitiveGenerateRateLimit(userId: string): boolean {
  return rateLimiter.check(`competitive:${userId}`, RATE_LIMITS.COMPETITIVE_GENERATE);
}

export function checkMessageRateLimit(userId: string): boolean {
  return rateLimiter.check(`message:${userId}`, RATE_LIMITS.SEND_MESSAGE);
}

export function checkProfileUpdateRateLimit(userId: string): boolean {
  return rateLimiter.check(`profile:${userId}`, RATE_LIMITS.PROFILE_UPDATE);
}

// Get remaining requests
export function getRemainingAIRequests(userId: string): number {
  return rateLimiter.getRemainingRequests(`ai_explain:${userId}`, RATE_LIMITS.AI_EXPLAIN);
}

export function getRemainingCompetitiveRequests(userId: string): number {
  return rateLimiter.getRemainingRequests(`competitive:${userId}`, RATE_LIMITS.COMPETITIVE_GENERATE);
}
