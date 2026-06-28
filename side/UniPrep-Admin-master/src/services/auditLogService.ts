/**
 * Audit Log Service
 * Stage 8: Audit & Logs
 * 
 * Handles querying and exporting audit logs
 */

import { createClient } from '@/utils/supabase/client';

// Types
export interface AuditLog {
  log_id: string;
  admin_id: string;
  admin_email: string;
  admin_name: string;
  action_type: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  log_timestamp: string;
  total_count: number;
}

export interface AuditLogDetail extends Omit<AuditLog, 'total_count'> {
  changes: Array<{
    field: string;
    old_value: unknown;
    new_value: unknown;
  }> | null;
}

export interface AuditLogFilters {
  adminId?: string;
  actionType?: string;
  tableName?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface AuditStats {
  total_logs: number;
  logs_today: number;
  logs_this_week: number;
  logs_this_month: number;
  by_action_type: Record<string, number>;
  by_table: Record<string, number>;
  by_admin: Array<{
    admin_id: string;
    admin_name: string;
    count: number;
  }>;
  daily_activity: Array<{
    date: string;
    count: number;
  }>;
}

export interface FilterOptions {
  action_types: string[];
  table_names: string[];
  admins: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

// Valid action types that match the database constraint
// These are the ONLY values allowed in the admin_audit_log.action_type column
export const ValidDbActionTypes = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE', 
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  RESET_LEADERBOARD: 'RESET_LEADERBOARD',
  ARCHIVE_SEASON: 'ARCHIVE_SEASON',
  ADJUST_SCORE: 'ADJUST_SCORE',
  SEND_NOTIFICATION: 'SEND_NOTIFICATION',
  EXPORT_DATA: 'EXPORT_DATA',
  SYSTEM_CONFIG: 'SYSTEM_CONFIG',
} as const;

export type ValidDbActionType = typeof ValidDbActionTypes[keyof typeof ValidDbActionTypes];

// Semantic action types for code clarity - these map to valid DB types
// The specific action is stored in the description/metadata
export const AuditActionTypes = {
  // User Management (maps to CREATE/UPDATE/DELETE/LOGIN/LOGOUT)
  USER_LOGIN: 'LOGIN',
  USER_LOGOUT: 'LOGOUT',
  USER_CREATE: 'CREATE',
  USER_UPDATE: 'UPDATE',
  USER_DELETE: 'DELETE',
  USER_SUSPEND: 'UPDATE',
  USER_ACTIVATE: 'UPDATE',
  PASSWORD_RESET: 'UPDATE',
  
  // Content Management (maps to CREATE/UPDATE/DELETE)
  QUESTION_CREATE: 'CREATE',
  QUESTION_UPDATE: 'UPDATE',
  QUESTION_DELETE: 'DELETE',
  QUESTION_BULK_IMPORT: 'CREATE',
  EXAM_CREATE: 'CREATE',
  EXAM_UPDATE: 'UPDATE',
  EXAM_DELETE: 'DELETE',
  EXAM_PUBLISH: 'UPDATE',
  EXAM_UNPUBLISH: 'UPDATE',
  SUBJECT_CREATE: 'CREATE',
  SUBJECT_UPDATE: 'UPDATE',
  SUBJECT_DELETE: 'DELETE',
  TOPIC_CREATE: 'CREATE',
  TOPIC_UPDATE: 'UPDATE',
  TOPIC_DELETE: 'DELETE',
  
  // System Settings (maps to SYSTEM_CONFIG/UPDATE)
  SETTINGS_UPDATE: 'SYSTEM_CONFIG',
  FEATURE_FLAG_UPDATE: 'SYSTEM_CONFIG',
  MAINTENANCE_MODE_ON: 'SYSTEM_CONFIG',
  MAINTENANCE_MODE_OFF: 'SYSTEM_CONFIG',
  APP_VERSION_CREATE: 'CREATE',
  APP_VERSION_UPDATE: 'UPDATE',
  
  // Reports & Analytics (maps to EXPORT_DATA)
  REPORT_GENERATE: 'EXPORT_DATA',
  REPORT_EXPORT: 'EXPORT_DATA',
  ANALYTICS_VIEW: 'EXPORT_DATA',
  
  // Moderation (maps to UPDATE)
  REVIEW_APPROVE: 'UPDATE',
  REVIEW_REJECT: 'UPDATE',
  CONTENT_FLAG: 'UPDATE',
  CONTENT_UNFLAG: 'UPDATE',
  
  // Messaging (maps to SEND_NOTIFICATION/CREATE/UPDATE/DELETE)
  ANNOUNCEMENT_CREATE: 'CREATE',
  ANNOUNCEMENT_UPDATE: 'UPDATE',
  ANNOUNCEMENT_DELETE: 'DELETE',
  NOTIFICATION_SEND: 'SEND_NOTIFICATION',
  
  // Exam Groups (Stage 9.1)
  EXAM_GROUP_UPDATE: 'UPDATE',
  EXAM_GROUP_SUBJECT_ADD: 'CREATE',
  EXAM_GROUP_SUBJECT_UPDATE: 'UPDATE',
  EXAM_GROUP_SUBJECT_DELETE: 'DELETE',
} as const;

export type AuditActionType = typeof AuditActionTypes[keyof typeof AuditActionTypes];

class AuditLogService {
  private supabase = createClient();

