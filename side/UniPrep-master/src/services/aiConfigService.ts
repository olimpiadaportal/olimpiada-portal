/**
 * AI Configuration Service (Mobile App)
 * 
 * Checks AI system configuration from admin panel
 * Enforces global AI enable/disable, feature flags, and maintenance mode
 */

import { supabase } from './supabase';

export interface AIConfigCheck {
  allowed: boolean;
  message?: string;
  maintenanceMode?: boolean;
}

class AIConfigService {
  private configCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds cache

  /**
   * Check if AI system is globally enabled
   */
  async checkGlobalAIStatus(): Promise<AIConfigCheck> {
    try {
      const config = await this.getConfig('global_settings');
      
      if (!config?.enabled) {
        return {
          allowed: false,
          message: 'AI features are currently unavailable for maintenance. Please try again later.',
          maintenanceMode: true,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Failed to check global AI status:', error);
      // On error, allow (fail open) to prevent blocking users
      return { allowed: true };
    }
  }

  /**
   * Check if a specific AI feature is enabled
   */
  async checkFeatureEnabled(featureName: string): Promise<AIConfigCheck> {
    try {
      // First check global status
      const globalCheck = await this.checkGlobalAIStatus();
      if (!globalCheck.allowed) {
        return globalCheck;
      }

      // Then check feature flag
      const featureFlags = await this.getConfig('feature_flags');
      const feature = featureFlags?.[featureName];

      if (!feature?.enabled) {
        return {
          allowed: false,
          message: `${this.getFeatureDisplayName(featureName)} is currently unavailable. Please try again later.`,
          maintenanceMode: true,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error(`Failed to check feature ${featureName}:`, error);
      // On error, allow (fail open)
      return { allowed: true };
    }
  }

  /**
   * Check emergency mode
   */
  async checkEmergencyMode(): Promise<AIConfigCheck> {
    try {
      const emergencyConfig = await this.getConfig('emergency_controls');
      
      if (emergencyConfig?.emergency_mode) {
        return {
          allowed: false,
          message: emergencyConfig.emergency_message || 'AI services are temporarily unavailable. Please try again later.',
          maintenanceMode: true,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Failed to check emergency mode:', error);
      return { allowed: true };
    }
  }

  /**
   * Comprehensive check for AI feature access
   * Checks: global enable, feature flag, emergency mode
   */
  async checkAIFeatureAccess(featureName: string): Promise<AIConfigCheck> {
    try {
      // 1. Check emergency mode first
      const emergencyCheck = await this.checkEmergencyMode();
      if (!emergencyCheck.allowed) {
        return emergencyCheck;
      }

      // 2. Check global AI status
      const globalCheck = await this.checkGlobalAIStatus();
      if (!globalCheck.allowed) {
        return globalCheck;
      }

      // 3. Check specific feature
      const featureCheck = await this.checkFeatureEnabled(featureName);
      if (!featureCheck.allowed) {
        return featureCheck;
      }

      return { allowed: true };
    } catch (error) {
      console.error('Failed to check AI feature access:', error);
      // On error, allow (fail open) to prevent blocking users
      return { allowed: true };
    }
  }

  /**
   * Get configuration from database with caching
   */
  private async getConfig(configKey: string): Promise<any> {
    // Check cache first
    const cached = this.configCache.get(configKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Fetch from database
    const { data, error } = await supabase
      .from('ai_configuration')
      .select('config_value')
      .eq('config_key', configKey)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error(`Failed to fetch config ${configKey}:`, error);
      return null;
    }

    // Cache the result
    this.configCache.set(configKey, {
      data: data?.config_value,
      timestamp: Date.now(),
    });

    return data?.config_value;
  }

  /**
   * Clear config cache (call when needed)
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Get user-friendly feature display name
   */
  private getFeatureDisplayName(featureName: string): string {
    const names: Record<string, string> = {
      'answer_explanation': 'AI Explain',
      'question_generation': 'AI Generate Questions',
      'student_insights': 'AI Insights',
      'prompt_testing': 'Prompt Testing',
      'quality_review': 'Quality Review',
    };

    return names[featureName] || 'This AI feature';
  }
}

// Export singleton instance
export const aiConfigService = new AIConfigService();
