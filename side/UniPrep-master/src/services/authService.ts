import { supabase, supabaseSignup } from './supabase';
import { User, UserType, ExamGroup } from '../types';
import { sanitizeInput } from '../utils/validation';

// ============================================================================
// CLIENT-SIDE RATE LIMITING (HIGH-07 security audit fix)
// Prevents brute-force attempts on signIn, resetPassword, resendVerification
// ============================================================================
const AUTH_RATE_LIMIT = {
  MAX_ATTEMPTS: 5,           // Max attempts before lockout
  LOCKOUT_BASE_MS: 30_000,   // 30 second base lockout
  LOCKOUT_MAX_MS: 300_000,   // 5 minute max lockout
  WINDOW_MS: 600_000,        // 10 minute sliding window
};

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry) return { allowed: true, retryAfterMs: 0 };

  // Check if locked out
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }

  // Reset if window expired
  if (now - entry.firstAttempt > AUTH_RATE_LIMIT.WINDOW_MS) {
    rateLimitMap.delete(key);
    return { allowed: true, retryAfterMs: 0 };
  }

  return { allowed: true, retryAfterMs: 0 };
}

function recordAttempt(key: string, success: boolean): void {
  const now = Date.now();

  if (success) {
    rateLimitMap.delete(key);
    return;
  }

  const entry = rateLimitMap.get(key) || { attempts: 0, firstAttempt: now, lockedUntil: 0 };
  entry.attempts += 1;

  if (entry.attempts >= AUTH_RATE_LIMIT.MAX_ATTEMPTS) {
    // Exponential backoff: 30s, 60s, 120s, 240s, capped at 300s
    const lockoutMs = Math.min(
      AUTH_RATE_LIMIT.LOCKOUT_BASE_MS * Math.pow(2, Math.floor(entry.attempts / AUTH_RATE_LIMIT.MAX_ATTEMPTS) - 1),
      AUTH_RATE_LIMIT.LOCKOUT_MAX_MS
    );
    entry.lockedUntil = now + lockoutMs;
  }

  rateLimitMap.set(key, entry);
}

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  userType: UserType;
  avatarUrl?: string;
}

export interface StudentSignUpData extends SignUpData {
  city: string;
  targetGroup?: ExamGroup;
  targetUniversity?: string;
  graduationYear?: number;
}

export interface TeacherSignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  userType: UserType;
  city: string;
  // These fields are now collected in teacher onboarding quiz
  bio?: string;
  specializations?: string[];
  experienceYears?: number;
  hourlyRate?: number;
  monthlyRate?: number;
  availableGroups?: ExamGroup[];
}

export interface SignInData {
  email: string;
  password: string;
}

class AuthService {
  // Check if email already exists in the system
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      // Check if email exists in auth.users
      const { data, error } = await supabase.rpc('check_email_exists', { 
        email_to_check: email.toLowerCase().trim() 
      });
      
      if (error) {
        console.error('Email check error:', error);
        // If RPC doesn't exist, fall back to checking profiles table
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();
        
        return !!profileData;
      }
      
