// Notification Settings Service
// Stage 6 - Week 3: Mobile Feature Integration
// Integrates notification behavior with admin panel settings

import { systemSettingsService, SystemSettings } from './systemSettingsService';

export interface NotificationChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
}

class NotificationSettingsService {
  private cachedSettings: NotificationChannels | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get notification channel settings from admin panel
   */
  async getChannelSettings(): Promise<NotificationChannels> {
    try {
      // Check cache
      if (this.cachedSettings && (Date.now() - this.lastFetch) < this.CACHE_TTL) {
        return this.cachedSettings;
      }

      const settings = await systemSettingsService.getSettings();
      
      if (settings) {
        this.cachedSettings = {
          email: settings.email_enabled ?? true,
          push: settings.push_enabled ?? true,
          sms: settings.sms_enabled ?? false,
          inApp: settings.in_app_enabled ?? true,
        };
        this.lastFetch = Date.now();
        console.log('🔔 Notification settings loaded:', this.cachedSettings);
        return this.cachedSettings;
      }

      // Default settings if not available
      return {
        email: true,
        push: true,
        sms: false,
        inApp: true,
      };
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      return {
        email: true,
        push: true,
        sms: false,
        inApp: true,
      };
    }
  }

  /**
   * Check if a specific notification channel is enabled
   */
  async isChannelEnabled(channel: keyof NotificationChannels): Promise<boolean> {
    const settings = await this.getChannelSettings();
    return settings[channel];
  }

  /**
   * Check if push notifications are enabled
   */
  async isPushEnabled(): Promise<boolean> {
    return await this.isChannelEnabled('push');
  }

  /**
   * Check if email notifications are enabled
   */
  async isEmailEnabled(): Promise<boolean> {
    return await this.isChannelEnabled('email');
  }

  /**
   * Check if in-app notifications are enabled
   */
  async isInAppEnabled(): Promise<boolean> {
    return await this.isChannelEnabled('inApp');
  }

  /**
   * Check if SMS notifications are enabled
   */
  async isSmsEnabled(): Promise<boolean> {
    return await this.isChannelEnabled('sms');
  }

  /**
   * Should send notification through a specific channel?
   * Combines admin settings with user preferences
   */
  async shouldSendNotification(
    channel: keyof NotificationChannels,
    userPreference: boolean = true
  ): Promise<boolean> {
    // Admin setting must be enabled AND user preference must be enabled
    const adminEnabled = await this.isChannelEnabled(channel);
    return adminEnabled && userPreference;
  }

  /**
   * Get all enabled channels for a notification
   * Returns only channels that are enabled both by admin and user
   */
  async getEnabledChannels(userPreferences: Partial<NotificationChannels> = {}): Promise<NotificationChannels> {
    const adminSettings = await this.getChannelSettings();
    
    return {
      email: adminSettings.email && (userPreferences.email ?? true),
      push: adminSettings.push && (userPreferences.push ?? true),
      sms: adminSettings.sms && (userPreferences.sms ?? false),
      inApp: adminSettings.inApp && (userPreferences.inApp ?? true),
    };
  }

  /**
   * Clear cached settings (force refresh on next call)
   */
  clearCache(): void {
    this.cachedSettings = null;
    this.lastFetch = 0;
    console.log('🗑️ Notification settings cache cleared');
  }

  /**
   * Log notification attempt with channel status
   */
  async logNotificationAttempt(
    notificationType: string,
    channel: keyof NotificationChannels,
    userId?: string
  ): Promise<void> {
    const isEnabled = await this.isChannelEnabled(channel);
    
    if (!isEnabled) {
      console.log(`⚠️ Notification blocked: ${notificationType} via ${channel} (channel disabled by admin)`);
    } else {
      console.log(`✅ Notification allowed: ${notificationType} via ${channel}`);
    }
  }
}

export const notificationSettingsService = new NotificationSettingsService();
