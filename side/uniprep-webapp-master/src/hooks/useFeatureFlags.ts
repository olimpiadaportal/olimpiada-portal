// useFeatureFlags Hook
// Web App Integration with Admin Panel
// React hook for feature flag management in components

'use client';

import { useState, useEffect, useCallback } from 'react';
import { systemSettingsService, SystemSettings } from '@/services/systemSettingsService';

// Feature flag names (must match database)
export type FeatureFlagName =
  | 'ai_explanations'
  | 'ai_insights'
  | 'competitive_mode'
  | 'teacher_marketplace'
  | 'teacher_registration'
  | 'leaderboards'
  | 'dark_mode'
  | 'offline_mode'
  | 'webapp_auth_enabled'
  | 'waitlist_enabled'
  | 'goal_setting'
  | 'study_plans'
  | 'session_notes';

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

// Default to FALSE during loading to prevent flash of content
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

/**
 * Hook to get all feature flags
 * Uses cached settings from app initialization for instant access
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);

      const settings = await systemSettingsService.getSettings(forceRefresh);
      
      if (settings?.feature_flags) {
        const newFlags: FeatureFlags = {
          ai_explanations: settings.feature_flags.ai_explanations ?? DEFAULT_FLAGS.ai_explanations,
          ai_insights: settings.feature_flags.ai_insights ?? DEFAULT_FLAGS.ai_insights,
          competitive_mode: settings.feature_flags.competitive_mode ?? DEFAULT_FLAGS.competitive_mode,
          teacher_marketplace: settings.feature_flags.teacher_marketplace ?? DEFAULT_FLAGS.teacher_marketplace,
          teacher_registration: settings.feature_flags.teacher_registration ?? DEFAULT_FLAGS.teacher_registration,
          leaderboards: settings.feature_flags.leaderboards ?? DEFAULT_FLAGS.leaderboards,
          dark_mode: settings.feature_flags.dark_mode ?? DEFAULT_FLAGS.dark_mode,
          offline_mode: settings.feature_flags.offline_mode ?? DEFAULT_FLAGS.offline_mode,
          webapp_auth_enabled: settings.feature_flags.webapp_auth_enabled ?? DEFAULT_FLAGS.webapp_auth_enabled,
          waitlist_enabled: settings.feature_flags.waitlist_enabled ?? DEFAULT_FLAGS.waitlist_enabled,
          goal_setting: settings.feature_flags.goal_setting ?? DEFAULT_FLAGS.goal_setting,
          study_plans: settings.feature_flags.study_plans ?? DEFAULT_FLAGS.study_plans,
          session_notes: settings.feature_flags.session_notes ?? DEFAULT_FLAGS.session_notes,
        };
        setFlags(newFlags);
      } else {
        console.warn('⚠️ No feature flags in settings, using defaults');
      }
    } catch (err) {
      console.error('Error loading feature flags:', err);
      setError('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags(false);
  }, [loadFlags]);

  const refresh = useCallback(async () => {
    systemSettingsService.clearCache();
    await loadFlags(true);
  }, [loadFlags]);

  return {
    flags,
    loading,
    error,
    refresh,
    // Convenience getters
    isAIEnabled: flags.ai_explanations || flags.ai_insights || flags.competitive_mode,
    isCompetitiveModeEnabled: flags.competitive_mode,
    isTeacherMarketplaceEnabled: flags.teacher_marketplace,
    isTeacherRegistrationEnabled: flags.teacher_registration,
    isLeaderboardEnabled: flags.leaderboards,
    isDarkModeEnabled: flags.dark_mode,
  };
}

/**
 * Hook to check a single feature flag
 */
export function useFeatureFlag(flagName: FeatureFlagName) {
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_FLAGS[flagName]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFlag = async () => {
      try {
        setLoading(true);
        const settings = await systemSettingsService.getSettings();
        const isEnabled = settings?.feature_flags?.[flagName] ?? DEFAULT_FLAGS[flagName];
        setEnabled(isEnabled);
      } catch (error) {
        console.error(`Error checking flag ${flagName}:`, error);
        setEnabled(DEFAULT_FLAGS[flagName]);
      } finally {
        setLoading(false);
      }
    };

    checkFlag();
  }, [flagName]);

  return { enabled, loading };
}

/**
 * Hook for notification settings
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState({
    emailEnabled: true,
    pushEnabled: true,
    smsEnabled: false,
    inAppEnabled: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const systemSettings = await systemSettingsService.getSettings();
        
        if (systemSettings) {
          setSettings({
            emailEnabled: systemSettings.email_enabled ?? true,
            pushEnabled: systemSettings.push_enabled ?? true,
            smsEnabled: systemSettings.sms_enabled ?? false,
            inAppEnabled: systemSettings.in_app_enabled ?? true,
          });
        }
      } catch (error) {
        console.error('Error loading notification settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  return { settings, loading };
}

/**
 * Hook for system settings (app name, support info, etc.)
 */
export function useSystemSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await systemSettingsService.getSettings();
        setSettings(data);
      } catch (err) {
        console.error('Error loading system settings:', err);
        setError('Failed to load system settings');
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const refresh = useCallback(async () => {
    systemSettingsService.clearCache();
    const data = await systemSettingsService.getSettings(true);
    setSettings(data);
  }, []);

  return {
    settings,
    loading,
    error,
    refresh,
    appName: settings?.app_name || 'Elmly',
    supportEmail: settings?.support_email || 'support@elmly.app',
    supportPhone: settings?.support_phone || '',
    isMaintenanceMode: settings?.maintenance_mode || false,
  };
}
