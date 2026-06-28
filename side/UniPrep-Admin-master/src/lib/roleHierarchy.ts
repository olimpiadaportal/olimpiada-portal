/**
 * Role Hierarchy & Security Utilities
 * 
 * Role Hierarchy (highest to lowest):
 * 1. super_admin - Full access, untouchable by others
 * 2. admin - Can manage moderators and below
 * 3. moderator - Limited access, cannot manage other admins
 */

export type AdminRole = 'super_admin' | 'admin' | 'moderator';

// Role hierarchy levels (higher number = more power)
const ROLE_LEVELS: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  moderator: 1,
};

/**
 * Check if role A can manage role B
 * Rule: You can only manage roles below your level
 */
export function canManageRole(currentRole: AdminRole, targetRole: AdminRole): boolean {
  return ROLE_LEVELS[currentRole] > ROLE_LEVELS[targetRole];
}

/**
 * Check if role A can edit role B
 * Rule: Same as canManageRole
 */
export function canEditRole(currentRole: AdminRole, targetRole: AdminRole): boolean {
  return canManageRole(currentRole, targetRole);
}

/**
 * Check if role A can delete role B
 * Rule: Same as canManageRole
 */
export function canDeleteRole(currentRole: AdminRole, targetRole: AdminRole): boolean {
  return canManageRole(currentRole, targetRole);
}

/**
 * Check if role A can change role B to role C
 * Rule: You must be able to manage both the current and target roles
 */
export function canChangeRole(
  currentUserRole: AdminRole,
  targetCurrentRole: AdminRole,
  targetNewRole: AdminRole
): boolean {
  return (
    canManageRole(currentUserRole, targetCurrentRole) &&
    canManageRole(currentUserRole, targetNewRole)
  );
}

/**
 * Get roles that a user can assign to others
 */
export function getAssignableRoles(currentRole: AdminRole): AdminRole[] {
  const currentLevel = ROLE_LEVELS[currentRole];
  return (Object.keys(ROLE_LEVELS) as AdminRole[]).filter(
    (role) => ROLE_LEVELS[role] < currentLevel
  );
}

/**
 * Check if a role can create new admins
 * Rule: Only super_admin can create new admins
 */
export function canCreateAdmin(currentRole: AdminRole): boolean {
  return currentRole === 'super_admin';
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: AdminRole): string {
  const names: Record<AdminRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    moderator: 'Moderator',
  };
  return names[role];
}

/**
 * Get role description
 */
export function getRoleDescription(role: AdminRole): string {
  const descriptions: Record<AdminRole, string> = {
    super_admin: 'Full system access. Can manage all admins and system settings.',
    admin: 'Can manage moderators and below. Cannot modify super admins.',
    moderator: 'Limited access. Can view and moderate content.',
  };
  return descriptions[role];
}

/**
 * Security check: Validate if action is allowed
 */
export function validateRoleAction(
  currentRole: AdminRole,
  action: 'create' | 'edit' | 'delete' | 'change_role',
  targetRole?: AdminRole,
  newRole?: AdminRole
): { allowed: boolean; reason?: string } {
  switch (action) {
    case 'create':
      if (!canCreateAdmin(currentRole)) {
        return {
          allowed: false,
          reason: 'Only Super Admins can create new admin users',
        };
      }
      break;

    case 'edit':
    case 'delete':
      if (!targetRole) {
        return { allowed: false, reason: 'Target role is required' };
      }
      if (!canManageRole(currentRole, targetRole)) {
        return {
          allowed: false,
          reason: `You cannot ${action} a ${getRoleDisplayName(targetRole)}`,
        };
      }
      break;

    case 'change_role':
      if (!targetRole || !newRole) {
        return { allowed: false, reason: 'Both current and new roles are required' };
      }
      if (!canChangeRole(currentRole, targetRole, newRole)) {
        return {
          allowed: false,
          reason: `You cannot change a ${getRoleDisplayName(targetRole)} to ${getRoleDisplayName(newRole)}`,
        };
      }
      break;
  }

  return { allowed: true };
}
