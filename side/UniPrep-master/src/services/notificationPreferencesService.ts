/**
 * Notification Preferences Service
 * Phase 1: Foundation Enhancement
 * 
 * Manages granular user notification preferences per notification type.
 * Features:
 * - Per-type notification toggles
 * - Channel selection per type
 * - Quiet hours configuration
 * - Default preferences management
 */

import { supabase } from './supabase';

export interface NotificationPreference {
  id?: string;
  user_id: string;
  notification_type: string;
  enabled: boolean;
  channels: string[];
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_days: number[];
}

export const NOTIFICATION_TYPES = {
  BOOKING: 'booking',
  MESSAGE: 'message',
  REVIEW: 'review',
  ACHIEVEMENT: 'achievement',
  EXAM_REMINDER: 'exam_reminder',
  SESSION_REMINDER: 'session_reminder',
  STUDY_REMINDER: 'study_reminder',
  PROGRESS_REPORT: 'progress_report',
  MARKETING: 'marketing',
  SYSTEM: 'system',
} as const;

export const NOTIFICATION_TYPE_LABELS = {
  [NOTIFICATION_TYPES.BOOKING]: 'Booking Updates',
  [NOTIFICATION_TYPES.MESSAGE]: 'Messages',
  [NOTIFICATION_TYPES.REVIEW]: 'Reviews',
  [NOTIFICATION_TYPES.ACHIEVEMENT]: 'Achievements',
  [NOTIFICATION_TYPES.EXAM_REMINDER]: 'Exam Reminders',
  [NOTIFICATION_TYPES.SESSION_REMINDER]: 'Session Reminders',
  [NOTIFICATION_TYPES.STUDY_REMINDER]: 'Study Reminders',
  [NOTIFICATION_TYPES.PROGRESS_REPORT]: 'Progress Reports',
  [NOTIFICATION_TYPES.MARKETING]: 'Marketing & Promotions',
  [NOTIFICATION_TYPES.SYSTEM]: 'System Announcements',
};

export const DEFAULT_CHANNELS: Record<string, string[]> = {
  [NOTIFICATION_TYPES.BOOKING]: ['in_app', 'push', 'email'],
  [NOTIFICATION_TYPES.MESSAGE]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.REVIEW]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.ACHIEVEMENT]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.EXAM_REMINDER]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.SESSION_REMINDER]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.STUDY_REMINDER]: ['in_app', 'push'],
  [NOTIFICATION_TYPES.PROGRESS_REPORT]: ['in_app', 'email'],
  [NOTIFICATION_TYPES.MARKETING]: ['in_app'],
  [NOTIFICATION_TYPES.SYSTEM]: ['in_app', 'push'],
};

class NotificationPreferencesService {
  /**
   * Get all notification preferences for a user
   */
  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      // If no preferences exist, create defaults
      if (!data || data.length === 0) {
        return await this.createDefaultPreferences(userId);
      }

