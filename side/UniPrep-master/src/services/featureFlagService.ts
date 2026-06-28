// Feature Flag Service
// Stage 6 - Phase 3: Mobile App Integration
// Handles feature flag evaluation and gradual rollouts

import { supabase } from './supabase';
import { systemSettingsService } from './systemSettingsService';

export interface FeatureFlag {
  flag_name: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  rollout_percentage: number;
  target_groups: string[];
}

class FeatureFlagService {
  private flagCache: Map<string, boolean> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a feature flag is enabled for the current user
   * Uses cached system settings for fast evaluation
   */
  async isEnabled(
    flagName: string,
    userId?: string,
    userGroup?: string
  ): Promise<boolean> {
    try {
      // Check cache first
      if (this.isCacheValid() && this.flagCache.has(flagName)) {
        return this.flagCache.get(flagName)!;
      }

      // Get from system settings (which includes feature flags)
      const settings = await systemSettingsService.getSettings();
      if (!settings || !settings.feature_flags) {
        console.warn(`Feature flags not available, defaulting ${flagName} to false`);
        return false;
      }

      // Simple check: is flag enabled in settings?
      const isEnabled = settings.feature_flags[flagName] === true;

      // Cache the result
      this.flagCache.set(flagName, isEnabled);
      this.lastCacheUpdate = Date.now();

      return isEnabled;
    } catch (error) {
      console.error(`Error checking feature flag ${flagName}:`, error);
      // Fail open: return false if error
      return false;
    }
  }

  /**
   * Get detailed feature flag information
   * Fetches from database for admin/debugging purposes
   */
  async getFlag(flagName: string): Promise<FeatureFlag | null> {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('flag_name', flagName)
        .single();

      if (error) {
        console.error(`Error fetching flag ${flagName}:`, error);
        return null;
      }

      return data as FeatureFlag;
    } catch (error) {
      console.error(`Error in getFlag ${flagName}:`, error);
      return null;
    }
  }

  /**
   * Get all feature flags
   * For debugging/admin purposes
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('flag_name');

      if (error) {
        console.error('Error fetching all flags:', error);
        return [];
      }

      return data as FeatureFlag[];
    } catch (error) {
      console.error('Error in getAllFlags:', error);
      return [];
    }
  }

  /**
   * Check multiple flags at once
   * Returns a map of flag_name -> enabled status
   */
  async checkFlags(flagNames: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const flagName of flagNames) {
      const enabled = await this.isEnabled(flagName);
      results.set(flagName, enabled);
    }

    return results;
  }

  /**
   * Clear flag cache
   * Forces fresh fetch on next check
   */
  clearCache(): void {
    this.flagCache.clear();
    this.lastCacheUpdate = 0;
    console.log('🗑️ Feature flag cache cleared');
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    const now = Date.now();
    return (now - this.lastCacheUpdate) < this.CACHE_TTL;
  }

  /**
   * Evaluate rollout percentage
   * Uses consistent hashing to ensure same user always gets same result
   */
  private evaluateRollout(
    userId: string,
    rolloutPercentage: number
  ): boolean {
    if (rolloutPercentage >= 100) return true;
    if (rolloutPercentage <= 0) return false;

    // Simple hash function for consistent user bucketing
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    const bucket = Math.abs(hash) % 100;
    return bucket < rolloutPercentage;
  }

  /**
   * Check if user is in target group
   */
  private isInTargetGroup(userGroup: string, targetGroups: string[]): boolean {
    if (targetGroups.length === 0) return true; // No targeting = everyone
    return targetGroups.includes(userGroup);
  }

  // ============================================
  // CONVENIENCE METHODS FOR COMMON FLAGS
  // ============================================

  async isDarkModeEnabled(): Promise<boolean> {
    return await this.isEnabled('dark_mode');
  }

  async isCompetitiveModeEnabled(): Promise<boolean> {
    return await this.isEnabled('competitive_mode');
  }

  async isAIInsightsEnabled(): Promise<boolean> {
    return await this.isEnabled('ai_insights');
  }

  async isAIExplanationsEnabled(): Promise<boolean> {
    return await this.isEnabled('ai_explanations');
  }

  async isAIGenerateQuestionsEnabled(): Promise<boolean> {
    return await this.isEnabled('ai_generate_questions');
  }

  async isTeacherMarketplaceEnabled(): Promise<boolean> {
    return await this.isEnabled('teacher_marketplace');
  }

  async isLeaderboardsEnabled(): Promise<boolean> {
    return await this.isEnabled('leaderboards');
  }

  async isInAppPurchasesEnabled(): Promise<boolean> {
    return await this.isEnabled('in_app_purchases');
  }
}

export const featureFlagService = new FeatureFlagService();
