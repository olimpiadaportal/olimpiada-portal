// System Settings Service
// Stage 6 - Phase 3: Mobile App Integration
// Handles system-wide settings sync from admin panel

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const SYSTEM_SETTINGS_KEY = '@uniprep_system_settings';
const LAST_SYNC_KEY = '@uniprep_system_settings_last_sync';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface SystemSettings {
  // Application Info
  app_name: string;
  app_version: string;
  min_app_version: string;
  force_update: boolean;
  
  // Maintenance Mode
  maintenance_mode: boolean;
  maintenance_message_az: string;
  maintenance_message_en: string;
  maintenance_message_ru: string;
  
  // Support
  support_email: string;
  support_phone: string;
  
  // API
  api_base_url: string;
  
  // Website
  website_url: string;
  
  // Webapp (for legal document links)
  webapp_url: string;
  
  // App Features
  walkthrough_enabled: boolean;
  
  // Notifications
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  
  // Security
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_number: boolean;
  password_require_special: boolean;
  session_timeout_minutes: number;
  
  // Payment
  commission_rate: number;
  min_payout_amount: number;
  currency: string;
  
  // Feature Flags (embedded)
  feature_flags: {
    [key: string]: boolean;
  };
  
  // Metadata
  _metadata: {
    version: string;
    synced_at: string;
  };
}

class SystemSettingsService {
  private syncTimeout: NodeJS.Timeout | null = null;

  /**
   * Get system settings
   * Returns cached settings if recent, otherwise fetches from server
   */
  async getSettings(forceRefresh = false): Promise<SystemSettings | null> {
    try {
      // Check if we need to refresh
      const shouldRefresh = forceRefresh || await this.shouldSync();

      if (shouldRefresh) {
        console.log('🔄 Fetching fresh system settings from server...');
        const freshSettings = await this.fetchFromServer();
        if (freshSettings) {
          await this.cacheSettings(freshSettings);
          await this.updateLastSyncTime();
          return freshSettings;
        }
      }

      // Return cached settings
      const cached = await this.getCachedSettings();
      if (cached) {
        console.log('📱 Using cached system settings');
        return cached;
      }

      // Fallback: fetch from server
      console.log('⚠️ No cached settings, fetching from server...');
      const settings = await this.fetchFromServer();
      if (settings) {
        await this.cacheSettings(settings);
        await this.updateLastSyncTime();
      }
      return settings;
    } catch (error) {
      console.error('Error getting system settings:', error);
      // Return cached settings as fallback
      return await this.getCachedSettings();
    }
  }

  /**
   * Fetch settings from server
   * Calls the get_mobile_app_settings() RPC function
   */
  private async fetchFromServer(): Promise<SystemSettings | null> {
    try {
      const { data, error } = await supabase.rpc('get_mobile_app_settings');

      if (error) {
        console.error('Error fetching system settings:', error);
        return null;
      }

      if (!data) {
        console.warn('No system settings returned from server');
        return null;
      }

      console.log('✅ System settings fetched successfully');
      console.log('🔧 Maintenance mode value:', data.maintenance_mode);
      return data as SystemSettings;
    } catch (error) {
      console.error('Error in fetchFromServer:', error);
      return null;
    }
  }

  /**
   * Check if we should sync (last sync > 5 minutes ago)
   */
  private async shouldSync(): Promise<boolean> {
    try {
      const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
      if (!lastSyncStr) return true;

      const lastSync = parseInt(lastSyncStr, 10);
      const now = Date.now();
      const timeSinceSync = now - lastSync;

      return timeSinceSync > SYNC_INTERVAL;
    } catch (error) {
      console.error('Error checking sync time:', error);
      return true;
    }
  }

  /**
   * Get cached settings from AsyncStorage
   */
  private async getCachedSettings(): Promise<SystemSettings | null> {
    try {
      const cached = await AsyncStorage.getItem(SYSTEM_SETTINGS_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      console.error('Error reading cached settings:', error);
      return null;
    }
  }

  /**
   * Cache settings to AsyncStorage
   */
  private async cacheSettings(settings: SystemSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SYSTEM_SETTINGS_KEY, JSON.stringify(settings));
      console.log('💾 System settings cached');
    } catch (error) {
      console.error('Error caching settings:', error);
    }
  }

  /**
   * Update last sync timestamp
   */
  private async updateLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error updating sync time:', error);
    }
  }

  /**
   * Start periodic sync
   * Call this on app launch
   */
  startPeriodicSync(): void {
    // Clear any existing timeout
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    // Set up periodic sync
    const sync = async () => {
      await this.getSettings(true);
      this.syncTimeout = setTimeout(sync, SYNC_INTERVAL);
    };

    // Start first sync after 1 minute
    this.syncTimeout = setTimeout(sync, 60 * 1000);
    console.log('🔄 Periodic sync started (every 5 minutes)');
  }

  /**
   * Stop periodic sync
   * Call this on app close
   */
  stopPeriodicSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
      console.log('⏹️ Periodic sync stopped');
    }
  }

  /**
   * Force refresh settings
   */
  async refresh(): Promise<SystemSettings | null> {
    return await this.getSettings(true);
  }

  /**
   * Clear cached settings (for testing)
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SYSTEM_SETTINGS_KEY);
      await AsyncStorage.removeItem(LAST_SYNC_KEY);
      console.log('🗑️ System settings cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get specific setting value
   */
  async getSetting(key: keyof SystemSettings): Promise<any> {
    const settings = await this.getSettings();
    return settings ? settings[key] : null;
  }

  /**
   * Check if app version is supported
   * Returns true if current version >= min_app_version
   */
  async isVersionSupported(currentVersion: string): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      if (!settings) return true; // Allow if can't check

      const minVersion = settings.min_app_version;
      return this.compareVersions(currentVersion, minVersion) >= 0;
    } catch (error) {
      console.error('Error checking version:', error);
      return true; // Allow if error
    }
  }

  /**
   * Check if walkthrough feature is enabled
   * Returns true by default if setting not found
   */
  async isWalkthroughEnabled(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      // Default to true if setting doesn't exist
      return settings?.walkthrough_enabled ?? true;
    } catch (error) {
      console.error('Error checking walkthrough enabled:', error);
      return true; // Default to enabled if error
    }
  }

  /**
   * Compare version strings (e.g., "1.2.3" vs "1.2.0")
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;

      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }

    return 0;
  }
}

export const systemSettingsService = new SystemSettingsService();
