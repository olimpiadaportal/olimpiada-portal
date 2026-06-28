/**
 * Role Guard Component
 * Protects routes and components based on user role
 */

'use client';

import { usePermissions } from '@/hooks/usePermissions';
import { AdminRole } from '@/middleware/roleGuard';
import AccessDenied from './AccessDenied';

interface RoleGuardProps {
  allowedRoles: AdminRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLoading?: boolean;
}

export default function RoleGuard({ 
  allowedRoles, 
  children, 
  fallback,
  showLoading = true 
}: RoleGuardProps) {
  const { role, loading } = usePermissions();

  // Show loading state
  if (loading && showLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check if user has required role
  if (!role || !allowedRoles.includes(role)) {
    return fallback || <AccessDenied requiredRoles={allowedRoles} currentRole={role} />;
  }

  return <>{children}</>;
}

/**
 * Inline permission check component
 * Hides content if user doesn't have permission
 */
interface PermissionCheckProps {
  permission: (permissions: ReturnType<typeof usePermissions>) => boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionCheck({ permission, children, fallback = null }: PermissionCheckProps) {
  const permissions = usePermissions();

  if (!permission(permissions)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
