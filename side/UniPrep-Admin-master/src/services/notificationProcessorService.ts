/**
 * Notification Processor Service
 * Phase 2: Event-Driven Notifications
 * 
 * Background service that processes the notification queue and delivers notifications.
 * Features:
 * - Poll notification queue by priority
 * - Process pending and scheduled notifications
 * - Send via appropriate channels (push, in-app, email)
 * - Handle failures and retries
 * - Track delivery analytics
 * - Clean up old notifications
 */

import { createClient } from '@supabase/supabase-js';
import { notificationEmailService } from './notificationEmailService';
import { getNotificationTranslation, type SupportedLanguage } from '@/lib/i18n/notificationTranslations';

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface QueuedNotification {
  id: string;
  user_id: string;
  notification_type: string;
  priority: number;
  channels: string[];
  title: string;
  body: string;
  data: any;
  scheduled_at: string | null;
  retry_count: number;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  idempotency_key?: string;  // Industry standard: prevents duplicate notifications
}

interface PushToken {
  token: string;
  platform: string;
  device_name: string;
}

class NotificationProcessorService {
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  /**
   * Start the notification processor
   */
  start(intervalMs: number = 30000) {
    if (this.processingInterval) {
      return;
    }

    
    // Process immediately
    this.processQueue();

    // Then process at intervals
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, intervalMs);

  }

  /**
   * Stop the notification processor
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Process the notification queue
   */
  private async processQueue() {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      // Get pending notifications
      const notifications = await this.getPendingNotifications(10);

      if (notifications.length === 0) {
        return;
      }


      // Process each notification
      for (const notification of notifications) {
        await this.processNotification(notification);
      }

    } catch (error) {
      console.error('❌ Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get pending notifications from queue
   * CRITICAL: Uses atomic claim to prevent race conditions and duplicate processing
   * This fetches AND marks as 'processing' in a single operation
   */
  private async getPendingNotifications(limit: number = 10): Promise<QueuedNotification[]> {
    try {
      const now = new Date().toISOString();

      // CRITICAL FIX: Atomically claim notifications using RPC function
      // This prevents race conditions where multiple processor instances
      // could pick up the same notification
      const { data, error } = await supabase.rpc('claim_pending_notifications', {
        p_limit: limit,
        p_processor_id: this.getProcessorId()
      });

      if (error) {
        // Fallback to old method if RPC doesn't exist (for backwards compatibility)
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          console.warn('claim_pending_notifications RPC not found, using fallback method');
          return await this.getPendingNotificationsFallback(limit);
        }
        throw error;
      }
      
      return data || [];
    } catch (error) {
      console.error('Error fetching pending notifications:', error);
      return [];
    }
  }

  /**
   * Fallback method for getting pending notifications (non-atomic)
   * Used when the RPC function is not available
   */
  private async getPendingNotificationsFallback(limit: number = 10): Promise<QueuedNotification[]> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('status', 'pending')
        .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('Error fetching pending notifications (fallback):', error);
      return [];
    }
  }

  /**
   * Get a unique processor ID for this instance
   */
  private getProcessorId(): string {
    if (!this.processorId) {
      this.processorId = `processor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this.processorId;
  }

  private processorId: string | null = null;

  /**
   * Process a single notification
   */
  private async processNotification(notification: QueuedNotification) {
    try {

      // ✨ PHASE 6: Check smart features before sending
      // IMPORTANT: Requires 06_smart_features.sql to be run first
      const ENABLE_SMART_FEATURES = true; // Set to false to bypass smart features
      
      if (ENABLE_SMART_FEATURES) {
        const canSend = await this.checkSmartFeatures(notification);
        
        if (!canSend.allowed) {
          await this.updateNotificationStatus(notification.id, 'cancelled');
          return;
        }
      }

      // Note: Notification is already marked as 'processing' by claim_pending_notifications RPC
      // For fallback method, mark as processing here
      if (notification.status === 'pending') {
        await this.updateNotificationStatus(notification.id, 'processing');
      }

      // Send via each channel
      const results = await Promise.allSettled(
        notification.channels.map(channel =>
          this.sendViaChannel(notification, channel)
        )
      );

      // Check if all succeeded
      const allSucceeded = results.every(r => r.status === 'fulfilled');

      if (allSucceeded) {
        // Mark as sent
        await this.updateNotificationStatus(notification.id, 'sent');
      } else {
        // Handle partial or complete failure
        const failedChannels = results
          .map((r, i) => (r.status === 'rejected' ? notification.channels[i] : null))
          .filter(Boolean);

        console.error(`❌ Failed channels for ${notification.id}:`, failedChannels);

        // Retry logic
        if (notification.retry_count < 3) {
          await this.markForRetry(notification.id, notification.retry_count + 1);
        } else {
          await this.updateNotificationStatus(notification.id, 'failed');
        }
      }
    } catch (error) {
      console.error(`Error processing notification ${notification.id}:`, error);
      
      // Mark for retry or failed
      if (notification.retry_count < 3) {
        await this.markForRetry(notification.id, notification.retry_count + 1);
      } else {
        await this.updateNotificationStatus(notification.id, 'failed');
      }
    }
  }

  /**
   * Send notification via specific channel
   */
  private async sendViaChannel(notification: QueuedNotification, channel: string): Promise<void> {
    switch (channel) {
      case 'in_app':
        return await this.sendInApp(notification);
      case 'push':
        return await this.sendPush(notification);
      case 'email':
        return await this.sendEmail(notification);
      case 'sms':
        return await this.sendSMS(notification);
      default:
        console.warn(`Unknown channel: ${channel}`);
    }
  }

  /**
   * Get user's language preference
   */
  private async getUserLanguage(userId: string): Promise<SupportedLanguage> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('language')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data?.language) {
        return 'en'; // Default to English
      }

      // Validate language is supported
      const supportedLanguages: SupportedLanguage[] = ['en', 'az', 'ru'];
      return supportedLanguages.includes(data.language) ? data.language : 'en';
    } catch (error) {
      console.error('Error getting user language:', error);
      return 'en';
    }
  }

  /**
   * Translate notification based on user language
   */
  private async translateNotification(notification: QueuedNotification) {
    const userLanguage = await this.getUserLanguage(notification.user_id);
    
    // Extract variables from notification data
    const variables: Record<string, string> = {};
    if (notification.data) {
      // Common variables
      if (notification.data.teacher_name) variables.teacherName = notification.data.teacher_name;
      if (notification.data.student_name) variables.studentName = notification.data.student_name;
      if (notification.data.scheduled_date) variables.scheduledDate = notification.data.scheduled_date;
      if (notification.data.minutes_before) variables.minutesBefore = notification.data.minutes_before.toString();
      if (notification.data.achievement_name) variables.achievementName = notification.data.achievement_name;
      if (notification.data.points) variables.points = notification.data.points.toString();
      if (notification.data.days_until) variables.daysUntil = notification.data.days_until.toString();
      if (notification.data.exam_date) variables.examDate = notification.data.exam_date;
      if (notification.data.sender_name) variables.senderName = notification.data.sender_name;
      if (notification.data.message_preview) variables.messagePreview = notification.data.message_preview;
      if (notification.data.reviewer_name) variables.reviewerName = notification.data.reviewer_name;
      if (notification.data.rating) variables.rating = notification.data.rating.toString();
      if (notification.data.cancellation_reason) variables.cancellationReason = notification.data.cancellation_reason;
      if (notification.data.cancelled_by) variables.cancelledBy = notification.data.cancelled_by;
      
      // Fallback to original title/body if no translation key
      variables.title = notification.title;
      variables.body = notification.body;
    }

    // Get translated content
    const translated = getNotificationTranslation(
      notification.notification_type,
      userLanguage,
      variables
    );

    return {
      title: translated.title,
      body: translated.body,
      emailSubject: translated.emailSubject,
      language: userLanguage,
    };
  }

  /**
   * Send in-app notification
   * INDUSTRY STANDARD: Uses idempotency_key to prevent duplicate notifications
   */
  private async sendInApp(notification: QueuedNotification): Promise<void> {
    try {
      // Translate notification to user's language
      const translated = await this.translateNotification(notification);

      // Use idempotency_key from queue if available (set by SQL trigger)
      // Otherwise generate one based on queue notification id
      const idempotencyKey = notification.idempotency_key 
        ? `${notification.idempotency_key}:in_app`
        : `${notification.id}:in_app`;

      // First check if notification already exists (prevents duplicates)
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing) {
        // Already sent, skip silently (this is expected behavior for idempotency)
        return;
      }

      // Map raw notification_type to allowed DB type values
      // The notifications.type CHECK constraint only allows:
      // 'exam', 'booking', 'achievement', 'reminder', 'general', 'announcement', 'payment', 'message'
      const dbType = this.mapNotificationType(notification.notification_type);

      const { error } = await supabase.from('notifications').insert({
        user_id: notification.user_id,
        title: translated.title,
        body: translated.body,
        type: dbType,
        data: { ...notification.data, notification_subtype: notification.notification_type },
        priority: notification.priority,
        action_url: notification.data?.action_url,
        action_data: notification.data,
        is_read: false,
        idempotency_key: idempotencyKey,
      });

      // Handle duplicate key error gracefully (race condition safety)
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          // Duplicate - this is fine, notification was already sent
          return;
        }
        throw error;
      }

      // Track analytics
      await this.trackDelivery(notification.id, notification.user_id, 'in_app');
    } catch (error) {
      console.error('Error sending in-app notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification
   * INDUSTRY STANDARD: Uses idempotency tracking to prevent duplicate push notifications
   * Key insight: We INSERT the deduplication record BEFORE sending, not after.
   * This prevents race conditions where multiple processors try to send simultaneously.
   */
  private async sendPush(notification: QueuedNotification): Promise<void> {
    try {
      // Use idempotency_key from queue if available (set by SQL trigger)
      // Otherwise generate one based on queue notification id
      const pushIdempotencyKey = notification.idempotency_key 
        ? `${notification.idempotency_key}:push`
        : `${notification.id}:push`;

      // INDUSTRY STANDARD: Try to INSERT first (atomic claim)
      // If insert succeeds, we own this notification and can send it
      // If insert fails (duplicate), another processor already sent it
      const { error: insertError } = await supabase
        .from('notification_deduplication')
        .insert({
          user_id: notification.user_id,
          notification_hash: pushIdempotencyKey,
          notification_type: notification.notification_type,
          title: notification.title,
          body: notification.body,
        });

      // If insert failed due to duplicate key, skip sending
      if (insertError) {
        if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
          // Another processor already claimed this notification
          return;
        }
        // For other errors, log but continue (fail open for notifications)
        console.warn('Push deduplication insert warning:', insertError.message);
      }

      // Get user's push tokens
      const tokens = await this.getUserPushTokens(notification.user_id);

      if (tokens.length === 0) {
        return;
      }

      // Translate notification to user's language
      const translated = await this.translateNotification(notification);

      // Send to Expo Push API
      const messages = tokens.map(token => ({
        to: token.token,
        sound: 'default',
        title: translated.title,
        body: translated.body,
        data: notification.data,
        priority: notification.priority >= 8 ? 'high' : 'default',
        badge: 1,
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Expo Push API error: ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      
      // Handle invalid tokens and update usage (Phase 6)
      if (result.data) {
        for (let i = 0; i < result.data.length; i++) {
          const pushResult = result.data[i];
          if (pushResult.status === 'error') {
            if (pushResult.details?.error === 'DeviceNotRegistered') {
              // Mark token as invalid
              await this.markTokenInvalid(tokens[i].token);
            }
            // Update token usage (failure)
            await this.updateTokenUsage(tokens[i].token, false);
          } else if (pushResult.status === 'ok') {
            // Update token usage (success)
            await this.updateTokenUsage(tokens[i].token, true);
          }
        }
      }

      // Track analytics
      await this.trackDelivery(notification.id, notification.user_id, 'push');
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(notification: QueuedNotification): Promise<void> {
    try {
      // Get user profile with email
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', notification.user_id)
        .single();

      if (error || !profile) {
        return;
      }

      // Get user's auth email from auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(notification.user_id);

      if (authError || !authUser?.user?.email) {
        return;
      }

      // Translate notification to user's language
      const translated = await this.translateNotification(notification);

      // Send email using notification email service
      const result = await notificationEmailService.sendNotificationEmail({
        to: authUser.user.email,
        userName: profile.full_name || 'User',
        notificationType: notification.notification_type,
        title: translated.title,
        body: translated.body,
        data: notification.data,
        emailSubject: translated.emailSubject,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      // Track analytics
      await this.trackDelivery(notification.id, notification.user_id, 'email');
    } catch (error) {
      console.error('Error sending email notification:', error);
      throw error;
    }
  }

  /**
   * Map raw notification_type to allowed DB type values.
   * The notifications.type CHECK constraint only allows:
   * 'exam', 'booking', 'achievement', 'reminder', 'general', 'announcement', 'payment', 'message'
   */
  private mapNotificationType(notificationType: string): string {
    // Payment-related types
    if (['booking_accepted_payment_required', 'payment_succeeded', 'payment_received', 'payment_failed', 'refund_processed'].includes(notificationType)) {
      return 'payment';
    }
    // Booking-related types
    if (['booking_confirmed', 'booking_cancelled', 'booking_reminder_24h', 'booking_reminder_1h', 'booking_reminder_15min', 'new_booking_request'].includes(notificationType)) {
      return 'booking';
    }
    // Message types
    if (notificationType === 'new_message') {
      return 'message';
    }
    // Achievement types
    if (['goal_streak', 'achievement_unlocked'].includes(notificationType)) {
      return 'achievement';
    }
    // Reminder types
    if (['goal_reminder', 'study_reminder', 'exam_reminder'].includes(notificationType)) {
      return 'reminder';
    }
    // Exam types
    if (notificationType.startsWith('exam')) {
      return 'exam';
    }
    // Announcement types
    if (notificationType === 'announcement' || notificationType === 'marketing') {
      return 'announcement';
    }
    // Default fallback
    return 'general';
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(notification: QueuedNotification): Promise<void> {
    // SMS implementation placeholder - will be added in future phase
  }

  /**
   * Get user's push tokens
   */
  private async getUserPushTokens(userId: string): Promise<PushToken[]> {
    try {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('token, platform, device_name')
        .eq('user_id', userId)
        .eq('is_valid', true);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching push tokens:', error);
      return [];
    }
  }

  /**
   * Check smart features (Phase 6)
   * Rate limiting, deduplication, user preferences, quiet hours
   * 
   * NOTE: This requires 06_smart_features.sql to be run first.
   * If the function doesn't exist, we allow all notifications by default.
   */
  private async checkSmartFeatures(notification: QueuedNotification): Promise<{ allowed: boolean; reason: string }> {
    try {
      const { data, error } = await supabase.rpc('can_send_smart_notification', {
        p_user_id: notification.user_id,
        p_notification_type: notification.notification_type,
        p_title: notification.title,
        p_body: notification.body,
        p_max_per_hour: 50,  // Increased from 10 to 50 for production use
        p_check_duplicates: true
      });

      if (error) {
        
        // If function doesn't exist (42883 = undefined_function), allow by default
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          return { allowed: true, reason: 'Smart features not installed' };
        }
        console.error('      ❌ Unexpected error, allowing by default');
        return { allowed: true, reason: 'Check failed, allowing by default' };
      }


      if (!data || data.length === 0) {
        return { allowed: true, reason: 'No data returned' };
      }


      return {
        allowed: data[0].can_send,
        reason: data[0].reason
      };
    } catch (error) {
      console.error('      💥 Exception in checkSmartFeatures:', error);
      return { allowed: true, reason: 'Exception occurred, allowing by default' };
    }
  }

  /**
   * Update token usage after push delivery (Phase 6)
   */
  private async updateTokenUsage(token: string, success: boolean): Promise<void> {
    try {
      await supabase.rpc('update_token_usage', {
        p_token: token,
        p_success: success
      });
    } catch (error) {
      console.error('Error updating token usage:', error);
    }
  }

  /**
   * Mark push token as invalid
   */
  private async markTokenInvalid(token: string): Promise<void> {
    try {
      await supabase
        .from('push_tokens')
        .update({ 
          is_valid: false,
          failure_count: supabase.rpc('increment', { x: 1 })
        })
        .eq('token', token);
    } catch (error) {
      console.error('Error marking token invalid:', error);
    }
  }

  /**
   * Update notification status
   */
  private async updateNotificationStatus(
    notificationId: string,
    status: 'processing' | 'sent' | 'failed' | 'cancelled'
  ): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .update({
          status,
          processed_at: status !== 'processing' ? new Date().toISOString() : null,
        })
        .eq('id', notificationId)
        .select();

      if (error) {
        console.error(`❌ Failed to update notification ${notificationId} to ${status}:`, error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error(`⚠️ Notification ${notificationId} not found in queue`);
        throw new Error('Notification not found');
      }

    } catch (error) {
      console.error('Error updating notification status:', error);
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Mark notification for retry
   */
  private async markForRetry(notificationId: string, retryCount: number): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .update({
          status: 'pending',
          retry_count: retryCount,
          scheduled_at: new Date(Date.now() + retryCount * 60000).toISOString(), // Exponential backoff
        })
        .eq('id', notificationId)
        .select();

      if (error) {
        console.error(`❌ Failed to mark notification ${notificationId} for retry:`, error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error(`⚠️ Notification ${notificationId} not found for retry`);
        throw new Error('Notification not found');
      }

    } catch (error) {
      console.error('Error marking for retry:', error);
      throw error;
    }
  }

  /**
   * Track delivery analytics
   */
  private async trackDelivery(
    notificationId: string,
    userId: string,
    channel: string
  ): Promise<void> {
    try {
      await supabase.from('notification_analytics').insert({
        notification_id: notificationId,
        user_id: userId,
        event_type: 'delivered',
        channel: channel,
      });
    } catch (error) {
      console.error('Error tracking delivery:', error);
    }
  }

  /**
   * Clean up old processed notifications
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('notification_queue')
        .delete()
        .in('status', ['sent', 'failed', 'cancelled'])
        .lt('processed_at', cutoffDate.toISOString())
        .select('id');

      if (error) throw error;
      
      const count = data?.length || 0;
      return count;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return 0;
    }
  }
}

export const notificationProcessorService = new NotificationProcessorService();
