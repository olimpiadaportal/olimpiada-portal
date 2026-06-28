// Account Service
// Stage 9: Profile & Settings
// Handles account management, password changes, deletion, and data export

import { supabase } from './supabase';
import { passwordPolicyService } from './passwordPolicyService';

interface PasswordStrength {
  score: number; // 0-4
  feedback: string;
  isValid: boolean;
}

class AccountService {
  /**
   * Change user password with current password verification
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔐 Starting password change process...');

      // Step 1: Get current user
      console.log('📋 Step 1: Getting current user...');
      const { data: { user }, error: getUserError } = await supabase.auth.getUser();
      
      if (getUserError) {
        console.error('❌ Error getting user:', getUserError);
        return { success: false, error: 'Failed to get user information' };
      }
      
      if (!user?.email) {
        console.error('❌ No authenticated user found');
        return { success: false, error: 'No authenticated user found' };
      }

      console.log('✅ User found:', user.email);

      // Step 2: Verify current password using RPC function
      console.log('📋 Step 2: Verifying current password...');
      
      const { data: isValid, error: verifyError } = await supabase.rpc('verify_user_password', {
        password_attempt: currentPassword
      });

      // Handle RPC errors
      if (verifyError) {
        console.error('❌ RPC Error Details:', JSON.stringify(verifyError, null, 2));
        
        // Check if function doesn't exist or crypt() is missing
        if (verifyError.code === 'PGRST202' || verifyError.code === '42883' || verifyError.message?.includes('function')) {
          console.error('🚨 CRITICAL: verify_user_password function not found in database!');
          return { 
            success: false, 
            error: 'password.passwordVerificationNotConfigured' 
          };
        }
        
        return { success: false, error: 'password.passwordVerificationFailed' };
      }

      // Check if password is valid
      if (isValid === null || isValid === undefined) {
        console.error('❌ RPC returned null/undefined result');
        return { success: false, error: 'password.passwordVerificationFailed' };
      }

      if (!isValid) {
        console.error('❌ Current password is INCORRECT');
        return { success: false, error: 'password.currentPasswordIncorrect' };
      }

      console.log('✅ Current password verified successfully');

      // Step 3: Validate new password against admin panel policy
      console.log('📋 Step 3: Validating new password policy...');
      
      try {
        const validation = await passwordPolicyService.validatePassword(newPassword);
        console.log('📊 Password policy validation result:', validation);
        
        if (!validation.isValid) {
          console.error('❌ New password does not meet policy requirements');
          return {
            success: false,
            error: validation.errors.join(', '),
          };
        }

        console.log('✅ New password meets policy requirements');
      } catch (policyError: any) {
        console.error('❌ Error validating password policy:', policyError);
        // Continue anyway if policy service fails
        console.log('⚠️ Continuing without policy validation due to error');
      }

      // Step 4: Update password in Supabase Auth
      console.log('📋 Step 4: Updating to new password...');
      
      try {
        // Create a promise that resolves when USER_UPDATED event fires
        const updateWithEventListener = new Promise<{ success: boolean; error?: string }>((resolve) => {
          let resolved = false;
          
          // Set up a one-time listener for USER_UPDATED event
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'USER_UPDATED' && !resolved) {
              resolved = true;
              subscription.unsubscribe();
              console.log('✅ Password changed successfully (USER_UPDATED event received)');
              resolve({ success: true });
            }
          });
          
          // Also set a timeout in case the event doesn't fire
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              subscription.unsubscribe();
              console.log('⚠️ Timeout waiting for USER_UPDATED event');
              resolve({ success: true }); // Assume success since updateUser was called
            }
          }, 5000);
          
          // Call updateUser (don't await it since it may not resolve)
          supabase.auth.updateUser({ password: newPassword }).then((result) => {
            if (result.error && !resolved) {
              resolved = true;
              subscription.unsubscribe();
              console.error('❌ Password update error:', result.error);
              resolve({ success: false, error: result.error.message });
            }
          }).catch((err) => {
            if (!resolved) {
              resolved = true;
              subscription.unsubscribe();
              console.error('❌ Password update exception:', err);
              resolve({ success: false, error: err.message });
            }
          });
        });
        
        const result = await updateWithEventListener;
        return result;
      } catch (updateError: any) {
        console.error('❌ Exception during password update:', updateError);
        return {
          success: false,
          error: updateError.message || 'Failed to update password',
        };
      }
    } catch (error: any) {
      console.error('❌ Error changing password:', error);
      return {
        success: false,
        error: error.message || 'Failed to change password',
      };
    }
  }

  /**
   * Check password strength
   */
  checkPasswordStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];

    // Length check
    if (password.length < 8) {
      return {
        score: 0,
        feedback: 'Password must be at least 8 characters long',
        isValid: false,
      };
    }
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety checks
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      score++;
    } else {
      feedback.push('Include both uppercase and lowercase letters');
    }

    if (/\d/.test(password)) {
      score++;
    } else {
      feedback.push('Include at least one number');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score++;
    } else {
      feedback.push('Include at least one special character');
    }

    // Common patterns check
    const commonPatterns = ['123456', 'password', 'qwerty', 'abc123'];
    if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
      score = Math.max(0, score - 2);
      feedback.push('Avoid common patterns');
    }

    // Generate feedback message
    let feedbackMessage = '';
    if (score === 0 || score === 1) {
      feedbackMessage = 'Weak password';
    } else if (score === 2) {
      feedbackMessage = 'Fair password';
    } else if (score === 3) {
      feedbackMessage = 'Good password';
    } else if (score === 4) {
      feedbackMessage = 'Strong password';
    } else {
      feedbackMessage = 'Very strong password';
    }

    if (feedback.length > 0) {
      feedbackMessage += ': ' + feedback.join(', ');
    }

    return {
      score: Math.min(score, 4),
      feedback: feedbackMessage,
      isValid: score >= 3, // Require at least "Good" password
    };
  }

  /**
   * Delete user account
   * GDPR compliant - removes all user data
   * Uses Edge Function for secure server-side deletion
   */
  async deleteAccount(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🗑️ Deleting account for user:', userId);

      // Get the current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return {
          success: false,
          error: 'No active session. Please log in again.',
        };
      }

      // Call the Edge Function for secure account deletion
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
      });

      if (error) {
        console.error('Account deletion error:', error);
        return {
          success: false,
          error: error.message || 'Failed to delete account',
        };
      }

      if (data?.error) {
        console.error('Account deletion error:', data.error);
        return {
          success: false,
          error: data.error,
        };
      }

      // Clear all local cached data to prevent stale state on app reload
      console.log('🧹 Clearing all local user data...');
      try {
        const { offlineService } = await import('./offlineService');
        await offlineService.clearAllUserData();
      } catch (cleanupError: any) {
        console.warn('Offline cache cleanup warning after account deletion:', cleanupError?.message || cleanupError);
      }

      try {
        const { secureAuthService } = await import('./secureAuthService');
        await secureAuthService.clearStoredCredentials();
      } catch (credentialError: any) {
        console.warn('Stored credential cleanup warning after account deletion:', credentialError?.message || credentialError);
      }

      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
          const isAlreadySignedOut =
            signOutError.name === 'AuthSessionMissingError' ||
            signOutError.message?.toLowerCase().includes('auth session missing') ||
            signOutError.message?.toLowerCase().includes('session_not_found');

          if (!isAlreadySignedOut) {
            console.warn('Local session cleanup warning after account deletion:', signOutError.message);
          }
        }
      } catch (signOutCleanupError: any) {
        console.warn('Local session cleanup warning after account deletion:', signOutCleanupError?.message || signOutCleanupError);
      }

      console.log('✅ Account deleted successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting account:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete account',
      };
    }
  }

  /**
   * Export all user data (GDPR compliance)
   */
  async exportUserData(userId: string): Promise<string | null> {
    try {
      console.log('📦 Exporting user data...');

      const exportData: any = {
        export_date: new Date().toISOString(),
        user_id: userId,
      };

      // Get profile data
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      exportData.profile = profile;

      // Get student data
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('user_id', userId)
        .single();
      exportData.student = student;

      if (student) {
        // Get daily stats
        const { data: dailyStats } = await supabase
          .from('daily_stats')
          .select('*')
          .eq('student_id', student.id);
        exportData.daily_stats = dailyStats;

        // Get activity log
        const { data: activityLog } = await supabase
          .from('activity_log')
          .select('*')
          .eq('student_id', student.id);
        exportData.activity_log = activityLog;

        // Get study progress
        const { data: studyProgress } = await supabase
          .from('study_progress')
          .select('*')
          .eq('student_id', student.id);
        exportData.study_progress = studyProgress;

        // Get achievements
        const { data: achievements } = await supabase
          .from('achievements')
          .select('*')
          .eq('student_id', student.id);
        exportData.achievements = achievements;

        // Get study goals
        const { data: studyGoals } = await supabase
          .from('study_goals')
          .select('*')
          .eq('student_id', student.id);
        exportData.study_goals = studyGoals;

        // Get exam attempts
        const { data: examAttempts } = await supabase
          .from('mock_exam_attempts')
          .select('*')
          .eq('user_id', userId);
        exportData.exam_attempts = examAttempts;
      }

      // Get settings
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      exportData.settings = settings;

      console.log('✅ User data exported successfully');
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting user data:', error);
      return null;
    }
  }

  /**
   * Verify user account (email verification)
   */
  async verifyAccount(userId: string): Promise<boolean> {
    try {
      console.log('✉️ Verifying account for user:', userId);

      const { error } = await supabase
        .from('profiles')
        .update({
          email_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      console.log('✅ Account verified successfully');
      return true;
    } catch (error) {
      console.error('Error verifying account:', error);
      return false;
    }
  }

  /**
   * Check if account is verified
   */
  async isAccountVerified(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('email_verified')
        .eq('id', userId)
        .single();

      if (error) throw error;

      return data?.email_verified || false;
    } catch (error) {
      console.error('Error checking account verification:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📧 Sending password reset email to:', email);

      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        console.error('Password reset error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      console.log('✅ Password reset email sent');
      return { success: true };
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      return {
        success: false,
        error: error.message || 'Failed to send reset email',
      };
    }
  }

  /**
   * Update email address
   */
  async updateEmail(newEmail: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📧 Updating email to:', newEmail);

      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) {
        console.error('Email update error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      console.log('✅ Email updated successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Error updating email:', error);
      return {
        success: false,
        error: error.message || 'Failed to update email',
      };
    }
  }

  /**
   * Get account status
   */
  async getAccountStatus(userId: string): Promise<{
    isVerified: boolean;
    createdAt: string;
    lastSignIn: string;
  } | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return null;

      return {
        isVerified: user.email_confirmed_at !== null,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at || user.created_at,
      };
    } catch (error) {
      console.error('Error getting account status:', error);
      return null;
    }
  }
}

export const accountService = new AccountService();
