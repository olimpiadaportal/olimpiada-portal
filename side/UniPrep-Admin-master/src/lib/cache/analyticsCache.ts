// Analytics Data Cache
// Purpose: Cache analytics queries to reduce database load
// TTL: 5 minutes for most queries, 1 minute for real-time data

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class AnalyticsCache {
  private cache: Map<string, CacheEntry<any>>;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly REALTIME_TTL = 1 * 60 * 1000; // 1 minute

  constructor() {
    this.cache = new Map();
    
    // Clean up expired entries every minute
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  /**
   * Generate cache key from query parameters
   */
  private generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache data with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    });
  }

  /**
   * Get or fetch data with caching
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetchFn();
    
    // Cache the result
    this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching prefix
   */
  invalidatePrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }

    return {
      total: this.cache.size,
      valid: validEntries,
      expired: expiredEntries,
      hitRate: 0 // TODO: Track hits/misses
    };
  }

  /**
   * Helper methods for common cache keys
   */
  
  // Engagement metrics cache key
  engagementKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('engagement', dateRange);
  }

  // Performance metrics cache key
  performanceKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('performance', dateRange);
  }

  // Exam analytics cache key
  examAnalyticsKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('exam_analytics', dateRange);
  }

  // Question performance cache key
  questionPerformanceKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('question_performance', dateRange);
  }

  // Student segments cache key
  studentSegmentsKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('student_segments', dateRange);
  }

  // Content quality cache key
  contentQualityKey(dateRange: { startDate: string; endDate: string }): string {
    return this.generateKey('content_quality', dateRange);
  }

  // System metrics cache key (shorter TTL for real-time data)
  systemMetricsKey(): string {
    return 'system_metrics:current';
  }

  // Get TTL for different data types
  getTTL(type: 'default' | 'realtime' | 'long'): number {
    switch (type) {
      case 'realtime':
        return this.REALTIME_TTL;
      case 'long':
        return 15 * 60 * 1000; // 15 minutes
      case 'default':
      default:
        return this.DEFAULT_TTL;
    }
  }
}

// Export singleton instance
export const analyticsCache = new AnalyticsCache();

// Export helper function for React components
export function useCachedAnalytics() {
  return {
    cache: analyticsCache,
    invalidateAll: () => analyticsCache.clear(),
    invalidateEngagement: () => analyticsCache.invalidatePrefix('engagement'),
    invalidatePerformance: () => analyticsCache.invalidatePrefix('performance'),
    invalidateExams: () => analyticsCache.invalidatePrefix('exam'),
    invalidateQuestions: () => analyticsCache.invalidatePrefix('question'),
    invalidateStudents: () => analyticsCache.invalidatePrefix('student'),
    invalidateSystem: () => analyticsCache.invalidate('system_metrics:current')
  };
}
