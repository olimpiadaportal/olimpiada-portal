/**
 * Notification Service
 * Stage 10 - Phase 2: Real-time Features
 * 
 * Handles push notifications, reminders, and real-time alerts.
 * Features:
 * - Push token management
 * - Local notifications
 * - Study reminders
 * - Exam reminders
 * - Booking updates
 * - Achievement notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import i18n from '../i18n';
import { ScheduledNotification } from '../types/settings';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        console.log('⚠️ Notifications only work on physical devices');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('⚠️ Notification permission denied');
        return false;
      }

      console.log('✅ Notification permissions granted');
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Get Expo push token
   */
  async getExpoPushToken(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('📱 Expo push token:', token);
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  /**
   * Register device for push notifications
   */
  async registerDevice(userId: string): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return false;

      const token = await this.getExpoPushToken();
      if (!token) return false;

      // Save token to database using RPC function that bypasses RLS
      const { data, error } = await supabase
        .rpc('upsert_push_token', {
          p_user_id: userId,
          p_token: token,
          p_platform: Platform.OS,
          p_device_name: Device.deviceName || `${Platform.OS} Device`,
        });

      if (error) {
        console.warn('Push token registration warning:', error.message);
        // Fallback to direct upsert if RPC doesn't exist yet
        const { error: fallbackError } = await supabase
          .from('push_tokens')
          .upsert(
            {
              user_id: userId,
              token,
              platform: Platform.OS,
              device_name: Device.deviceName || `${Platform.OS} Device`,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'token',
            }
          );
        
        if (fallbackError) throw fallbackError;
      }

      console.log('✅ Device registered for notifications');
      return true;
    } catch (error) {
      console.error('Error registering device:', error);
      return false;
    }
  }

  /**
   * Schedule a local notification
   */
  async scheduleNotification(
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput,
    data?: Record<string, any>
  ): Promise<string | null> {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data: data || {},
        },
        trigger,
      });

      console.log('✅ Notification scheduled:', id);
      return id;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Schedule daily study reminder
   */
  async scheduleDailyReminder(
    userId: string,
    hour: number,
    minute: number,
    daysOfWeek: number[]
  ): Promise<boolean> {
    try {
      // Cancel existing reminders first
      await this.cancelAllReminders();

      // Schedule for each day of week using WeeklyTriggerInput (cross-platform)
      for (const day of daysOfWeek) {
        await this.scheduleNotification(
          i18n.t('notifications.local.studyReminderTitle'),
          i18n.t('notifications.local.studyReminderBody'),
          {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            hour,
            minute,
            weekday: day,
          },
          { type: 'study_reminder' }
        );
      }

      // Update notification preferences
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: userId,
            study_reminders: true,
            reminder_time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) throw error;

      console.log('✅ Daily reminders scheduled');
      return true;
    } catch (error) {
      console.error('Error scheduling daily reminder:', error);
      return false;
    }
  }

  /**
   * Cancel a specific notification
   */
  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('✅ Notification cancelled:', notificationId);
      return true;
    } catch (error) {
      console.error('Error cancelling notification:', error);
      return false;
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllReminders(): Promise<boolean> {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const studyReminders = scheduled.filter(
        (n) => n.content.data?.type === 'study_reminder'
      );
      await Promise.all(
        studyReminders.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
      );
      console.log(`✅ ${studyReminders.length} study reminder(s) cancelled`);
      return true;
    } catch (error) {
      console.error('Error cancelling reminders:', error);
      return false;
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log(`📋 Found ${notifications.length} scheduled notifications`);
      return notifications;
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Get user's notification preferences from database
   */
  async getNotificationPreferences(userId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore not found error

      return data || {
        study_reminders: true,
        exam_reminders: true,
        booking_updates: true,
        achievement_notifications: true,
        weekly_reports: true,
        reminder_time: '18:00:00',
      };
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      return null;
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: {
      study_reminders?: boolean;
      exam_reminders?: boolean;
      booking_updates?: boolean;
      achievement_notifications?: boolean;
      weekly_reports?: boolean;
      reminder_time?: string;
    }
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: userId,
            ...preferences,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) throw error;

      console.log('✅ Notification preferences updated');
      return true;
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      return false;
    }
  }

  /**
   * Send exam reminder notification
   */
  async sendExamReminder(
    examName: string,
    examDate: Date,
    daysUntil: number
  ): Promise<boolean> {
    try {
      const locale = i18n.language === 'az' ? 'az-AZ' : i18n.language === 'ru' ? 'ru-RU' : 'en-US';
      const title = daysUntil === 0
        ? i18n.t('notifications.titles.examToday')
        : i18n.t('notifications.titles.examInDays', { count: daysUntil });

      const body = daysUntil === 0
        ? i18n.t('notifications.bodies.examToday', { exam: examName })
        : i18n.t('notifications.bodies.examInDays', { exam: examName, date: examDate.toLocaleDateString(locale) });

      return await this.sendImmediateNotification(title, body);
    } catch (error) {
      console.error('Error sending exam reminder:', error);
      return false;
    }
  }

  /**
   * Send booking update notification
   */
  async sendBookingUpdate(
    type: 'confirmed' | 'cancelled' | 'rescheduled',
    teacherName: string,
    dateTime: Date
  ): Promise<boolean> {
    try {
      const locale = i18n.language === 'az' ? 'az-AZ' : i18n.language === 'ru' ? 'ru-RU' : 'en-US';
      const dateTimeStr = dateTime.toLocaleString(locale);
      let title = '';
      let body = '';

      switch (type) {
        case 'confirmed':
          title = i18n.t('notifications.titles.bookingConfirmedLocal');
          body = i18n.t('notifications.bodies.bookingConfirmedLocal', { teacher: teacherName, dateTime: dateTimeStr });
          break;
        case 'cancelled':
          title = i18n.t('notifications.titles.bookingCancelledLocal');
          body = i18n.t('notifications.bodies.bookingCancelledLocal', { teacher: teacherName });
          break;
        case 'rescheduled':
          title = i18n.t('notifications.titles.bookingRescheduled');
          body = i18n.t('notifications.bodies.bookingRescheduled', { teacher: teacherName, dateTime: dateTimeStr });
          break;
      }

      return await this.sendImmediateNotification(title, body);
    } catch (error) {
      console.error('Error sending booking update:', error);
      return false;
    }
  }

  /**
   * Send achievement notification
   */
  async sendAchievementNotification(
    achievement: string,
    description: string
  ): Promise<boolean> {
    try {
      return await this.sendImmediateNotification(
        `🏆 ${achievement}`,
        description
      );
    } catch (error) {
      console.error('Error sending achievement notification:', error);
      return false;
    }
  }

  /**
   * Send new message notification
   */
  async sendMessageNotification(
    senderName: string,
    messagePreview: string
  ): Promise<boolean> {
    try {
      return await this.sendImmediateNotification(
        i18n.t('notifications.titles.messageFrom', { sender: senderName }),
        messagePreview
      );
    } catch (error) {
      console.error('Error sending message notification:', error);
      return false;
    }
  }

  /**
   * Send immediate notification
   */
  async sendImmediateNotification(title: string, body: string): Promise<boolean> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null, // Send immediately
      });

      console.log('✅ Immediate notification sent');
      return true;
    } catch (error) {
      console.error('Error sending immediate notification:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking notification status:', error);
      return false;
    }
  }

  /**
   * Get notification badge count
   */
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  /**
   * Set notification badge count
   */
  async setBadgeCount(count: number): Promise<boolean> {
    try {
      await Notifications.setBadgeCountAsync(count);
      return true;
    } catch (error) {
      console.error('Error setting badge count:', error);
      return false;
    }
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<boolean> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      await this.setBadgeCount(0);
      console.log('✅ All notifications cleared');
      return true;
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return false;
    }
  }

  // ============================================
  // PHASE 1: Goal-related notifications
  // ============================================

  /**
   * Send notification when daily goal is completed
   */
  async sendGoalCompletedNotification(
    questionsCompleted: number,
    timeSpentMinutes: number
  ): Promise<boolean> {
    try {
      return await this.sendImmediateNotification(
        '🎯 ' + i18n.t('goals.dailyGoalComplete', "Today's Goal Complete!"),
        i18n.t('goals.goalCompletedBody', 'Great job! You answered {{questions}} questions in {{time}} minutes today.', {
          questions: questionsCompleted,
          time: timeSpentMinutes,
        })
      );
    } catch (error) {
      console.error('Error sending goal completed notification:', error);
      return false;
    }
  }

  /**
   * Send notification for goal streak milestone
   */
  async sendGoalStreakNotification(streakDays: number): Promise<boolean> {
    try {
      if (streakDays < 3) return false; // Only notify for 3+ day streaks

      return await this.sendImmediateNotification(
        '🔥 ' + i18n.t('goals.streakTitle', '{{days}}-Day Goal Streak!', { days: streakDays }),
        i18n.t('goals.streakBody', "You've met your daily goals for {{days}} days in a row. Keep it up!", { days: streakDays })
      );
    } catch (error) {
      console.error('Error sending goal streak notification:', error);
      return false;
    }
  }

  /**
   * Schedule daily goal reminder based on student's preferred study time
   */
  async scheduleGoalReminder(
    preferredTime: 'morning' | 'afternoon' | 'evening' | 'night',
    preferredDays: number[]
  ): Promise<boolean> {
    try {
      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('⚠️ Notification permission not granted, skipping goal reminders');
        return false;
      }

      // Cancel existing scheduled notifications before re-scheduling
      await this.cancelAllReminders();

      const timeMap = {
        morning: { hour: 8, minute: 0 },
        afternoon: { hour: 13, minute: 0 },
        evening: { hour: 18, minute: 0 },
        night: { hour: 21, minute: 0 },
      };

      const { hour, minute } = timeMap[preferredTime];

      // Use WeeklyTriggerInput (cross-platform: works on both iOS and Android)
      // expo weekday: 1=Sunday, 2=Monday, ..., 7=Saturday
      // preferredDays uses 0=Sunday, 1=Monday, ..., 6=Saturday
      for (const day of preferredDays) {
        await this.scheduleNotification(
          '📚 ' + i18n.t('goals.reminderTitle', 'Time to Study!'),
          i18n.t('goals.reminderBody', "Don't forget your daily goal. Let's keep your streak going!"),
          {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            hour,
            minute,
            weekday: day + 1, // convert 0-6 to expo's 1-7
          },
          { type: 'study_reminder' }
        );
      }

      console.log(`✅ Goal reminders scheduled: ${preferredDays.length} days at ${hour}:${String(minute).padStart(2, '0')}`);
      return true;
    } catch (error) {
      console.error('Error scheduling goal reminders:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
