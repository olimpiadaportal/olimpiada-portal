// useAppSettings Hook
// Provides dynamic app settings from admin panel system_settings table
// Replaces static constants with database-driven values

'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface AppSettings {
  appName: string;
  appDescription: string;
  supportEmail: string;
  supportPhone: string;
  websiteUrl: string;
  isMaintenanceMode: boolean;
  maintenanceMessage: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Elmly',
  appDescription: 'Admin Panel',
  supportEmail: 'support@elmly.app',
  supportPhone: '+994 XX XXX XX XX',
  websiteUrl: 'https://www.elmly.app',
  isMaintenanceMode: false,
  maintenanceMessage: '',
};

// Cache settings in memory
let cachedSettings: AppSettings | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to get dynamic app settings from system_settings table
 * Fetches from database and caches locally
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(cachedSettings || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!cachedSettings);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async (forceRefresh = false) => {
    try {
      // Check cache first
      if (!forceRefresh && cachedSettings && cacheTimestamp) {
        const now = Date.now();
        if (now - cacheTimestamp < CACHE_DURATION) {
          setSettings(cachedSettings);
          setLoading(false);
          return;
        }
      }

      setError(null);
      
      // Fetch from database - system_settings uses 'key' and 'value' columns
      const { data, error: fetchError } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', [
          'app_name',
          'support_email',
          'support_phone',
          'website_url',
          'maintenance_mode',
          'maintenance_message_en'
        ]);

      if (fetchError) {
        throw fetchError;
      }

      // Parse settings - value is JSONB, so we need to extract the actual value
      const settingsMap = new Map(
        data?.map(s => {
          // Handle JSONB value - it might be a string or object
          let actualValue = s.value;
          if (typeof actualValue === 'object' && actualValue !== null) {
            // If it's an object, try to get the value property or stringify it
            actualValue = actualValue.value || JSON.stringify(actualValue);
          }
          return [s.key, actualValue];
        }) || []
      );
      
      const newSettings: AppSettings = {
        appName: settingsMap.get('app_name') || DEFAULT_SETTINGS.appName,
        appDescription: DEFAULT_SETTINGS.appDescription,
        supportEmail: settingsMap.get('support_email') || DEFAULT_SETTINGS.supportEmail,
        supportPhone: settingsMap.get('support_phone') || DEFAULT_SETTINGS.supportPhone,
        websiteUrl: settingsMap.get('website_url') || DEFAULT_SETTINGS.websiteUrl,
        isMaintenanceMode: settingsMap.get('maintenance_mode') === 'true' || settingsMap.get('maintenance_mode') === true,
        maintenanceMessage: settingsMap.get('maintenance_message_en') || '',
      };

      // Update cache
      cachedSettings = newSettings;
      cacheTimestamp = Date.now();
      setSettings(newSettings);
    } catch (err) {
      console.error('Error loading app settings:', err);
      setError('Failed to load app settings');
      setSettings(DEFAULT_SETTINGS);
      cachedSettings = DEFAULT_SETTINGS;
      cacheTimestamp = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings(false);
  }, [loadSettings]);

  const refresh = useCallback(async () => {
    cachedSettings = null;
    cacheTimestamp = null;
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
 * Clear the settings cache
 */
export function clearAppSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = null;
}
