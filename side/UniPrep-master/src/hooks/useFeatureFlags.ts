// useFeatureFlags Hook
// Stage 6 - Week 3: Mobile Feature Integration
// React hook for feature flag management in components

import { useState, useEffect, useCallback } from 'react';
import { featureFlagService } from '../services/featureFlagService';
import { systemSettingsService } from '../services/systemSettingsService';

// Feature flag names (must match database)
export type FeatureFlagName =
  | 'ai_explanations'
  | 'ai_insights'
  | 'competitive_mode'  // Includes AI question generation
  | 'teacher_marketplace'
  | 'teacher_registration'  // Controls whether teachers can register
  | 'leaderboards'
  | 'dark_mode'
  | 'offline_mode'
  | 'goal_setting'           // Phase 1: Daily goal setting
  | 'study_plans'            // Phase 1: Study plan generation
  | 'chat_read_receipts'     // Phase 4: Read receipts in chat
  | 'chat_file_sharing'      // Phase 4: File sharing in chat
  | 'booking_reminders'      // Phase 5: Booking reminder notifications
  | 'session_notes'          // Phase 5: Post-session teacher notes
  | 'score_prediction'       // Phase 6: Exam score prediction
  | 'referral_program'       // Phase 7: Referral / invite system
  | 'teacher_availability'   // Teacher availability management
  | 'screenshot_prevention'; // Security: prevent screenshots on exam/practice screens

export interface FeatureFlags {
  ai_explanations: boolean;
  ai_insights: boolean;
  competitive_mode: boolean;  // Includes AI question generation
  teacher_marketplace: boolean;
  teacher_registration: boolean;  // Controls whether teachers can register
  leaderboards: boolean;
  dark_mode: boolean;
  offline_mode: boolean;
  goal_setting: boolean;           // Phase 1
  study_plans: boolean;            // Phase 1
  chat_read_receipts: boolean;     // Phase 4
  chat_file_sharing: boolean;      // Phase 4
  booking_reminders: boolean;      // Phase 5
  session_notes: boolean;          // Phase 5
  score_prediction: boolean;       // Phase 6
  referral_program: boolean;       // Phase 7
  teacher_availability: boolean;   // Teacher availability management
  screenshot_prevention: boolean;  // Security: prevent screenshots on exam/practice
}

// Default to FALSE during loading to prevent flash of content
// Features will show only after flags are loaded from server
const DEFAULT_FLAGS: FeatureFlags = {
  ai_explanations: false,
  ai_insights: false,
  competitive_mode: false,
  teacher_marketplace: false,
  teacher_registration: false,
  leaderboards: false,
  dark_mode: false,
  offline_mode: false,
  goal_setting: true,            // Phase 1: enabled by default
  study_plans: true,             // Phase 1: enabled by default
  chat_read_receipts: true,      // Phase 4: trivial, enabled by default
  chat_file_sharing: false,      // Phase 4: disabled until tested
  booking_reminders: true,       // Phase 5: enabled by default
  session_notes: true,           // Phase 5: enabled by default
  score_prediction: true,        // Phase 6: enabled by default
  referral_program: false,       // Phase 7: disabled until backend ready
  teacher_availability: true,    // Teacher availability: enabled by default
  screenshot_prevention: true,   // Security: enabled by default (disable for dev screenshots)
};

/**
 * Hook to get all feature flags
 * Uses cached settings from app initialization for instant access
 * Falls back to fetching if no cache exists
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);

      // Use cached settings first (already loaded during app init)
      // Only force refresh if explicitly requested
      const settings = await systemSettingsService.getSettings(forceRefresh);
      
      if (settings?.feature_flags) {
        const newFlags = {
          ai_explanations: settings.feature_flags.ai_explanations ?? DEFAULT_FLAGS.ai_explanations,
          ai_insights: settings.feature_flags.ai_insights ?? DEFAULT_FLAGS.ai_insights,
          competitive_mode: settings.feature_flags.competitive_mode ?? DEFAULT_FLAGS.competitive_mode,
          teacher_marketplace: settings.feature_flags.teacher_marketplace ?? DEFAULT_FLAGS.teacher_marketplace,
          teacher_registration: settings.feature_flags.teacher_registration ?? DEFAULT_FLAGS.teacher_registration,
          leaderboards: settings.feature_flags.leaderboards ?? DEFAULT_FLAGS.leaderboards,
          dark_mode: settings.feature_flags.dark_mode ?? DEFAULT_FLAGS.dark_mode,
          offline_mode: settings.feature_flags.offline_mode ?? DEFAULT_FLAGS.offline_mode,
          goal_setting: settings.feature_flags.goal_setting ?? DEFAULT_FLAGS.goal_setting,
          study_plans: settings.feature_flags.study_plans ?? DEFAULT_FLAGS.study_plans,
          chat_read_receipts: settings.feature_flags.chat_read_receipts ?? DEFAULT_FLAGS.chat_read_receipts,
          chat_file_sharing: settings.feature_flags.chat_file_sharing ?? DEFAULT_FLAGS.chat_file_sharing,
          booking_reminders: settings.feature_flags.booking_reminders ?? DEFAULT_FLAGS.booking_reminders,
          session_notes: settings.feature_flags.session_notes ?? DEFAULT_FLAGS.session_notes,
          score_prediction: settings.feature_flags.score_prediction ?? DEFAULT_FLAGS.score_prediction,
          referral_program: settings.feature_flags.referral_program ?? DEFAULT_FLAGS.referral_program,
          teacher_availability: settings.feature_flags.teacher_availability ?? DEFAULT_FLAGS.teacher_availability,
          screenshot_prevention: settings.feature_flags.screenshot_prevention ?? DEFAULT_FLAGS.screenshot_prevention,
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
    loadFlags(false); // Use cached settings, don't force refresh
  }, [loadFlags]);

  const refresh = useCallback(async () => {
    featureFlagService.clearCache();
    await loadFlags(true); // Force refresh when explicitly requested
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
        const isEnabled = await featureFlagService.isEnabled(flagName);
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
 * Hook to check multiple feature flags at once
 */
export function useMultipleFeatureFlags(flagNames: FeatureFlagName[]) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFlags = async () => {
      try {
        setLoading(true);
        const results = await featureFlagService.checkFlags(flagNames);
        const flagsObj: Record<string, boolean> = {};
        results.forEach((value, key) => {
          flagsObj[key] = value;
        });
        setFlags(flagsObj);
      } catch (error) {
        console.error('Error checking flags:', error);
        // Set defaults
        const defaultFlags: Record<string, boolean> = {};
        flagNames.forEach(name => {
          defaultFlags[name] = DEFAULT_FLAGS[name];
        });
        setFlags(defaultFlags);
      } finally {
        setLoading(false);
      }
    };

    checkFlags();
  }, [flagNames.join(',')]);

  return { flags, loading };
}

/**
 * Hook for password policy
 */
export function usePasswordPolicy() {
  const [policy, setPolicy] = useState<{
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPolicy = async () => {
      try {
        setLoading(true);
        const { passwordPolicyService } = await import('../services/passwordPolicyService');
        const policyData = await passwordPolicyService.getPolicy();
        setPolicy(policyData);
      } catch (error) {
        console.error('Error loading password policy:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPolicy();
  }, []);

  return { policy, loading };
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
