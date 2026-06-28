// System Settings Service
// Web App Integration with Admin Panel
// Handles system-wide settings sync from admin panel

import { createClient } from '@/lib/supabase/client';

const CACHE_KEY = 'uniprep_system_settings';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
  
  // Social Media Links
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_linkedin: string;
  social_tiktok: string;
  
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
    ai_explanations: boolean;
    ai_insights: boolean;
    competitive_mode: boolean;
    teacher_marketplace: boolean;
    teacher_registration: boolean;
    leaderboards: boolean;
    dark_mode: boolean;
    offline_mode: boolean;
    [key: string]: boolean;
  };
  
  // Metadata
  _metadata?: {
    version: string;
    synced_at: string;
  };
}

interface CachedSettings {
  settings: SystemSettings;
  timestamp: number;
}

class SystemSettingsService {
  private cache: CachedSettings | null = null;

  /**
   * Get system settings
   * Returns cached settings if recent, otherwise fetches from server
   */
  async getSettings(forceRefresh = false): Promise<SystemSettings | null> {
    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh && this.cache) {
        const now = Date.now();
        if (now - this.cache.timestamp < CACHE_DURATION) {
          return this.cache.settings;
        }
      }

      // Also check localStorage for persistence across page reloads
      if (!forceRefresh) {
        const cached = this.getCachedSettings();
        if (cached) {
          this.cache = cached;
          return cached.settings;
        }
      }
      const settings = await this.fetchFromServer();
      
      if (settings) {
        this.cacheSettings(settings);
        return settings;
      }

      return null;
    } catch (error) {
      // Return cached settings as fallback
      return this.cache?.settings || null;
    }
  }

  /**
   * Fetch settings from server using RPC function
   */
  private async fetchFromServer(): Promise<SystemSettings | null> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_mobile_app_settings');

      if (error) {
        return null;
      }

      if (!data) {
        return data as SystemSettings;
      }
      return data as SystemSettings;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get cached settings from localStorage
   */
  private getCachedSettings(): CachedSettings | null {
    try {
      if (typeof window === 'undefined') return null;
      
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as CachedSettings;
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - parsed.timestamp < CACHE_DURATION) {
          return parsed;
        }
      }
      return null;
    } catch (error) {
      console.error('Error reading cached settings:', error);
      return null;
    }
  }

  /**
   * Cache settings to memory and localStorage
   */
  private cacheSettings(settings: SystemSettings): void {
    const cached: CachedSettings = {
      settings,
      timestamp: Date.now(),
    };
    
    this.cache = cached;
    
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
      }
    } catch (error) {
      console.error('Error caching settings:', error);
    }
  }

  /**
   * Force refresh settings
   */
  async refresh(): Promise<SystemSettings | null> {
    return await this.getSettings(true);
  }

  /**
   * Clear cached settings
   */
  clearCache(): void {
    this.cache = null;
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get specific setting value
   */
  async getSetting<K extends keyof SystemSettings>(key: K): Promise<SystemSettings[K] | null> {
    const settings = await this.getSettings();
    return settings ? settings[key] : null;
  }

  /**
   * Get app name from settings
   */
  async getAppName(): Promise<string> {
    const settings = await this.getSettings();
    return settings?.app_name || 'Elmly';
  }

  /**
   * Get support info
   */
  async getSupportInfo(): Promise<{ email: string; phone: string }> {
    const settings = await this.getSettings();
    return {
      email: settings?.support_email || 'support@elmly.app',
      phone: settings?.support_phone || '+994 XX XXX XX XX',
    };
  }

  /**
   * Check if maintenance mode is active
   */
  async isMaintenanceMode(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings?.maintenance_mode || false;
  }

  /**
   * Get maintenance message for locale
   */
  async getMaintenanceMessage(locale: string = 'en'): Promise<string> {
    const settings = await this.getSettings();
    if (!settings) return 'System is under maintenance. Please try again later.';
    
    switch (locale) {
      case 'az':
        return settings.maintenance_message_az || settings.maintenance_message_en;
      case 'ru':
        return settings.maintenance_message_ru || settings.maintenance_message_en;
      default:
        return settings.maintenance_message_en;
    }
  }
}

export const systemSettingsService = new SystemSettingsService();
