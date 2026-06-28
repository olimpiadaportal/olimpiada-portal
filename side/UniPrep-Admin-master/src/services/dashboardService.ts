import { supabase } from '@/lib/supabase';
import type {
  DashboardStats,
  StudentGrowthData,
  ELODistribution,
  ActivityEvent,
  ActivityHeatmapData,
  ApiResponse,
} from '@/types';

export const dashboardService = {
  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<ApiResponse<DashboardStats>> {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats');

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch stats',
        success: false,
      };
    }
  },

  /**
   * Get student growth data
   */
  async getStudentGrowth(days: number = 30): Promise<ApiResponse<StudentGrowthData[]>> {
    try {
      const { data, error } = await supabase.rpc('get_student_growth', {
        p_days: days,
      });

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error fetching student growth:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch growth data',
        success: false,
      };
    }
  },

  /**
   * Get ELO distribution
   */
  async getELODistribution(): Promise<ApiResponse<ELODistribution[]>> {
    try {
      const { data, error } = await supabase.rpc('get_elo_distribution');

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error fetching ELO distribution:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch ELO data',
        success: false,
      };
    }
  },

  /**
   * Get recent activity
   */
  async getRecentActivity(limit: number = 20): Promise<ApiResponse<ActivityEvent[]>> {
    try {
      const { data, error } = await supabase.rpc('get_recent_activity', {
        p_limit: limit,
      });

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch activity',
        success: false,
      };
    }
  },

  /**
   * Get activity heatmap data
   */
  async getActivityHeatmap(days: number = 90): Promise<ApiResponse<ActivityHeatmapData[]>> {
    try {
      const { data, error } = await supabase.rpc('get_activity_heatmap', {
        p_days: days,
      });

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error fetching activity heatmap:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch heatmap data',
        success: false,
      };
    }
  },

  /**
   * Log admin action
   */
  async logAction(
    actionType: string,
    tableName?: string,
    recordId?: string,
    oldValues?: Record<string, any>,
    newValues?: Record<string, any>
  ): Promise<ApiResponse<string>> {
    try {
      const { data, error } = await supabase.rpc('log_admin_action', {
        p_action_type: actionType,
        p_table_name: tableName || null,
        p_record_id: recordId || null,
        p_old_values: oldValues || null,
        p_new_values: newValues || null,
      });

      if (error) throw error;

      return {
        data,
        error: null,
        success: true,
      };
    } catch (error) {
      console.error('Error logging admin action:', error);
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Failed to log action',
        success: false,
      };
    }
  },
};
