/**
 * AI Cache Utility
 * 
 * Provides client-side caching for AI-related data using AsyncStorage.
 * Implements TTL (Time To Live) and cache invalidation strategies.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CacheEntry } from '../types/ai';

const CACHE_PREFIX = '@uniprep_ai_cache:';

// Default TTL: 6 hours (matches backend cache)
const DEFAULT_TTL = 6 * 60 * 60 * 1000;

/**
 * Cache Manager Class
 */
class AICacheManager {
  /**
   * Get data from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const cached = await AsyncStorage.getItem(cacheKey);

      if (!cached) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        await this.remove(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set data in cache with TTL
   */
  async set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl,
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Remove data from cache
   */
  async remove(key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('Cache remove error:', error);
    }
  }

  /**
   * Clear all AI cache
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const aiCacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(aiCacheKeys);
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Check if cache entry exists and is valid
   */
  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  /**
   * Get cache metadata (timestamp, expiry)
   */
  async getMetadata(key: string): Promise<{ timestamp: number; expiresAt: number } | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const cached = await AsyncStorage.getItem(cacheKey);

      if (!cached) {
        return null;
      }

      const entry: CacheEntry<any> = JSON.parse(cached);
      return {
        timestamp: entry.timestamp,
        expiresAt: entry.expiresAt,
      };
    } catch (error) {
      console.error('Cache metadata error:', error);
      return null;
    }
  }

  /**
   * Get remaining TTL in milliseconds
   */
  async getRemainingTTL(key: string): Promise<number> {
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      return 0;
    }

    const remaining = metadata.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Check if cache is expired
   */
  async isExpired(key: string): Promise<boolean> {
    const metadata = await this.getMetadata(key);
    if (!metadata) {
      return true;
    }

    return Date.now() > metadata.expiresAt;
  }

  /**
   * Get cache key with prefix
   */
  private getCacheKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }
}

// Export singleton instance
export const aiCache = new AICacheManager();

// Export cache key generators for consistency
export const CacheKeys = {
  insights: (studentId: string) => `insights:${studentId}`,
  explanation: (questionId: string, answer: string) => `explanation:${questionId}:${answer}`,
  session: (sessionId: string) => `session:${sessionId}`,
  weakTopics: (studentId: string, subjectId: string) => `weak_topics:${studentId}:${subjectId}`,
};
