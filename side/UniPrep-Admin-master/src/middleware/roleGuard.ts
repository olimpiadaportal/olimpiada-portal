/**
 * Role-Based Access Control (RBAC) Utilities
 * Provides role hierarchy and permission checking functions
 */

export type AdminRole = 'super_admin' | 'admin' | 'moderator';

export const ROLE_LEVELS: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  moderator: 1,
};

/**
 * Check if current role can manage target role
 * Uses strict hierarchy: must be HIGHER level (not equal)
 * 
 * @example
 * canManageRole('super_admin', 'admin') // true
 * canManageRole('admin', 'admin') // false (same level)
 * canManageRole('admin', 'moderator') // true
 */
export function canManageRole(currentRole: AdminRole, targetRole: AdminRole): boolean {
  return ROLE_LEVELS[currentRole] > ROLE_LEVELS[targetRole];
}

/**
 * Check if user has minimum required role level
 * Uses >= comparison (includes same level)
 * 
 * @example
 * hasMinimumRole('admin', 'admin') // true (same level ok)
 * hasMinimumRole('admin', 'super_admin') // false
 * hasMinimumRole('super_admin', 'admin') // true
 */
export function hasMinimumRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
}

/**
 * Get role level number
 */
export function getRoleLevel(role: AdminRole): number {
  return ROLE_LEVELS[role];
}

/**
 * Check if role is super admin
 */
export function isSuperAdmin(role: AdminRole): boolean {
  return role === 'super_admin';
}

/**
 * Check if role is admin or higher
 */
export function isAdminOrHigher(role: AdminRole): boolean {
  return hasMinimumRole(role, 'admin');
}

/**
 * Check if role is moderator
 */
export function isModerator(role: AdminRole): boolean {
  return role === 'moderator';
}

/**
 * Get allowed roles for a minimum requirement
 * 
 * @example
 * getAllowedRoles('admin') // ['super_admin', 'admin']
 */
export function getAllowedRoles(minimumRole: AdminRole): AdminRole[] {
  const minLevel = ROLE_LEVELS[minimumRole];
  return Object.entries(ROLE_LEVELS)
    .filter(([_, level]) => level >= minLevel)
    .map(([role]) => role as AdminRole);
}

/**
 * Permission definitions for each role
 */
export const ROLE_PERMISSIONS = {
  super_admin: {
    // Full access to everything
    canViewAllPages: true,
    canManageUsers: true,
    canManageAdmins: true,
    canManageSuperAdmins: true, // except last one (DB enforced)
    canEditSystemSettings: true,
    canEditSecuritySettings: true,
    canManageFeatureFlags: true,
    canViewAuditLogs: true,
    canDeleteUsers: true,
    canCreateAdmins: true,
    canExportData: true,
    canImportData: true,
  },
  admin: {
    // Administrative access with restrictions
    canViewAllPages: true,
    canManageUsers: true,
    canManageAdmins: false, // Cannot manage other admins
    canManageSuperAdmins: false,
    canEditSystemSettings: true,
    canEditSecuritySettings: false, // Limited security access
    canManageFeatureFlags: true, // Toggle only
    canViewAuditLogs: false, // Super admin only - sensitive security data
    canDeleteUsers: true,
    canCreateAdmins: false,
    canExportData: true,
    canImportData: false,
  },
  moderator: {
    // Read-only access
    canViewAllPages: false, // Limited pages
    canManageUsers: false,
    canManageAdmins: false,
    canManageSuperAdmins: false,
    canEditSystemSettings: false,
    canEditSecuritySettings: false,
    canManageFeatureFlags: false,
    canViewAuditLogs: false,
    canDeleteUsers: false,
    canCreateAdmins: false,
    canExportData: false,
    canImportData: false,
  },
};

/**
 * Get permissions for a role
 */
export function getRolePermissions(role: AdminRole) {
  return ROLE_PERMISSIONS[role];
}

/**
 * Check specific permission for a role
 */
export function hasPermission(
  role: AdminRole,
  permission: keyof typeof ROLE_PERMISSIONS.super_admin
): boolean {
  return ROLE_PERMISSIONS[role][permission];
}