      return !!data;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
    }
  }

  // Sign up a new user
  async signUp(data: SignUpData) {
    try {
      // Create auth user - the database trigger will auto-create the profile
      // Uses supabaseSignup (implicit flow) so Supabase sends token_hash OTP links
      // in confirmation emails. PKCE flow would send a `code` that requires the
      // original code verifier — which is lost when the user opens the link in a browser.
      const { data: authData, error: authError } = await supabaseSignup.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          // Redirect to web page for email confirmation (more reliable than deep links)
          emailRedirectTo: 'https://auth.elmly.app/auth/confirm',
          data: {
            full_name: data.fullName,
            first_name: data.firstName || null,
            last_name: data.lastName || null,
            user_type: data.userType,
            phone: data.phone || null,  // Include phone in metadata
          }
        }
      });

      if (authError) {
        console.error('Auth signup error:', authError);
        console.error('Error code:', authError.status);
        console.error('Error message:', authError.message);
        throw authError;
      }
      if (!authData.user) throw new Error('User creation failed');

      console.log('User created successfully:', authData.user.id);

      // Wait for the database trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Note: Phone is now included in the trigger via metadata
      // Avatar will be updated later after session is set
      
      return { user: authData.user, session: authData.session, phone: data.phone, avatarUrl: data.avatarUrl };
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  // Sign up student with additional data
  async signUpStudent(data: StudentSignUpData) {
    try {
      console.log('📝 [SIGNUP STEP 1] Starting student signup process...');
      console.log('📝 [SIGNUP STEP 1] Email:', data.email);
      console.log('📝 [SIGNUP STEP 1] City:', data.city);
      
      // Sanitize user inputs
      const sanitizedData = {
        ...data,
        fullName: sanitizeInput(data.fullName),
        phone: data.phone ? sanitizeInput(data.phone) : undefined,
        city: sanitizeInput(data.city),
        targetGroup: data.targetGroup ? sanitizeInput(data.targetGroup) : undefined,
        targetUniversity: data.targetUniversity ? sanitizeInput(data.targetUniversity) : undefined,
      };

      console.log('📝 [SIGNUP STEP 2] Calling base signUp function...');
      const { user, session } = await this.signUp(sanitizedData);
      console.log('✅ [SIGNUP STEP 2] Base signup complete. User ID:', user.id);
      console.log('📝 [SIGNUP STEP 2] Session exists:', !!session);
      console.log('📝 [SIGNUP STEP 2] Email confirmed:', user.email_confirmed_at ? 'Yes' : 'No (needs verification)');

      console.log('📝 [SIGNUP STEP 3] Setting session explicitly...');
      // CRITICAL: Set the session explicitly
      if (session) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        console.log('✅ [SIGNUP STEP 3] Session set successfully');
      } else {
        console.log('⚠️ [SIGNUP STEP 3] No session returned (email confirmation required)');
      }

      // Wait a bit for session to propagate
      console.log('📝 [SIGNUP STEP 4] Waiting for session propagation...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile with phone and avatar now that session is set
      // Phone should already be set by trigger, but this ensures it's there
      const profileUpdates: any = {};
      if (sanitizedData.phone) profileUpdates.phone = sanitizedData.phone;
      if (data.avatarUrl) profileUpdates.avatar_url = data.avatarUrl;

      console.log('📝 [SIGNUP STEP 5] Updating profile with phone/avatar...');
      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', user.id);

        if (updateError) {
          console.warn('⚠️ [SIGNUP STEP 5] Profile update warning:', updateError);
          // Don't throw - continue with signup
        } else {
          console.log('✅ [SIGNUP STEP 5] Profile updated with phone/avatar');
        }
      } else {
        console.log('📝 [SIGNUP STEP 5] No profile updates needed');
      }

      console.log('📝 [SIGNUP STEP 6] Calling create_student_record RPC function...');
      console.log('📝 [SIGNUP STEP 6] Parameters:', {
        p_user_id: user.id,
        p_city: sanitizedData.city,
        p_target_group: sanitizedData.targetGroup || null,
        p_target_university: sanitizedData.targetUniversity || null,
        p_graduation_year: data.graduationYear || null,
      });

      // Create student record using database function (bypasses RLS)
      // The function runs with SECURITY DEFINER so it doesn't need auth.uid()
      const { data: studentData, error: studentError } = await supabase
        .rpc('create_student_record', {
          p_user_id: user.id,
          p_city: sanitizedData.city,
          p_target_group: sanitizedData.targetGroup || null,
          p_target_university: sanitizedData.targetUniversity || null,
          p_graduation_year: data.graduationYear || null,
        });

      if (studentError) {
        console.error('❌ [SIGNUP STEP 6] Student record creation error:', studentError);
        console.error('❌ [SIGNUP STEP 6] Error code:', studentError.code);
        console.error('❌ [SIGNUP STEP 6] Error message:', studentError.message);
        console.error('❌ [SIGNUP STEP 6] Error details:', studentError.details);
        console.error('❌ [SIGNUP STEP 6] Error hint:', studentError.hint);
        
        // If the RPC function doesn't exist, try direct insert as fallback
        if (studentError.message.includes('function') || studentError.code === '42883') {
          console.log('📝 [SIGNUP STEP 6B] RPC function not found, attempting direct insert as fallback...');
          const { data: directInsert, error: insertError } = await supabase
            .from('students')
            .insert({
              user_id: user.id,
              city: sanitizedData.city,
              target_group: sanitizedData.targetGroup || null,
              target_university: sanitizedData.targetUniversity || null,
              graduation_year: data.graduationYear || null,
            })
            .select('id')
            .single();
          
          if (insertError) {
            console.error('❌ [SIGNUP STEP 6B] Direct insert also failed:', insertError);
            console.error('❌ [SIGNUP STEP 6B] Insert error code:', insertError.code);
            console.error('❌ [SIGNUP STEP 6B] Insert error message:', insertError.message);
            // User was created but student record failed - still allow them to proceed
            // They can complete their profile later
            console.warn('⚠️ [SIGNUP STEP 6B] User created but student record failed. User can complete profile later.');
            console.log('📝 [SIGNUP STEP 7] Creating default settings...');
            await this.createDefaultSettings(user.id);
            console.log('✅ [SIGNUP COMPLETE] Signup finished with warnings');
            return { user, session };
          }
          
          console.log('✅ [SIGNUP STEP 6B] Student record created via direct insert! ID:', directInsert.id);
        } else {
          // For other errors, log but don't throw - user was created successfully
          console.warn('⚠️ [SIGNUP STEP 6] Student record creation failed but user was created. Error:', studentError.message);
          console.log('📝 [SIGNUP STEP 7] Creating default settings...');
          await this.createDefaultSettings(user.id);
          console.log('✅ [SIGNUP COMPLETE] Signup finished with warnings');
          return { user, session };
        }
      } else {
        console.log('✅ [SIGNUP STEP 6] Student record created successfully! ID:', studentData);
      }

      // Create default user settings
      console.log('📝 [SIGNUP STEP 7] Creating default settings...');
      await this.createDefaultSettings(user.id);
      console.log('✅ [SIGNUP STEP 7] Default settings created');

      console.log('✅ [SIGNUP COMPLETE] Student signup completed successfully!');
      return { user, session };
    } catch (error: any) {
      console.error('❌ [SIGNUP FAILED] Student sign up error:', error);
      console.error('❌ [SIGNUP FAILED] Error name:', error?.name);
      console.error('❌ [SIGNUP FAILED] Error message:', error?.message);
      console.error('❌ [SIGNUP FAILED] Error stack:', error?.stack);
      throw error;
    }
  }

  // Sign up teacher with additional data
  async signUpTeacher(data: TeacherSignUpData) {
    try {
      // Sanitize user inputs
      const sanitizedFirstName = sanitizeInput(data.firstName);
      const sanitizedLastName = sanitizeInput(data.lastName);
      const fullName = `${sanitizedFirstName} ${sanitizedLastName}`;
      
      const sanitizedData = {
        email: data.email,
        password: data.password,
        fullName: fullName,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        phone: data.phone ? sanitizeInput(data.phone) : undefined,
        userType: data.userType,
        city: sanitizeInput(data.city),
        bio: data.bio ? sanitizeInput(data.bio) : undefined,
      };

      const { user, session } = await this.signUp(sanitizedData);

      console.log('Creating teacher record for user:', user.id);
      console.log('Teacher data:', {
        city: sanitizedData.city,
        bio: sanitizedData.bio,
        specializations: data.specializations,
        experience_years: data.experienceYears,
        hourly_rate: data.hourlyRate,
        monthly_rate: data.monthlyRate,
        available_groups: data.availableGroups,
      });

      // CRITICAL: Set the session explicitly
      if (session) {
        await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }

      // Wait a bit for session to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile with phone now that session is set
      // Phone should already be set by trigger, but this ensures it's there
      const profileUpdates: any = {};
      if (sanitizedData.phone) profileUpdates.phone = sanitizedData.phone;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', user.id);

        if (updateError) {
          console.warn('Profile update warning:', updateError);
          // Don't throw - continue with signup
        } else {
          console.log('✅ Profile updated with phone/avatar');
        }
      }

      console.log('Calling create_teacher_record function for user:', user.id);

      // Create teacher record using database function (bypasses RLS)
      // The function runs with SECURITY DEFINER so it doesn't need auth.uid()
      const { data: teacherData, error: teacherError } = await supabase
        .rpc('create_teacher_record', {
          p_user_id: user.id,
          p_city: sanitizedData.city,
          p_bio: sanitizedData.bio || null,
          p_specializations: data.specializations,
          p_experience_years: data.experienceYears,
          p_hourly_rate: data.hourlyRate || null,
          p_monthly_rate: data.monthlyRate || null,
          p_available_groups: data.availableGroups,
        });

      if (teacherError) {
        console.error('Teacher record creation error:', teacherError);
        console.error('User ID:', user.id);
        console.error('Function call failed. Check if create_teacher_record function exists in database.');
        throw new Error(`Failed to create teacher record: ${teacherError.message}`);
      }

      console.log('✅ Teacher record created successfully! ID:', teacherData);

      // Create default user settings
      await this.createDefaultSettings(user.id);

      return { user, session };
    } catch (error) {
      console.error('Teacher sign up error:', error);
      throw error;
    }
  }

  // Sign in existing user (with client-side rate limiting — HIGH-07 fix)
  async signIn(data: SignInData) {
    const rateLimitKey = `signin:${data.email.toLowerCase()}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);

    if (!allowed) {
      const retrySeconds = Math.ceil(retryAfterMs / 1000);
      const err = new Error(`Too many login attempts. Please try again in ${retrySeconds} seconds.`);
      (err as any).rateLimitType = 'login';
      (err as any).retrySeconds = retrySeconds;
      throw err;
    }

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        recordAttempt(rateLimitKey, false);
        throw error;
      }

      recordAttempt(rateLimitKey, true);
      return { user: authData.user, session: authData.session };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  // Sign out current user
  async signOut() {
    try {
      // Clear cached user profile first (this should always succeed)
      try {
        const { offlineService } = await import('./offlineService');
        await offlineService.clearCachedUserProfile();
      } catch (cacheError) {
        // Ignore cache clearing errors - not critical
        console.warn('Cache clear warning:', cacheError);
      }

      // Clear secure credentials on explicit logout
      // Note: We keep the Remember Me preference so the toggle state persists
      try {
        const { secureAuthService } = await import('./secureAuthService');
        await secureAuthService.clearStoredCredentials();
        console.log('🔐 Secure credentials cleared on logout');
      } catch (secureError) {
        console.warn('Secure credentials clear warning:', secureError);
      }
      
      // Try to sign out from Supabase
      // Use scope: 'local' to ensure local session is ALWAYS cleared from AsyncStorage,
      // even if server-side token revocation fails (e.g., network issues, expired session).
      // This prevents the user from being auto-logged in after app restart.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      // Handle specific error cases gracefully
      if (error) {
        // AuthSessionMissingError means user is already signed out - this is fine
        if (error.name === 'AuthSessionMissingError' || 
            error.message?.includes('session') ||
            error.message?.includes('Auth session missing')) {
          console.log('User already signed out or session expired');
          return; // This is not an error condition
        }
        throw error;
      }
    } catch (error: any) {
      // Handle the case where session is already gone
      if (error?.name === 'AuthSessionMissingError' || 
          error?.message?.includes('session') ||
          error?.message?.includes('Auth session missing')) {
        console.log('Session already cleared');
        return; // This is expected during logout
      }
      console.error('Sign out error:', error);
      throw error;
    }
  }

  // Send password reset email (with client-side rate limiting — HIGH-07 fix)
  async resetPassword(email: string) {
    const rateLimitKey = `reset:${email.toLowerCase()}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);

    if (!allowed) {
      const retrySeconds = Math.ceil(retryAfterMs / 1000);
      const err = new Error(`Too many reset attempts. Please try again in ${retrySeconds} seconds.`);
      (err as any).rateLimitType = 'reset';
      (err as any).retrySeconds = retrySeconds;
      throw err;
    }

    try {
      // Redirect to web page for password reset (more reliable than deep links)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://auth.elmly.app/auth/reset-password',
      });

      recordAttempt(rateLimitKey, !error);
      if (error) throw error;
    } catch (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  // Resend email verification (with client-side rate limiting — HIGH-07 fix)
  async resendVerificationEmail(email: string) {
    const rateLimitKey = `resend:${email.toLowerCase()}`;
    const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);

    if (!allowed) {
      const retrySeconds = Math.ceil(retryAfterMs / 1000);
      const err = new Error(`Too many resend attempts. Please try again in ${retrySeconds} seconds.`);
      (err as any).rateLimitType = 'resend';
      (err as any).retrySeconds = retrySeconds;
      throw err;
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: 'https://auth.elmly.app/auth/confirm',
        },
      });

      recordAttempt(rateLimitKey, !error);
      if (error) throw error;
    } catch (error) {
      console.error('Resend verification error:', error);
      throw error;
    }
  }

  // Update password
  async updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  }

  // Change password with current password verification
  async changePassword(currentPassword: string, newPassword: string) {
    console.log('🔐 Starting password change process...');
    
    try {
      // Step 1: Get current user
      console.log('📋 Step 1: Getting current user...');
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      
      if (getUserError) {
        console.error('❌ Error getting user:', getUserError);
        throw new Error('Failed to get user information');
      }
      
      if (!user?.email) {
        console.error('❌ No authenticated user found');
        throw new Error('No authenticated user found');
      }

      console.log('✅ User found:', user.email);

      // Step 2: Verify current password using RPC (scoped to auth.uid() server-side)
      console.log('📋 Step 2: Verifying current password...');
      
      const { data: isValid, error: verifyError } = await supabase.rpc('verify_user_password', {
        password_attempt: currentPassword
      });

      // Handle RPC errors
      if (verifyError) {
        console.error('❌ RPC Error Details:', JSON.stringify(verifyError, null, 2));
        
        // Check if function doesn't exist
        if (verifyError.code === 'PGRST202' || verifyError.message?.includes('function')) {
          console.error('🚨 CRITICAL: verify_user_password function not found in database!');
          console.error('🚨 Please run: src/scripts/sql_STAGE_9/ADD_PASSWORD_VERIFICATION_FUNCTION.sql');
          throw new Error('Password verification function not configured. Please contact support.');
        }
        
        throw new Error('Failed to verify current password');
      }

      // Check if password is valid
      if (isValid === null || isValid === undefined) {
        console.error('❌ RPC returned null/undefined result');
        throw new Error('Password verification failed');
      }

      if (!isValid) {
        console.error('❌ Current password is INCORRECT');
        throw new Error('Current password is incorrect');
      }

      console.log('✅ Current password verified successfully');

      // Step 3: Update to new password
      console.log('📋 Step 3: Updating to new password...');
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('❌ Password update failed:', updateError.message);
        throw updateError;
      }

      console.log('✅ Password changed successfully!');
      return true;
      
    } catch (error: any) {
      console.error('❌ Change password error:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      // Re-throw specific errors
      if (error.message === 'Current password is incorrect') {
        throw error;
      }
      
      if (error.message?.includes('verification function not configured')) {
        throw error;
      }
      
      throw new Error(error.message || 'Failed to change password. Please try again.');
    }
  }

  // Get current user profile
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data as User;
    } catch (error) {
      console.error('Get user profile error:', error);
      return null;
    }
  }

  // Upload avatar to storage
  async uploadAvatar(userId: string, uri: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExt = uri.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return data.publicUrl;
    } catch (error) {
      console.error('Avatar upload error:', error);
      return null;
    }
  }

  // Update profile avatar URL
  async updateProfileAvatar(userId: string, avatarUrl: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Update profile avatar error:', error);
      throw error;
    }
  }

  // Create default user settings using SECURITY DEFINER function
  private async createDefaultSettings(userId: string) {
    try {
      // Use RPC function that bypasses RLS
      const { data, error } = await supabase
        .rpc('create_default_user_settings', {
          p_user_id: userId
        });

      if (error) {
        // Log but don't throw - settings are optional
        console.warn('Create default settings warning:', error.message);
      } else {
        console.log('✅ Default settings created via RPC');
      }
    } catch (error: any) {
      console.error('Create default settings error:', error);
      // Don't throw - settings are optional
    }
  }

  // Get error message key - returns a translation key (errors.auth.*) for known errors
  // Callers should use t(key) or t(key, params) to get the translated message
  // Returns { key, params } for rate-limit errors that need interpolation
  getErrorMessage(error: any): string | { key: string; params: Record<string, any> } {
    // Client-side rate-limit errors carry rateLimitType + retrySeconds
    if (error?.rateLimitType) {
      const typeMap: Record<string, string> = {
        login: 'errors.auth.tooManyLoginAttempts',
        reset: 'errors.auth.tooManyResetAttempts',
        resend: 'errors.auth.tooManyResendAttempts',
      };
      return {
        key: typeMap[error.rateLimitType] || 'errors.auth.rateLimitExceeded',
        params: { seconds: error.retrySeconds || 30 },
      };
    }

    if (error?.message) {
      // Map common Supabase errors to translation keys
      // Check for various duplicate email error messages
      if (error.message.includes('User already registered') || 
          error.message.includes('email is already registered') ||
          error.message.includes('already been registered') ||
          error.message.includes('duplicate key value')) {
        return 'errors.auth.emailAlreadyRegistered';
      }
      if (error.message.includes('Invalid login credentials')) {
        return 'errors.auth.invalidCredentials';
      }
      if (error.message.includes('Email not confirmed')) {
        return 'errors.auth.emailNotConfirmed';
      }
      if (error.message.includes('email rate limit exceeded') ||
          error.message.includes('rate limit')) {
        return 'errors.auth.rateLimitExceeded';
      }
      if (error.message.includes('Failed to create teacher record') ||
          error.message.includes('Failed to create student record')) {
        return 'errors.auth.recordCreationFailed';
      }
      // Database/RPC errors
      if (error.message.includes('function') || 
          error.message.includes('42883') ||
          error.message.includes('does not exist')) {
        return 'errors.auth.databaseError';
      }
      // Network errors
      if (error.message.includes('Network request failed') ||
          error.message.includes('network') ||
          error.message.includes('fetch')) {
        return 'errors.auth.networkError';
      }
      // For unknown errors, return the original message
      return error.message;
    }
    return 'errors.auth.unexpected';
  }

  // Check if error message indicates network error
  isNetworkError(errorMessage: string): boolean {
    return errorMessage === 'errors.auth.networkError';
  }
}

export const authService = new AuthService();
