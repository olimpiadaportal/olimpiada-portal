// Settings Service
// Stage 8: Profile & Settings
// Handles user settings with Supabase persistence

import { createClient } from '@/lib/supabase/client'
import { UserSettings, UserSettingsDB, DEFAULT_SETTINGS } from '@/types/settings'

class SettingsService {
  /**
   * Get user settings from Supabase
   * Returns default settings if none exist
   */
  async getSettings(userId: string): Promise<UserSettings> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No settings found, create with defaults
          await this.createDefaultSettings(userId)
          return DEFAULT_SETTINGS
        }
        throw error
      }

      if (!data) return DEFAULT_SETTINGS

      // Map database fields to UserSettings interface
      return this.mapDBToSettings(data as UserSettingsDB)
    } catch (error) {
      console.error('Error getting settings:', error)
      return DEFAULT_SETTINGS
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    settings: Partial<UserSettings>
  ): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // Get current settings first
      const currentSettings = await this.getSettings(userId)
      
      // Merge with updates
      const updatedSettings: UserSettings = {
        ...currentSettings,
        ...settings,
      }

      // Map to database format
      const dbData = this.mapSettingsToDB(userId, updatedSettings)

      const { error } = await supabase
        .from('user_settings')
        .upsert(dbData, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('Error updating settings:', error)
      return false
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings(userId: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const dbData = this.mapSettingsToDB(userId, DEFAULT_SETTINGS)

      const { error } = await supabase
        .from('user_settings')
        .upsert(dbData, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('Error resetting settings:', error)
      return false
    }
  }

  /**
   * Create default settings for new user
   */
  private async createDefaultSettings(userId: string): Promise<void> {
    try {
      const supabase = createClient()
      
      const dbData = this.mapSettingsToDB(userId, DEFAULT_SETTINGS)

      await supabase
        .from('user_settings')
        .insert(dbData)
    } catch (error) {
      console.error('Error creating default settings:', error)
    }
  }

  /**
   * Map database record to UserSettings interface
   */
  private mapDBToSettings(data: UserSettingsDB): UserSettings {
    return {
      language: data.language as 'az' | 'en' | 'ru',
      theme: data.theme as 'light' | 'dark' | 'system',
      notificationsEnabled: data.notifications_enabled,
      studyReminders: data.study_reminders,
      examReminders: data.exam_reminders,
      achievementNotifications: data.achievement_notifications,
      profileVisibility: data.profile_visibility as 'public' | 'private',
      showInLeaderboard: data.show_in_leaderboard,
    }
  }

  /**
   * Map UserSettings to database format
   */
  private mapSettingsToDB(userId: string, settings: UserSettings): Partial<UserSettingsDB> {
    return {
      user_id: userId,
      language: settings.language,
      theme: settings.theme,
      notifications_enabled: settings.notificationsEnabled,
      study_reminders: settings.studyReminders,
      exam_reminders: settings.examReminders,
      achievement_notifications: settings.achievementNotifications,
      profile_visibility: settings.profileVisibility,
      show_in_leaderboard: settings.showInLeaderboard,
      updated_at: new Date().toISOString(),
    }
  }
}

export const settingsService = new SettingsService()