      return data;
    } catch (error) {
      console.error('Error getting user preferences:', error);
      return [];
    }
  }

  /**
   * Get preference for specific notification type
   */
  async getPreference(
    userId: string,
    notificationType: string
  ): Promise<NotificationPreference | null> {
    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', userId)
        .eq('notification_type', notificationType)
        .single();

      if (error) {
        // Create default if doesn't exist
        return await this.createDefaultPreference(userId, notificationType);
      }

      return data;
    } catch (error) {
      console.error('Error getting preference:', error);
      return null;
    }
  }

  /**
   * Create default preferences for all notification types
   */
  private async createDefaultPreferences(
    userId: string
  ): Promise<NotificationPreference[]> {
    try {
      const defaultPreferences = Object.values(NOTIFICATION_TYPES).map(type => ({
        user_id: userId,
        notification_type: type,
        enabled: true,
        channels: DEFAULT_CHANNELS[type] || ['in_app', 'push'],
        quiet_hours_enabled: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
        quiet_hours_days: [0, 1, 2, 3, 4, 5, 6],
      }));

      const { data, error } = await supabase
        .from('user_notification_settings')
        .insert(defaultPreferences)
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error creating default preferences:', error);
      return [];
    }
  }

  /**
   * Create default preference for specific type
   */
  private async createDefaultPreference(
    userId: string,
    notificationType: string
  ): Promise<NotificationPreference | null> {
    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .insert({
          user_id: userId,
          notification_type: notificationType,
          enabled: true,
          channels: DEFAULT_CHANNELS[notificationType] || ['in_app', 'push'],
          quiet_hours_enabled: false,
          quiet_hours_start: '22:00',
          quiet_hours_end: '08:00',
          quiet_hours_days: [0, 1, 2, 3, 4, 5, 6],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating default preference:', error);
      return null;
    }
  }

  /**
   * Update notification preference
   */
  async updatePreference(
    userId: string,
    notificationType: string,
    updates: Partial<NotificationPreference>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_settings')
        .update(updates)
        .eq('user_id', userId)
        .eq('notification_type', notificationType);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating preference:', error);
      return false;
    }
  }

  /**
   * Toggle notification type on/off
   */
  async toggleNotificationType(
    userId: string,
    notificationType: string,
    enabled: boolean
  ): Promise<boolean> {
    return await this.updatePreference(userId, notificationType, { enabled });
  }

  /**
   * Update channels for notification type
   */
  async updateChannels(
    userId: string,
    notificationType: string,
    channels: string[]
  ): Promise<boolean> {
    return await this.updatePreference(userId, notificationType, { channels });
  }

  /**
   * Update quiet hours settings
   */
  async updateQuietHours(
    userId: string,
    notificationType: string,
    settings: {
      enabled: boolean;
      start?: string;
      end?: string;
      days?: number[];
    }
  ): Promise<boolean> {
    const updates: Partial<NotificationPreference> = {
      quiet_hours_enabled: settings.enabled,
    };

    if (settings.start) updates.quiet_hours_start = settings.start;
    if (settings.end) updates.quiet_hours_end = settings.end;
    if (settings.days) updates.quiet_hours_days = settings.days;

    return await this.updatePreference(userId, notificationType, updates);
  }

  /**
   * Enable all notifications
   */
  async enableAll(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_settings')
        .update({ enabled: true })
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error enabling all notifications:', error);
      return false;
    }
  }

  /**
   * Disable all notifications
   */
  async disableAll(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_notification_settings')
        .update({ enabled: false })
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error disabling all notifications:', error);
      return false;
    }
  }

  /**
   * Reset to defaults
   */
  async resetToDefaults(userId: string): Promise<boolean> {
    try {
      // Delete existing preferences
      await supabase
        .from('user_notification_settings')
        .delete()
        .eq('user_id', userId);

      // Create new defaults
      await this.createDefaultPreferences(userId);
      return true;
    } catch (error) {
      console.error('Error resetting to defaults:', error);
      return false;
    }
  }

  /**
   * Check if user can receive notification
   */
  async canReceiveNotification(
    userId: string,
    notificationType: string,
    channel: string
  ): Promise<boolean> {
    try {
      const preference = await this.getPreference(userId, notificationType);
      
      if (!preference) return true; // Default to true if no preference

      // Check if type is enabled
      if (!preference.enabled) return false;

      // Check if channel is allowed
      if (!preference.channels.includes(channel)) return false;

      // Check quiet hours
      if (preference.quiet_hours_enabled) {
        const isQuietHours = await this.isInQuietHours(preference);
        if (isQuietHours) return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking if can receive notification:', error);
      return true; // Default to true on error
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  private isInQuietHours(preference: NotificationPreference): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay();

    // Check if current day is in quiet hours days
    if (!preference.quiet_hours_days.includes(currentDay)) {
      return false;
    }

    // Parse start and end times
    const [startHour, startMin] = preference.quiet_hours_start.split(':').map(Number);
    const [endHour, endMin] = preference.quiet_hours_end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    // Normal range
    return currentTime >= startTime && currentTime < endTime;
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
