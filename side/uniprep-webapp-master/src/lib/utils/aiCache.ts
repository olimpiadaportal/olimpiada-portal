/**
 * AI Cache Utility
 * localStorage-based caching for AI responses
 * Matches mobile app AsyncStorage implementation
 */

import { CacheEntry, CacheConfig } from '@/types/ai'

class AICache {
  private readonly prefix = 'ai_cache_'

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key
      const item = localStorage.getItem(fullKey)
      
      if (!item) {
        return null
      }

      const entry: CacheEntry<T> = JSON.parse(item)
      
      // Check if expired
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        await this.remove(key)
        return null
      }

      return entry.data
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  /**
   * Set cached data
   */
  async set<T>(key: string, data: T, config?: CacheConfig): Promise<void> {
    try {
      const fullKey = this.prefix + key
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: config?.ttl,
      }

      localStorage.setItem(fullKey, JSON.stringify(entry))
    } catch (error) {
      console.error('Cache set error:', error)
      // If quota exceeded, clear old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        await this.clearOldest()
        // Try again
        try {
          const fullKey = this.prefix + key
          const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: config?.ttl,
          }
          localStorage.setItem(fullKey, JSON.stringify(entry))
        } catch (retryError) {
          console.error('Cache set retry error:', retryError)
        }
      }
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const data = await this.get(key)
    return data !== null
  }

  /**
   * Remove cached data
   */
  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key
      localStorage.removeItem(fullKey)
    } catch (error) {
      console.error('Cache remove error:', error)
    }
  }

  /**
   * Clear all AI cache
   */
  async clearAll(): Promise<void> {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.error('Cache clear error:', error)
    }
  }

  /**
   * Clear oldest entries (when quota exceeded)
   */
  private async clearOldest(): Promise<void> {
    try {
      const entries: Array<{ key: string; timestamp: number }> = []
      
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          try {
            const item = localStorage.getItem(key)
            if (item) {
              const entry = JSON.parse(item)
              entries.push({ key, timestamp: entry.timestamp || 0 })
            }
          } catch (e) {
            // Invalid entry, remove it
            localStorage.removeItem(key)
          }
        }
      })

      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp)

      // Remove oldest 25%
      const removeCount = Math.ceil(entries.length * 0.25)
      for (let i = 0; i < removeCount; i++) {
        localStorage.removeItem(entries[i].key)
      }
    } catch (error) {
      console.error('Clear oldest error:', error)
    }
  }

  /**
   * Get cache size info
   */
  async getSize(): Promise<{ count: number; sizeKB: number }> {
    try {
      let count = 0
      let totalSize = 0

      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          count++
          const item = localStorage.getItem(key)
          if (item) {
            totalSize += item.length
          }
        }
      })

      return {
        count,
        sizeKB: Math.round(totalSize / 1024),
      }
    } catch (error) {
      console.error('Get size error:', error)
      return { count: 0, sizeKB: 0 }
    }
  }
}

// Cache key generators
export const CacheKeys = {
  explanation: (questionId: string, studentAnswer: string) =>
    `explanation_${questionId}_${studentAnswer.toLowerCase().replace(/\s/g, '')}`,
  
  insights: (userId: string, timeframe: string) =>
    `insights_${userId}_${timeframe}`,
  
  competitiveSession: (userId: string, subjectId: string) =>
    `competitive_${userId}_${subjectId}`,
  
  situasiyaGrading: (questionId: string, studentAnswer: string) =>
    `situasiya_${questionId}_${studentAnswer.toLowerCase().replace(/\s/g, '')}`,
}

// Export singleton instance
export const aiCache = new AICache()
