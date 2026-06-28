import { supabase } from '@/lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  full_name: string;
  avatar_url?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AdminUser;
  error?: string;
  retryAfter?: number; // Seconds until retry is allowed (for rate limiting)
}

export interface RateLimitCheck {
  allowed: boolean;
  reason: string | null;
  retry_after_seconds: number;
  email_attempts: number;
  ip_attempts: number;
}

class AuthService {
  private supabase = supabase;

  /**
   * Check if login is allowed (rate limiting)
   */
  async checkLoginAllowed(email: string, ipAddress?: string): Promise<RateLimitCheck> {
    try {
      const { data, error } = await this.supabase.rpc('check_login_allowed', {
        p_email: email,
        p_ip_address: ipAddress || null,
      });

      if (error) {
        console.error('Rate limit check error:', error);
        // Allow login if rate limit check fails (fail open for availability)
        return {
          allowed: true,
          reason: null,
          retry_after_seconds: 0,
          email_attempts: 0,
          ip_attempts: 0,
        };
      }

      // Data is an array with one row
      const result = data?.[0] || data;
      return {
        allowed: result?.allowed ?? true,
        reason: result?.reason || null,
        retry_after_seconds: result?.retry_after_seconds || 0,
        email_attempts: result?.email_attempts || 0,
        ip_attempts: result?.ip_attempts || 0,
      };
    } catch (error) {
      console.error('Rate limit check exception:', error);
      return {
        allowed: true,
        reason: null,
        retry_after_seconds: 0,
        email_attempts: 0,
        ip_attempts: 0,
      };
    }
  }

  /**
   * Log a login attempt
   */
  async logLoginAttempt(
    email: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    failureReason?: string
  ): Promise<void> {
    try {
      await this.supabase.rpc('log_login_attempt', {
        p_email: email,
        p_ip_address: ipAddress || null,
        p_user_agent: userAgent || null,
        p_success: success,
        p_failure_reason: failureReason || null,
      });
    } catch (error) {
      console.error('Log login attempt error:', error);
      // Don't throw - logging failure shouldn't block login
    }
  }

  /**
   * Login with email and password (with rate limiting)
   */
  async login(credentials: LoginCredentials, ipAddress?: string): Promise<AuthResponse> {
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : undefined;

    try {
      
      // Step 0: Check rate limiting
      const rateLimitCheck = await this.checkLoginAllowed(credentials.email, ipAddress);
      
      if (!rateLimitCheck.allowed) {
        console.warn('⚠️ Login blocked by rate limiting:', rateLimitCheck.reason);
        return {
          success: false,
          error: rateLimitCheck.reason || 'Too many login attempts. Please try again later.',
          retryAfter: rateLimitCheck.retry_after_seconds,
        };
      }

      // Step 1: Sign in with Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        console.error('❌ Auth error:', authError);
        // Log failed attempt
        await this.logLoginAttempt(credentials.email, false, ipAddress, userAgent, authError.message);
        return {
          success: false,
          error: authError.message,
        };
      }

      if (!authData.user) {
        console.error('❌ No user returned');
        await this.logLoginAttempt(credentials.email, false, ipAddress, userAgent, 'No user returned');
        return {
          success: false,
          error: 'No user returned from authentication',
        };
      }


      // Step 2: Wait a moment for session to be established
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Get admin profile
      const adminUser = await this.getAdminProfile(authData.user.id);

      if (!adminUser) {
        console.error('❌ Not an admin or admin check failed');
        // User authenticated but is not an admin
        await this.logout();
        await this.logLoginAttempt(credentials.email, false, ipAddress, userAgent, 'Not an admin');
        return {
          success: false,
          error: 'Access denied. Admin privileges required.',
        };
      }

      // Log successful login
      await this.logLoginAttempt(credentials.email, true, ipAddress, userAgent);

      return {
        success: true,
        user: adminUser,
      };
    } catch (error) {
      console.error('❌ Login error:', error);
      await this.logLoginAttempt(
        credentials.email, 
        false, 
        ipAddress, 
        userAgent, 
        error instanceof Error ? error.message : 'Unknown error'
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      };
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AdminUser | null> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();

      if (error || !user) {
        return null;
      }

      return await this.getAdminProfile(user.id);
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  /**
   * Get admin profile from database
   */
  private async getAdminProfile(userId: string): Promise<AdminUser | null> {
    try {
      
      // Query admins table
      const { data: adminData, error: adminError } = await this.supabase
        .from('admins')
        .select('id, role, user_id, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (adminError) {
        console.error('❌ Admin query error:', {
          code: adminError.code,
          message: adminError.message,
          details: adminError.details,
          hint: adminError.hint
        });
        return null;
      }

      if (!adminData) {
        console.error('❌ No admin record found for user:', userId);
        return null;
      }


      // Get profile data separately
      const { data: profileData, error: profileError } = await this.supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('❌ Profile query error:', profileError);
        return null;
      }

      if (!profileData) {
        console.error('❌ No profile found for user:', userId);
        return null;
      }


      // Get email from auth.users
      const { data: { user }, error: userError } = await this.supabase.auth.getUser();
      
      if (userError) {
        console.error('❌ Auth.getUser error:', userError);
        return null;
      }

      if (!user) {
        console.error('❌ No auth user found');
        return null;
      }


      const result = {
        id: adminData.id,
        email: user.email || '',
        role: adminData.role as 'super_admin' | 'admin' | 'moderator',
        full_name: profileData.full_name,
        avatar_url: profileData.avatar_url || undefined,
      };

      return result;
    } catch (error) {
      console.error('❌ Get admin profile exception:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      return !!user && !error;
    } catch (error) {
      console.error('Check authentication error:', error);
      return false;
    }
  }

  /**
   * Check if user has specific role
   */
  async hasRole(role: 'super_admin' | 'admin' | 'moderator'): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    // Super admin has all permissions
    if (user.role === 'super_admin') return true;

    // Check specific role
    return user.role === role;
  }

  /**
   * Check if user has any of the specified roles
   */
  async hasAnyRole(roles: ('super_admin' | 'admin' | 'moderator')[]): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) return false;

    return roles.includes(user.role);
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: AdminUser | null) => void) {
    return this.supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        const adminUser = await this.getAdminProfile(session.user.id);
        callback(adminUser);
      } else {
        callback(null);
      }
    });
  }
}

export const authService = new AuthService();
