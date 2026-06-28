/**
 * Admin Notification Service
 * Stage 7: Notifications & Communication
 * 
 * Handles sending notifications from admin panel to users
 */

import { createClient } from '@/utils/supabase/client';

// Types
export interface NotificationTarget {
  type: 'all' | 'students' | 'teachers' | 'target_group' | 'individual';
  filter?: {
    target_group?: string;
    user_ids?: string[];
  };
}

export interface NotificationChannels {
  in_app: boolean;
  push: boolean;
  email: boolean;
}

export interface CreateNotificationParams {
  title: string;
  body: string;
  channels: NotificationChannels;
  target: NotificationTarget;
  scheduledAt?: Date | null;
}

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  channels: string[];
  target_type: string;
  target_filter: Record<string, any>;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  total_recipients: number;
  delivered_count: number;
  opened_count: number;
  failed_count: number;
  sent_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  admin_name?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  channels: string[];
  variables: string[];
  category: string;
  is_active: boolean;
  usage_count: number;
  created_at: string;
}

export interface NotificationStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_failed: number;
  delivery_rate: number;
  open_rate: number;
}

class AdminNotificationService {
  private supabase = createClient();

  /**
   * Get target count before sending
   */
  async getTargetCount(target: NotificationTarget): Promise<number> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_notification_target_count', {
        p_admin_id: user.id,
        p_target_type: target.type,
        p_target_filter: target.filter || {}
      });

      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error('Error getting target count:', error);
      throw error;
    }
  }

  /**
   * Send notification to users
   */
  async sendNotification(params: CreateNotificationParams): Promise<string> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Convert channels object to array
      const channelsArray: string[] = [];
      if (params.channels.in_app) channelsArray.push('in_app');
      if (params.channels.push) channelsArray.push('push');
      if (params.channels.email) channelsArray.push('email');

      if (channelsArray.length === 0) {
        throw new Error('At least one channel must be selected');
      }

      const { data, error } = await this.supabase.rpc('admin_send_notification', {
        p_admin_id: user.id,
        p_title: params.title,
        p_body: params.body,
        p_channels: channelsArray,
        p_target_type: params.target.type,
        p_target_filter: params.target.filter || {},
        p_scheduled_at: params.scheduledAt?.toISOString() || null
      });

      if (error) throw error;

      // If push notifications are enabled, trigger push sending
      if (params.channels.push && !params.scheduledAt) {
        await this.triggerPushNotifications(data, params.title, params.body, params.target);
      }

      return data;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Trigger push notifications via Expo
   */
  private async triggerPushNotifications(
    notificationId: string,
    title: string,
    body: string,
    target: NotificationTarget
  ): Promise<void> {
    try {
      // Get push tokens for target users
      const tokens = await this.getTargetPushTokens(target);
      
      if (tokens.length === 0) {
        return;
      }

      // Send via Expo Push API
      const messages = tokens.map(token => ({
        to: token.token,
        sound: 'default',
        title,
        body,
        data: { notificationId }
      }));

      // Batch send (Expo allows up to 100 per request)
      const batches = this.chunkArray(messages, 100);
      
      for (const batch of batches) {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch)
        });

        const result = await response.json();

        // Update recipient statuses based on response
        if (result.data) {
          for (let i = 0; i < result.data.length; i++) {
            const ticket = result.data[i];
            const userId = tokens[i]?.user_id;
            
            if (userId) {
              await this.supabase.rpc('update_notification_recipient_status', {
                p_user_id: userId,
                p_notification_id: notificationId,
                p_channel: 'push',
                p_status: ticket.status === 'ok' ? 'sent' : 'failed'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending push notifications:', error);
      // Don't throw - push failure shouldn't fail the whole operation
    }
  }

  /**
   * Get push tokens for target users
   */
  private async getTargetPushTokens(target: NotificationTarget): Promise<{ user_id: string; token: string }[]> {
    let query = this.supabase
      .from('push_tokens')
      .select('user_id, token');

    // Apply target filter
    if (target.type === 'individual' && target.filter?.user_ids) {
      query = query.in('user_id', target.filter.user_ids);
    } else if (target.type === 'students') {
      // Join with profiles to filter by user type
      const { data: studentIds } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'student');
      
      if (studentIds) {
        query = query.in('user_id', studentIds.map(s => s.id));
      }
    } else if (target.type === 'teachers') {
      const { data: teacherIds } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('user_type', 'teacher');
      
      if (teacherIds) {
        query = query.in('user_id', teacherIds.map(t => t.id));
      }
    } else if (target.type === 'target_group' && target.filter?.target_group) {
      const { data: groupStudents } = await this.supabase
        .from('students')
        .select('user_id')
        .eq('target_group', target.filter.target_group);
      
      if (groupStudents) {
        query = query.in('user_id', groupStudents.map(s => s.user_id));
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get notification history
   */
  async getNotifications(
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AdminNotification[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_notifications', {
        p_admin_id: user.id,
        p_status: status || null,
        p_limit: limit,
        p_offset: offset
      });

      if (error) throw error;
      
      // Map the prefixed column names from the RPC function to the interface
      return (data || []).map((row: any) => ({
        id: row.notification_id,
        title: row.notification_title,
        body: row.notification_body,
        channels: row.notification_channels,
        target_type: row.notification_target_type,
        target_filter: row.notification_target_filter,
        status: row.notification_status,
        total_recipients: row.notification_total_recipients,
        delivered_count: row.notification_delivered_count,
        opened_count: row.notification_opened_count,
        failed_count: row.notification_failed_count,
        sent_at: row.notification_sent_at,
        scheduled_at: row.notification_scheduled_at,
        created_at: row.notification_created_at,
        admin_name: row.admin_name
      }));
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification details
   */
  async getNotificationDetails(notificationId: string): Promise<AdminNotification | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_notification_details', {
        p_admin_id: user.id,
        p_notification_id: notificationId
      });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error getting notification details:', error);
      throw error;
    }
  }

  /**
   * Get notification templates
   */
  async getTemplates(category?: string): Promise<NotificationTemplate[]> {
    try {
      let query = this.supabase
        .from('notification_templates')
        .select('*')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'created_at' | 'usage_count'>): Promise<NotificationTemplate> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase
        .from('notification_templates')
        .insert({
          ...template,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(id: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    try {
      const { data, error } = await this.supabase
        .from('notification_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notification_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getStats(): Promise<NotificationStats> {
    try {
      const { data, error } = await this.supabase
        .from('admin_notifications')
        .select('total_recipients, delivered_count, opened_count, failed_count')
        .eq('status', 'sent');

      if (error) throw error;

      const totals = (data || []).reduce((acc, n) => ({
        total_sent: acc.total_sent + (n.total_recipients || 0),
        total_delivered: acc.total_delivered + (n.delivered_count || 0),
        total_opened: acc.total_opened + (n.opened_count || 0),
        total_failed: acc.total_failed + (n.failed_count || 0)
      }), { total_sent: 0, total_delivered: 0, total_opened: 0, total_failed: 0 });

      return {
        ...totals,
        delivery_rate: totals.total_sent > 0 
          ? Math.round((totals.total_delivered / totals.total_sent) * 100) 
          : 0,
        open_rate: totals.total_delivered > 0 
          ? Math.round((totals.total_opened / totals.total_delivered) * 100) 
          : 0
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_failed: 0,
        delivery_rate: 0,
        open_rate: 0
      };
    }
  }

  /**
   * Helper: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Replace template variables with actual values
   */
  replaceVariables(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }
}

export const adminNotificationService = new AdminNotificationService();
