/**
 * Permission Hook
 * Provides permission checks based on current user's role
 */

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminRole, getRolePermissions, canManageRole, hasMinimumRole } from '@/middleware/roleGuard';

interface PermissionState {
  role: AdminRole | null;
  loading: boolean;
  // View permissions
  canViewSettings: boolean;
  canViewAuditLogs: boolean;
  canViewAdminManagement: boolean;
  // Edit permissions
  canEditUsers: boolean;
  canEditSettings: boolean;
  canEditSecuritySettings: boolean;
  canEditContent: boolean;
  // Delete permissions
  canDeleteUsers: boolean;
  canDeleteContent: boolean;
  // Create permissions
  canCreateUsers: boolean;
  canCreateAdmins: boolean;
  canCreateContent: boolean;
  // Feature flags
  canManageFeatureFlags: boolean;
  // Data operations
  canExportData: boolean;
  canImportData: boolean;
  // Admin management
  canManageAdmins: boolean;
  canManageSuperAdmins: boolean;
  // Helper functions
  canManageRole: (targetRole: AdminRole) => boolean;
  hasMinimumRole: (requiredRole: AdminRole) => boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
}

export function usePermissions(): PermissionState {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserRole();
  }, []);

  const loadUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setLoading(false);
        return;
      }

      // Get admin profile with role
      const { data: admin } = await supabase
        .from('admins')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (admin) {
        setRole(admin.role as AdminRole);
      }
    } catch (error) {
      console.error('Error loading user role:', error);
    } finally {
      setLoading(false);
    }
  };

  // If no role or loading, return restricted permissions
  if (!role || loading) {
    return {
      role: null,
      loading,
      canViewSettings: false,
      canViewAuditLogs: false,
      canViewAdminManagement: false,
      canEditUsers: false,
      canEditSettings: false,
      canEditSecuritySettings: false,
      canEditContent: false,
      canDeleteUsers: false,
      canDeleteContent: false,
      canCreateUsers: false,
      canCreateAdmins: false,
      canCreateContent: false,
      canManageFeatureFlags: false,
      canExportData: false,
      canImportData: false,
      canManageAdmins: false,
      canManageSuperAdmins: false,
      canManageRole: () => false,
      hasMinimumRole: () => false,
      isSuperAdmin: false,
      isAdmin: false,
      isModerator: false,
    };
  }

  const permissions = getRolePermissions(role);

  return {
    role,
    loading: false,
    // View permissions
    canViewSettings: role !== 'moderator',
    canViewAuditLogs: permissions.canViewAuditLogs,
    canViewAdminManagement: permissions.canManageAdmins,
    // Edit permissions
    canEditUsers: role !== 'moderator',
    canEditSettings: permissions.canEditSystemSettings,
    canEditSecuritySettings: permissions.canEditSecuritySettings,
    canEditContent: role !== 'moderator',
    // Delete permissions
    canDeleteUsers: permissions.canDeleteUsers,
    canDeleteContent: role !== 'moderator',
    // Create permissions
    canCreateUsers: role !== 'moderator',
    canCreateAdmins: permissions.canCreateAdmins,
    canCreateContent: role !== 'moderator',
    // Feature flags
    canManageFeatureFlags: permissions.canManageFeatureFlags,
    // Data operations
    canExportData: permissions.canExportData,
    canImportData: permissions.canImportData,
    // Admin management
    canManageAdmins: permissions.canManageAdmins,
    canManageSuperAdmins: permissions.canManageSuperAdmins,
    // Helper functions
    canManageRole: (targetRole: AdminRole) => canManageRole(role, targetRole),
    hasMinimumRole: (requiredRole: AdminRole) => hasMinimumRole(role, requiredRole),
    isSuperAdmin: role === 'super_admin',
    isAdmin: role === 'admin',
    isModerator: role === 'moderator',
  };
}
