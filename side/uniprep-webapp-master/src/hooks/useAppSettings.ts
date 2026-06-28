// useAppSettings Hook
// Provides dynamic app settings from admin panel
// Replaces static constants with database-driven values

'use client';

import { useState, useEffect, useCallback } from 'react';
import { systemSettingsService, SystemSettings } from '@/services/systemSettingsService';

interface AppSettings {
  appName: string;
  appDescription: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  isMaintenanceMode: boolean;
  maintenanceMessage: string;
  // Social media links (empty string = hidden)
  socialFacebook: string;
  socialInstagram: string;
  socialTwitter: string;
  socialLinkedin: string;
  socialTiktok: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Elmly',
  appDescription: 'Daily tasks, Mock Exams, Analytics',
  supportEmail: 'support@elmly.az',
  supportPhone: '+994 XX XXX XX XX',
  websiteUrl: 'https://elmly.az',
  isMaintenanceMode: false,
  maintenanceMessage: '',
  socialFacebook: '',
  socialInstagram: '',
  socialTwitter: '',
  socialLinkedin: '',
  socialTiktok: '',
};

/**
 * Hook to get dynamic app settings from admin panel
 * Fetches from database and caches locally
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const data = await systemSettingsService.getSettings(forceRefresh);
      
      if (data) {
        setSettings({
          appName: data.app_name || DEFAULT_SETTINGS.appName,
          appDescription: DEFAULT_SETTINGS.appDescription, // Keep description static for now
          supportEmail: data.support_email || DEFAULT_SETTINGS.supportEmail,
          supportPhone: data.support_phone || DEFAULT_SETTINGS.supportPhone,
          websiteUrl: data.website_url || DEFAULT_SETTINGS.websiteUrl,
          isMaintenanceMode: data.maintenance_mode || false,
          maintenanceMessage: data.maintenance_message_en || '',
          socialFacebook: data.social_facebook || '',
          socialInstagram: data.social_instagram || '',
          socialTwitter: data.social_twitter || '',
          socialLinkedin: data.social_linkedin || '',
          socialTiktok: data.social_tiktok || '',
        });
      }
    } catch (err) {
      console.error('Error loading app settings:', err);
      setError('Failed to load app settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings(false);
  }, [loadSettings]);

  const refresh = useCallback(async () => {
    systemSettingsService.clearCache();
    await loadSettings(true);
  }, [loadSettings]);

  return {
    ...settings,
    loading,
    error,
    refresh,
  };
}

/**
 * Server-side function to get app settings
 * For use in server components and metadata
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const data = await systemSettingsService.getSettings();
    
    if (data) {
      return {
        appName: data.app_name || DEFAULT_SETTINGS.appName,
        appDescription: DEFAULT_SETTINGS.appDescription,
        supportEmail: data.support_email || DEFAULT_SETTINGS.supportEmail,
        supportPhone: data.support_phone || DEFAULT_SETTINGS.supportPhone,
        websiteUrl: (data as SystemSettings & { website_url?: string }).website_url || DEFAULT_SETTINGS.websiteUrl,
        isMaintenanceMode: data.maintenance_mode || false,
        maintenanceMessage: data.maintenance_message_en || '',
        socialFacebook: data.social_facebook || '',
        socialInstagram: data.social_instagram || '',
        socialTwitter: data.social_twitter || '',
        socialLinkedin: data.social_linkedin || '',
        socialTiktok: data.social_tiktok || '',
      };
    }
    
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting app settings:', error);
    return DEFAULT_SETTINGS;
  }
}
