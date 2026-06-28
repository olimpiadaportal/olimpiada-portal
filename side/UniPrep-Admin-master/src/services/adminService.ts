import { supabase } from '@/lib/supabase';
import type { Admin, AdminDetail, AuditLog, AdminRole } from '@/types';

// ============================================
// TYPES
// ============================================

interface SearchAdminsParams {
  query?: string | null;
  role?: AdminRole | null;
  isActive?: boolean | null;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

interface SearchAdminsResult {
  admins: Admin[];
  totalCount: number;
}

interface CreateAdminParams {
  email: string;
  fullName: string;
  role?: AdminRole;
  createdByAdminId?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ============================================
// ADMIN SERVICE
// ============================================

export const adminService = {
  /**
   * Search admins with filters and pagination
   */
  async searchAdmins(params: SearchAdminsParams): Promise<ApiResponse<SearchAdminsResult>> {
    try {
      const {
        query = null,
        role = null,
        isActive = null,
        sortBy = 'created_at',
        sortOrder = 'DESC',
        limit = 20,
        offset = 0,
      } = params;

      const { data, error } = await supabase.rpc('get_all_admins', {
        p_query: query,
        p_role: role,
        p_is_active: isActive,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Error searching admins:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      // Extract total count from first row
      const totalCount = data && data.length > 0 ? data[0].total_count : 0;

      return {
        success: true,
        data: {
          admins: data || [],
          totalCount: Number(totalCount),
        },
        error: null,
      };
    } catch (err) {
      console.error('Exception in searchAdmins:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get detailed admin information
   */
  async getAdminDetail(adminId: string): Promise<ApiResponse<AdminDetail>> {
    try {
      const { data, error } = await supabase.rpc('get_admin_detail', {
        p_admin_id: adminId,
      });

      if (error) {
        console.error('Error getting admin detail:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as AdminDetail,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getAdminDetail:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Create new admin
   */
  async createAdmin(params: CreateAdminParams): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('create_admin', {
        p_email: params.email,
        p_full_name: params.fullName,
        p_role: params.role || 'moderator',
        p_created_by_admin_id: params.createdByAdminId || null,
      });

      if (error) {
        console.error('Error creating admin:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      // Check if the function returned an error
      if (data && !data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in createAdmin:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update admin role
   */
  async updateAdminRole(
    adminId: string,
    role: AdminRole,
    updatedByAdminId?: string
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('update_admin_role', {
        p_admin_id: adminId,
        p_role: role,
        p_updated_by_admin_id: updatedByAdminId || null,
      });

      if (error) {
        console.error('Error updating admin role:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (data && !data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateAdminRole:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Update admin status (activate/deactivate)
   */
  async updateAdminStatus(
    adminId: string,
    isActive: boolean,
    updatedByAdminId?: string
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('update_admin_status', {
        p_admin_id: adminId,
        p_is_active: isActive,
        p_updated_by_admin_id: updatedByAdminId || null,
      });

      if (error) {
        console.error('Error updating admin status:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (data && !data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in updateAdminStatus:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Delete admin
   */
  async deleteAdmin(
    adminId: string,
    deletedByAdminId?: string
  ): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('delete_admin', {
        p_admin_id: adminId,
        p_deleted_by_admin_id: deletedByAdminId || null,
      });

      if (error) {
        console.error('Error deleting admin:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      if (data && !data.success) {
        return {
          success: false,
          error: data.error,
          data: null,
        };
      }

      return {
        success: true,
        data: data.data,
        error: null,
      };
    } catch (err) {
      console.error('Exception in deleteAdmin:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get audit logs
   */
  async getAuditLogs(params: {
    adminId?: string;
    action?: string;
    targetType?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ logs: AuditLog[]; totalCount: number }>> {
    try {
      const {
        adminId = null,
        action = null,
        targetType = null,
        limit = 50,
        offset = 0,
      } = params;

      const { data, error } = await supabase.rpc('get_admin_audit_logs', {
        p_admin_id: adminId,
        p_action: action,
        p_target_type: targetType,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Error getting audit logs:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      const totalCount = data && data.length > 0 ? data[0].total_count : 0;

      return {
        success: true,
        data: {
          logs: data || [],
          totalCount: Number(totalCount),
        },
        error: null,
      };
    } catch (err) {
      console.error('Exception in getAuditLogs:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Log admin action
   */
  async logAction(params: {
    adminId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<ApiResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('log_admin_action', {
        p_admin_id: params.adminId,
        p_action: params.action,
        p_target_type: params.targetType || null,
        p_target_id: params.targetId || null,
        p_details: params.details || null,
        p_ip_address: params.ipAddress || null,
      });

      if (error) {
        console.error('Error logging action:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data as string,
        error: null,
      };
    } catch (err) {
      console.error('Exception in logAction:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },

  /**
   * Get admin by user ID
   */
  async getAdminByUserId(userId: string): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await supabase.rpc('get_admin_by_user_id', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Error getting admin by user ID:', error);
        return {
          success: false,
          error: error.message,
          data: null,
        };
      }

      return {
        success: true,
        data: data && data.length > 0 ? data[0] : null,
        error: null,
      };
    } catch (err) {
      console.error('Exception in getAdminByUserId:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        data: null,
      };
    }
  },
};
