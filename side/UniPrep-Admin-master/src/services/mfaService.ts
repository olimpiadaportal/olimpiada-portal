import { supabase } from '@/lib/supabase';

export interface MFAEnrollmentData {
  qrCode: string;
  secret: string;
  factorId: string;
  uri: string;
}

export interface MFAFactor {
  id: string;
  friendly_name?: string;
  factor_type: 'totp' | 'phone';
  status: 'verified' | 'unverified';
  created_at: string;
  updated_at: string;
}

export interface MFAVerifyResult {
  success: boolean;
  error?: string;
}

class MFAService {
  /**
   * Enroll user in TOTP 2FA
   * Returns QR code and secret for authenticator app setup
   */
  async enrollTOTP(friendlyName: string = 'Elmly Admin'): Promise<MFAEnrollmentData> {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (error) throw error;

      if (!data.totp) {
        throw new Error('Failed to generate TOTP enrollment data');
      }

      return {
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        factorId: data.id,
        uri: data.totp.uri,
      };
    } catch (error) {
      console.error('MFA enrollment error:', error);
      throw error;
    }
  }

  /**
   * Verify TOTP code during enrollment to complete setup
   */
  async verifyEnrollment(factorId: string, code: string): Promise<MFAVerifyResult> {
    try {
      // Create a challenge
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      if (!challenge) {
        throw new Error('Failed to create MFA challenge');
      }

      // Verify the code
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('MFA verification error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Verification failed' 
      };
    }
  }

  /**
   * Verify TOTP code during login
   */
  async verifyLogin(factorId: string, code: string): Promise<MFAVerifyResult> {
    try {
      // Create a challenge
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError) throw challengeError;

      if (!challenge) {
        throw new Error('Failed to create MFA challenge');
      }

      // Verify the code
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('MFA login verification error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Verification failed' 
      };
    }
  }

  /**
   * Get user's enrolled MFA factors
   */
  async getFactors(): Promise<{ totp: MFAFactor[]; phone: MFAFactor[] }> {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) throw error;

      return {
        totp: (data?.totp || []) as MFAFactor[],
        phone: (data?.phone || []) as MFAFactor[],
      };
    } catch (error) {
      console.error('Get MFA factors error:', error);
      return { totp: [], phone: [] };
    }
  }

  /**
   * Check if user has MFA enabled
   */
  async hasMFAEnabled(): Promise<boolean> {
    try {
      const factors = await this.getFactors();
      return factors.totp.some(f => f.status === 'verified');
    } catch (error) {
      console.error('Check MFA enabled error:', error);
      return false;
    }
  }

  /**
   * Get the verified TOTP factor for login verification
   */
  async getVerifiedTOTPFactor(): Promise<MFAFactor | null> {
    try {
      const factors = await this.getFactors();
      return factors.totp.find(f => f.status === 'verified') || null;
    } catch (error) {
      console.error('Get verified TOTP factor error:', error);
      return null;
    }
  }

  /**
   * Unenroll from 2FA (remove a factor)
   */
  async unenroll(factorId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('MFA unenroll error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unenroll failed' 
      };
    }
  }

  /**
   * Get current MFA assurance level
   * Returns 'aal1' (password only) or 'aal2' (password + MFA)
   */
  async getAssuranceLevel(): Promise<{ currentLevel: string; nextLevel: string | null }> {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (error) throw error;

      return {
        currentLevel: data?.currentLevel || 'aal1',
        nextLevel: data?.nextLevel || null,
      };
    } catch (error) {
      console.error('Get assurance level error:', error);
      return { currentLevel: 'aal1', nextLevel: null };
    }
  }

  /**
   * Check if MFA verification is required
   * Returns true if user has MFA enabled but hasn't verified yet in this session
   */
  async isMFAVerificationRequired(): Promise<boolean> {
    try {
      const { currentLevel, nextLevel } = await this.getAssuranceLevel();
      // If nextLevel is 'aal2', user needs to verify MFA
      return nextLevel === 'aal2' && currentLevel === 'aal1';
    } catch (error) {
      console.error('Check MFA required error:', error);
      return false;
    }
  }
}

export const mfaService = new MFAService();
