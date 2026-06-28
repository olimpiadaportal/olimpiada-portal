// Settings Service
// Stage 9: Profile & Settings
// Handles settings persistence with AsyncStorage and Supabase sync

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { UserSettings, DEFAULT_SETTINGS } from '../types/settings';

const SETTINGS_KEY = '@uniprep_settings';

class SettingsService {
  /**
   * Get user settings
   * Priority: AsyncStorage (local) > Supabase (remote) > Defaults
   */
  async getSettings(userId?: string): Promise<UserSettings> {
    try {
      // Try local storage first (faster)
      const localSettings = await this.getLocalSettings();
      if (localSettings) {
        console.log('📱 Loaded settings from local storage');
        return localSettings;
      }

      // If user is logged in, try Supabase
      if (userId) {
        const remoteSettings = await this.getRemoteSettings(userId);
        if (remoteSettings) {
          // Cache to local storage
          await this.saveLocalSettings(remoteSettings);
          console.log('☁️ Loaded settings from Supabase');
          return remoteSettings;
        }
      }

      // Return defaults
      console.log('⚙️ Using default settings');
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Update user settings
   * Saves to both local storage and Supabase
   */
  async updateSettings(
    settings: Partial<UserSettings>,
    userId?: string
  ): Promise<boolean> {
    try {
      // Get current settings
      const currentSettings = await this.getSettings(userId);
      
      // Merge with updates
      const updatedSettings: UserSettings = {
        ...currentSettings,
        ...settings,
      };

      // Save to local storage
      await this.saveLocalSettings(updatedSettings);
      console.log('💾 Settings saved to local storage');

      // Save to Supabase if user is logged in
      if (userId) {
        await this.saveRemoteSettings(userId, updatedSettings);
        console.log('☁️ Settings synced to Supabase');
      }

      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      return false;
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(userId?: string): Promise<boolean> {
    try {
      // Clear local storage
      await AsyncStorage.removeItem(SETTINGS_KEY);
      console.log('🗑️ Local settings cleared');

      // Reset in Supabase if user is logged in
      if (userId) {
        await this.saveRemoteSettings(userId, DEFAULT_SETTINGS);
        console.log('☁️ Remote settings reset');
      }

      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      return false;
    }
  }

  /**
   * Export settings as JSON
   * For GDPR compliance
   */
  async exportSettings(userId?: string): Promise<string> {
    try {
      const settings = await this.getSettings(userId);
      return JSON.stringify(settings, null, 2);
    } catch (error) {
      console.error('Error exporting settings:', error);
      throw error;
    }
  }

  /**
   * Sync local settings to Supabase
   * Called after login
   */
  async syncToRemote(userId: string): Promise<boolean> {
    try {
      const localSettings = await this.getLocalSettings();
      if (localSettings) {
        await this.saveRemoteSettings(userId, localSettings);
        console.log('🔄 Settings synced to Supabase after login');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error syncing settings:', error);
      return false;
    }
  }

  /**
   * Sync remote settings to local
   * Called after login
   */
  async syncToLocal(userId: string): Promise<boolean> {
    try {
      const remoteSettings = await this.getRemoteSettings(userId);
      if (remoteSettings) {
        await this.saveLocalSettings(remoteSettings);
        console.log('🔄 Settings synced from Supabase after login');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error syncing settings:', error);
      return false;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Get settings from AsyncStorage
   */
  private async getLocalSettings(): Promise<UserSettings | null> {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Error reading local settings:', error);
      return null;
    }
  }

  /**
   * Save settings to AsyncStorage
   */
  private async saveLocalSettings(settings: UserSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving local settings:', error);
      throw error;
    }
  }

  /**
   * Get settings from Supabase
   */
  private async getRemoteSettings(userId: string): Promise<UserSettings | null> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No settings found, return null
          return null;
        }
        throw error;
      }

      if (!data) return null;

      // Fetch reminder_time from notification_preferences in parallel
      const { data: notifPrefs } = await supabase
        .from('notification_preferences')
        .select('reminder_time')
        .eq('user_id', userId)
        .single();

      const rawReminderTime: string = notifPrefs?.reminder_time || '18:00:00';
      // Normalize HH:MM:SS → HH:MM
      const reminderTime = rawReminderTime.substring(0, 5);

      // Map database fields to UserSettings
      return {
        language: data.language,
        theme: data.theme,
        defaultScreen: data.default_screen,
        notificationsEnabled: data.notifications_enabled,
        studyReminders: data.study_reminders,
        examReminders: data.exam_reminders,
        achievementNotifications: data.achievement_notifications,
        quietHoursEnabled: data.quiet_hours_enabled,
        quietHoursStart: data.quiet_hours_start || '22:00',
        quietHoursEnd: data.quiet_hours_end || '08:00',
        reminderTime,
        timerEnabled: data.timer_enabled,
        autoAdvance: data.auto_advance,
        showExplanations: data.show_explanations,
        profileVisibility: data.profile_visibility,
        showInLeaderboard: data.show_in_leaderboard,
        fontSize: data.font_size,
        highContrast: data.high_contrast,
        offlineMode: data.offline_mode ?? false,
        cacheSize: data.cache_size ?? 0,
      };
    } catch (error) {
      console.error('Error reading remote settings:', error);
      return null;
    }
  }

  /**
   * Save settings to Supabase
   */
  private async saveRemoteSettings(
    userId: string,
    settings: UserSettings
  ): Promise<void> {
    try {
      // Prepare data object, excluding quiet_hours columns if they cause issues
      const dataToSave: any = {
        user_id: userId,
        language: settings.language,
        theme: settings.theme,
        default_screen: settings.defaultScreen,
        notifications_enabled: settings.notificationsEnabled,
        study_reminders: settings.studyReminders,
        exam_reminders: settings.examReminders,
        achievement_notifications: settings.achievementNotifications,
        quiet_hours_enabled: settings.quietHoursEnabled,
        timer_enabled: settings.timerEnabled,
        auto_advance: settings.autoAdvance,
        show_explanations: settings.showExplanations,
        profile_visibility: settings.profileVisibility,
        show_in_leaderboard: settings.showInLeaderboard,
        font_size: settings.fontSize,
        high_contrast: settings.highContrast,
        updated_at: new Date().toISOString(),
      };

      // Try to include quiet_hours columns, but don't fail if they don't exist yet
      try {
        dataToSave.quiet_hours_start = settings.quietHoursStart;
        dataToSave.quiet_hours_end = settings.quietHoursEnd;
      } catch (e) {
        // Columns don't exist yet, skip them
        console.log('⚠️ Quiet hours columns not available yet');
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert(dataToSave, {
          onConflict: 'user_id'
        });

      if (error) {
        // If error is about quiet_hours columns, retry without them
        if (error.message?.includes('quiet_hours')) {
          console.log('⚠️ Retrying without quiet_hours columns...');
          delete dataToSave.quiet_hours_start;
          delete dataToSave.quiet_hours_end;
          
          const { error: retryError } = await supabase
            .from('user_settings')
            .upsert(dataToSave, {
              onConflict: 'user_id'
            });
          
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }

      // Persist reminderTime to notification_preferences (separate table)
      if (settings.reminderTime) {
        await supabase
          .from('notification_preferences')
          .upsert(
            {
              user_id: userId,
              reminder_time: settings.reminderTime + ':00',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
      }
    } catch (error) {
      console.error('Error saving remote settings:', error);
      // Don't throw - allow local settings to work even if remote fails
      // throw error;
    }
  }

  /**
   * Clear all settings (for testing)
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SETTINGS_KEY);
      console.log('🗑️ All settings cleared');
    } catch (error) {
      console.error('Error clearing settings:', error);
    }
  }
}

export const settingsService = new SettingsService();