  /**
   * Log an admin action
   * Call this from any admin page when an action is performed
   * 
   * Note: Uses the original log_admin_action function from Stage 1 which has:
   * - p_action_type, p_table_name, p_record_id, p_old_values, p_new_values, 
   *   p_ip_address, p_user_agent, p_admin_id (optional, last param)
   * 
   * The description and metadata are merged into old_values for storage.
   */
  async logAction(params: {
    actionType: AuditActionType | string;
    tableName: string;
    recordId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        console.warn('Cannot log action: No authenticated user');
        return null;
      }

      // Merge description and metadata into old_values for storage
      // This allows us to store additional context without changing the DB schema
      const enrichedOldValues = {
        ...params.oldValues,
        ...(params.description ? { _description: params.description } : {}),
        ...(params.metadata ? { _metadata: params.metadata } : {}),
      };

      // Use the original Stage 1 function signature
      const { data, error } = await this.supabase.rpc('log_admin_action', {
        p_action_type: params.actionType,
        p_table_name: params.tableName,
        p_record_id: params.recordId || null,
        p_old_values: Object.keys(enrichedOldValues).length > 0 ? enrichedOldValues : null,
        p_new_values: params.newValues || null,
        p_ip_address: null,
        p_user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
        p_admin_id: user.id,
      });

      if (error) {
        console.error('Error logging action:', error);
        return null;
      }

      return data as string;
    } catch (error) {
      console.error('Error logging action:', error);
      return null;
    }
  }

  /**
   * Get audit logs with filters and pagination
   */
  async getAuditLogs(
    filters: AuditLogFilters = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ logs: AuditLog[]; total: number }> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const offset = (page - 1) * pageSize;

      const { data, error } = await this.supabase.rpc('admin_get_audit_logs', {
        p_admin_id: user.id,
        p_filter_admin_id: filters.adminId || null,
        p_action_type: filters.actionType || null,
        p_table_name: filters.tableName || null,
        p_search: filters.search || null,
        p_start_date: filters.startDate?.toISOString() || null,
        p_end_date: filters.endDate?.toISOString() || null,
        p_limit: pageSize,
        p_offset: offset
      });

      if (error) throw error;

      const logs = data as AuditLog[];
      const total = logs.length > 0 ? logs[0].total_count : 0;

      return { logs, total };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit log statistics
   */
  async getStats(days: number = 30): Promise<AuditStats> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_audit_stats', {
        p_admin_id: user.id,
        p_days: days
      });

      if (error) throw error;
      return data as AuditStats;
    } catch (error) {
      console.error('Error fetching audit stats:', error);
      throw error;
    }
  }

  /**
   * Get single audit log detail
   */
  async getLogDetail(logId: string): Promise<AuditLogDetail> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_audit_log_detail', {
        p_admin_id: user.id,
        p_log_id: logId
      });

      if (error) throw error;
      return data as AuditLogDetail;
    } catch (error) {
      console.error('Error fetching audit log detail:', error);
      throw error;
    }
  }

  /**
   * Get filter options (action types, tables, admins)
   */
  async getFilterOptions(): Promise<FilterOptions> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await this.supabase.rpc('admin_get_audit_filter_options', {
        p_admin_id: user.id
      });

      if (error) throw error;
      return data as FilterOptions;
    } catch (error) {
      console.error('Error fetching filter options:', error);
      return {
        action_types: [],
        table_names: [],
        admins: []
      };
    }
  }

  /**
   * Export audit logs to CSV
   */
  async exportToCSV(filters: AuditLogFilters = {}): Promise<string> {
    try {
      // Get all logs matching filters (up to 10000)
      const { logs } = await this.getAuditLogs(filters, 1, 10000);

      // CSV headers
      const headers = [
        'ID',
        'Timestamp',
        'Admin Email',
        'Admin Name',
        'Action Type',
        'Table Name',
        'Record ID',
        'IP Address',
        'User Agent',
        'Old Values',
        'New Values'
      ];

      // CSV rows
      const rows = logs.map(log => [
        log.log_id,
        new Date(log.log_timestamp).toISOString(),
        log.admin_email || '',
        log.admin_name || '',
        log.action_type,
        log.table_name || '',
        log.record_id || '',
        log.ip_address || '',
        log.user_agent || '',
        JSON.stringify(log.old_values || {}),
        JSON.stringify(log.new_values || {})
      ]);

      // Build CSV string
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw error;
    }
  }

  /**
   * Export audit logs to JSON
   */
  async exportToJSON(filters: AuditLogFilters = {}): Promise<string> {
    try {
      const { logs } = await this.getAuditLogs(filters, 1, 10000);
      return JSON.stringify(logs, null, 2);
    } catch (error) {
      console.error('Error exporting to JSON:', error);
      throw error;
    }
  }

  /**
   * Download export file
   */
  downloadFile(content: string, filename: string, type: 'csv' | 'json'): void {
    const mimeType = type === 'csv' ? 'text/csv' : 'application/json';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const auditLogService = new AuditLogService();
export default auditLogService;
