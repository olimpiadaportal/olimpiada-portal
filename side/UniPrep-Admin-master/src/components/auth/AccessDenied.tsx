/**
 * Access Denied Component
 * Shown when user doesn't have permission to access a resource
 */

'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { AdminRole } from '@/middleware/roleGuard';
import { permissionAuditService } from '@/services/permissionAuditService';

interface AccessDeniedProps {
  requiredRoles?: AdminRole[];
  currentRole?: AdminRole | null;
  message?: string;
}

export default function AccessDenied({ 
  requiredRoles, 
  currentRole,
  message 
}: AccessDeniedProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Log permission denial when component mounts
  useEffect(() => {
    if (requiredRoles && requiredRoles.length > 0) {
      permissionAuditService.logUnauthorizedPageAccess(
        pathname || 'unknown',
        requiredRoles,
        currentRole || undefined
      );
    }
  }, [pathname, requiredRoles, currentRole]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            {message || 'You do not have permission to access this resource.'}
          </p>

          {/* Role Information */}
          {currentRole && requiredRoles && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Your Role:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {currentRole.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Required Role:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {requiredRoles.map(r => r.replace('_', ' ')).join(' or ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.back()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go to Dashboard
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-gray-500 mt-6">
            If you believe this is an error, please contact a system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
