// Feature Flag Context
// Web App Integration with Admin Panel
// Provides feature flags to entire app via React Context

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { systemSettingsService, SystemSettings } from '@/services/systemSettingsService';

export interface FeatureFlags {
  ai_explanations: boolean;
  ai_insights: boolean;
  competitive_mode: boolean;
  teacher_marketplace: boolean;
  teacher_registration: boolean;
  leaderboards: boolean;
  dark_mode: boolean;
  offline_mode: boolean;
  webapp_auth_enabled: boolean;
  waitlist_enabled: boolean;
  goal_setting: boolean;
  study_plans: boolean;
  session_notes: boolean;
}

interface FeatureFlagContextType {
  flags: FeatureFlags;
  settings: SystemSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Convenience getters
  isFeatureEnabled: (flagName: keyof FeatureFlags) => boolean;
  // AI Features
  isAIExplanationsEnabled: boolean;
  isAIInsightsEnabled: boolean;
  isCompetitiveModeEnabled: boolean;
  isAnyAIEnabled: boolean;
  // Teacher Features
  isTeacherMarketplaceEnabled: boolean;
  isTeacherRegistrationEnabled: boolean;
  // Other Features
  isLeaderboardEnabled: boolean;
  isDarkModeEnabled: boolean;
  isWebappAuthEnabled: boolean;
  isWaitlistEnabled: boolean;
  isGoalSettingEnabled: boolean;
  isStudyPlansEnabled: boolean;
  isSessionNotesEnabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  ai_explanations: false,
  ai_insights: false,
  competitive_mode: false,
  teacher_marketplace: false,
  teacher_registration: false,
  leaderboards: false,
  dark_mode: true,
  offline_mode: false,
  webapp_auth_enabled: false,
  waitlist_enabled: true,
  goal_setting: true,
  study_plans: true,
  session_notes: true,
};

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const data = await systemSettingsService.getSettings(forceRefresh);
      
      if (data) {
        setSettings(data);
        
        if (data.feature_flags) {
          setFlags({
            ai_explanations: data.feature_flags.ai_explanations ?? DEFAULT_FLAGS.ai_explanations,
            ai_insights: data.feature_flags.ai_insights ?? DEFAULT_FLAGS.ai_insights,
            competitive_mode: data.feature_flags.competitive_mode ?? DEFAULT_FLAGS.competitive_mode,
            teacher_marketplace: data.feature_flags.teacher_marketplace ?? DEFAULT_FLAGS.teacher_marketplace,
            teacher_registration: data.feature_flags.teacher_registration ?? DEFAULT_FLAGS.teacher_registration,
            leaderboards: data.feature_flags.leaderboards ?? DEFAULT_FLAGS.leaderboards,
            dark_mode: data.feature_flags.dark_mode ?? DEFAULT_FLAGS.dark_mode,
            offline_mode: data.feature_flags.offline_mode ?? DEFAULT_FLAGS.offline_mode,
            webapp_auth_enabled: data.feature_flags.webapp_auth_enabled ?? DEFAULT_FLAGS.webapp_auth_enabled,
            waitlist_enabled: data.feature_flags.waitlist_enabled ?? DEFAULT_FLAGS.waitlist_enabled,
            goal_setting: data.feature_flags.goal_setting ?? DEFAULT_FLAGS.goal_setting,
            study_plans: data.feature_flags.study_plans ?? DEFAULT_FLAGS.study_plans,
            session_notes: data.feature_flags.session_notes ?? DEFAULT_FLAGS.session_notes,
          });
        }
      }
    } catch (err) {
      console.error('Error loading feature flags:', err);
      setError('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings(false);
    
    // Set up periodic refresh (every 5 minutes)
    const interval = setInterval(() => {
      loadSettings(true);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loadSettings]);

  const refresh = useCallback(async () => {
    systemSettingsService.clearCache();
    await loadSettings(true);
  }, [loadSettings]);

  const isFeatureEnabled = useCallback((flagName: keyof FeatureFlags): boolean => {
    return flags[flagName] ?? false;
  }, [flags]);

  const value: FeatureFlagContextType = {
    flags,
    settings,
    loading,
    error,
    refresh,
    isFeatureEnabled,
    // AI Features
    isAIExplanationsEnabled: flags.ai_explanations,
    isAIInsightsEnabled: flags.ai_insights,
    isCompetitiveModeEnabled: flags.competitive_mode,
    isAnyAIEnabled: flags.ai_explanations || flags.ai_insights || flags.competitive_mode,
    // Teacher Features
    isTeacherMarketplaceEnabled: flags.teacher_marketplace,
    isTeacherRegistrationEnabled: flags.teacher_registration,
    // Other Features
    isLeaderboardEnabled: flags.leaderboards,
    isDarkModeEnabled: flags.dark_mode,
    isWebappAuthEnabled: flags.webapp_auth_enabled,
    isWaitlistEnabled: flags.waitlist_enabled,
    isGoalSettingEnabled: flags.goal_setting,
    isStudyPlansEnabled: flags.study_plans,
    isSessionNotesEnabled: flags.session_notes,
  };

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlagContext() {
  const context = useContext(FeatureFlagContext);
  if (context === undefined) {
    throw new Error('useFeatureFlagContext must be used within a FeatureFlagProvider');
  }
  return context;
}

// HOC for conditional rendering based on feature flags
export function withFeatureFlag<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  flagName: keyof FeatureFlags,
  FallbackComponent?: React.ComponentType<P>
) {
  return function WithFeatureFlagComponent(props: P) {
    const { isFeatureEnabled, loading } = useFeatureFlagContext();
    
    if (loading) {
      return null; // Or a loading spinner
    }
    
    if (!isFeatureEnabled(flagName)) {
      return FallbackComponent ? <FallbackComponent {...props} /> : null;
    }
    
    return <WrappedComponent {...props} />;
  };
}
