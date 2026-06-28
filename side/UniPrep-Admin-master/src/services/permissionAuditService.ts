/**
 * Permission Audit Service
 * Phase 6: Audit Enhancement
 * 
 * Logs permission denials and unauthorized access attempts
 */

import { supabase } from '@/lib/supabase';
import { AdminRole } from '@/middleware/roleGuard';

export interface PermissionDenialLog {
  adminId?: string;
  userId?: string;
  resource: string;
  action: string;
  requiredRole: AdminRole;
  actualRole?: AdminRole;
  reason: string;
  metadata?: Record<string, any>;
}

export const permissionAuditService = {
  /**
   * Log a permission denial event
   */
  async logPermissionDenial(log: PermissionDenialLog): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('audit_logs').insert({
        admin_id: log.adminId || null,
        action_type: 'PERMISSION_DENIED',
        table_name: log.resource,
        description: `Permission denied: ${log.action} - ${log.reason}`,
        old_values: null,
        new_values: {
          attempted_action: log.action,
          required_role: log.requiredRole,
          actual_role: log.actualRole || 'none',
          resource: log.resource,
          reason: log.reason,
          user_id: log.userId || user?.id,
          ...log.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to log permission denial:', error);
    }
  },

  /**
   * Log unauthorized page access attempt
   */
  async logUnauthorizedPageAccess(
    pagePath: string,
    requiredRoles: AdminRole[],
    actualRole?: AdminRole
  ): Promise<void> {
    await this.logPermissionDenial({
      resource: 'page_access',
      action: `Access page: ${pagePath}`,
      requiredRole: requiredRoles[0],
      actualRole,
      reason: `User role "${actualRole || 'none'}" not in allowed roles: ${requiredRoles.join(', ')}`,
      metadata: {
        page_path: pagePath,
        allowed_roles: requiredRoles,
      },
    });
  },

  /**
   * Log unauthorized API access attempt
   */
  async logUnauthorizedApiAccess(
    endpoint: string,
    method: string,
    requiredRole: AdminRole,
    actualRole?: AdminRole
  ): Promise<void> {
    await this.logPermissionDenial({
      resource: 'api_access',
      action: `${method} ${endpoint}`,
      requiredRole,
      actualRole,
      reason: `Insufficient permissions for API endpoint`,
      metadata: {
        endpoint,
        method,
      },
    });
  },

  /**
   * Log unauthorized action attempt (e.g., edit, delete)
   */
  async logUnauthorizedAction(
    action: string,
    targetType: string,
    targetId?: string,
    requiredRole?: AdminRole,
    actualRole?: AdminRole
  ): Promise<void> {
    await this.logPermissionDenial({
      resource: targetType,
      action,
      requiredRole: requiredRole || 'admin',
      actualRole,
      reason: `User attempted unauthorized action`,
      metadata: {
        target_id: targetId,
        target_type: targetType,
      },
    });
  },

  /**
   * Log role hierarchy violation (e.g., admin trying to manage another admin)
   */
  async logRoleHierarchyViolation(
    action: string,
    targetRole: AdminRole,
    actualRole: AdminRole,
    targetId?: string
  ): Promise<void> {
    await this.logPermissionDenial({
      resource: 'role_hierarchy',
      action,
      requiredRole: 'super_admin',
      actualRole,
      reason: `Cannot manage user with role "${targetRole}" - requires higher role level`,
      metadata: {
        target_role: targetRole,
        target_id: targetId,
      },
    });
  },

  /**
   * Get permission denial logs for review
   */
  async getPermissionDenialLogs(options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('action_type', 'PERMISSION_DENIED')
        .order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }
      if (options?.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }
      if (options?.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching permission denial logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Exception fetching permission denial logs:', error);
      return [];
    }
  },

  /**
   * Get permission denial statistics
   */
  async getPermissionDenialStats(days: number = 30): Promise<{
    total: number;
    byResource: Record<string, number>;
    byRole: Record<string, number>;
    recentAttempts: number;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action_type', 'PERMISSION_DENIED')
        .gte('created_at', startDate.toISOString());

      if (error || !data) {
        return { total: 0, byResource: {}, byRole: {}, recentAttempts: 0 };
      }

      const byResource: Record<string, number> = {};
      const byRole: Record<string, number> = {};

      data.forEach((log: any) => {
        // Count by resource
        const resource = log.table_name || 'unknown';
        byResource[resource] = (byResource[resource] || 0) + 1;

        // Count by role
        const role = log.new_values?.actual_role || 'unknown';
        byRole[role] = (byRole[role] || 0) + 1;
      });

      // Recent attempts (last 24 hours)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const recentAttempts = data.filter(
        (log: any) => new Date(log.created_at) > yesterday
      ).length;

      return {
        total: data.length,
        byResource,
        byRole,
        recentAttempts,
      };
    } catch (error) {
      console.error('Error getting permission denial stats:', error);
      return { total: 0, byResource: {}, byRole: {}, recentAttempts: 0 };
    }
  },
};
