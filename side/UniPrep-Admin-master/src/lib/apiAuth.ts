/**
 * API Route Authentication & Authorization
 * Phase 5: API Protection
 * 
 * Provides utilities for protecting API routes with role-based access control
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { AdminRole, hasMinimumRole, canManageRole } from '@/middleware/roleGuard';

// Service-role client for admin lookups (not for auth verification)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createSupabaseClient(supabaseUrl, supabaseServiceKey);

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  adminId?: string;
  role?: AdminRole;
  error?: string;
}

/**
 * Get authenticated admin from request
 * Uses Supabase SSR cookie-based auth (primary) or Authorization header (fallback)
 */
export async function getAuthenticatedAdmin(request: NextRequest): Promise<AuthResult> {
  try {
    let user = null;

    // Primary path: use Supabase SSR cookie-based auth (works with Next.js cookies)
    try {
      const supabase = await createClient();
      const { data: { user: cookieUser }, error: cookieError } = await supabase.auth.getUser();
      if (!cookieError && cookieUser) {
        user = cookieUser;
      }
    } catch {
      // Cookie-based auth failed, try header fallback
    }

    // Fallback: Authorization header (for external API callers)
    if (!user) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user: headerUser }, error: headerError } = await supabaseAdmin.auth.getUser(token);
        if (!headerError && headerUser) {
          user = headerUser;
        }
      }
    }

    if (!user) {
      return { authenticated: false, error: 'No authentication token provided' };
    }

    // Get admin record
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .single();

    if (adminError || !admin) {
      return { authenticated: false, error: 'User is not an admin' };
    }

    if (!admin.is_active) {
      return { authenticated: false, error: 'Admin account is deactivated' };
    }

    return {
      authenticated: true,
      userId: user.id,
      adminId: admin.id,
      role: admin.role as AdminRole,
    };
  } catch (error) {
    console.error('API Auth error:', error);
    return { authenticated: false, error: 'Authentication failed' };
  }
}

/**
 * Check if user has required role for API route
 */
export function checkRoleAccess(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return hasMinimumRole(userRole, requiredRole);
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'UNAUTHORIZED' },
    { status: 401 }
  );
}

/**
 * Create forbidden response
 */
export function forbiddenResponse(message: string = 'Insufficient permissions'): NextResponse {
  return NextResponse.json(
    { error: message, code: 'FORBIDDEN' },
    { status: 403 }
  );
}

/**
 * Middleware helper for protected API routes
 * Usage:
 * ```
 * export async function POST(request: NextRequest) {
 *   const authResult = await requireAdmin(request, 'admin');
 *   if (authResult.error) return authResult.error;
 *   
 *   // authResult.admin contains authenticated admin info
 *   // ... handle request
 * }
 * ```
 */
export async function requireAdmin(
  request: NextRequest,
  minimumRole: AdminRole = 'moderator'
): Promise<{ admin: AuthResult; error?: NextResponse }> {
  const authResult = await getAuthenticatedAdmin(request);

  if (!authResult.authenticated) {
    return {
      admin: authResult,
      error: unauthorizedResponse(authResult.error),
    };
  }

  if (!checkRoleAccess(authResult.role!, minimumRole)) {
    return {
      admin: authResult,
      error: forbiddenResponse(`Requires ${minimumRole} role or higher`),
    };
  }

  return { admin: authResult };
}

/**
 * Check if admin can manage target role
 */
export function canAdminManageRole(adminRole: AdminRole, targetRole: AdminRole): boolean {
  return canManageRole(adminRole, targetRole);
}

/**
 * Log permission denial for audit
 */
export async function logPermissionDenial(
  adminId: string | undefined,
  resource: string,
  action: string,
  requiredRole: AdminRole,
  actualRole: AdminRole | undefined
): Promise<void> {
  try {
    if (!adminId) return;

    await supabaseAdmin.from('audit_logs').insert({
      admin_id: adminId,
      action_type: 'PERMISSION_DENIED',
      table_name: resource,
      description: `Permission denied: ${action}`,
      old_values: null,
      new_values: {
        attempted_action: action,
        required_role: requiredRole,
        actual_role: actualRole || 'none',
        resource: resource,
      },
    });
  } catch (error) {
    console.error('Failed to log permission denial:', error);
  }
}
