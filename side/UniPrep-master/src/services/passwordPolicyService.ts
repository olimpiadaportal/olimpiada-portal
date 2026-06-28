// Password Policy Service
// Stage 6 - Week 3: Mobile Feature Integration
// Handles dynamic password validation based on admin panel settings

import { systemSettingsService, SystemSettings } from './systemSettingsService';
import i18n from '../i18n';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

export interface PasswordRequirement {
  met: boolean;
  message: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: {
    score: number;
    label: 'weak' | 'medium' | 'strong';
    color: string;
  };
  // Requirements are dynamic - only enabled requirements are included
  requirements: {
    minLength?: PasswordRequirement;
    uppercase?: PasswordRequirement;
    lowercase?: PasswordRequirement;
    number?: PasswordRequirement;
    special?: PasswordRequirement;
  };
}

// Default policy (fallback if settings not available)
const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
};

class PasswordPolicyService {
  private cachedPolicy: PasswordPolicy | null = null;
  private lastPolicyFetch: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current password policy from system settings
   */
  async getPolicy(): Promise<PasswordPolicy> {
    try {
      // Check cache
      if (this.cachedPolicy && (Date.now() - this.lastPolicyFetch) < this.CACHE_TTL) {
        return this.cachedPolicy;
      }

      // Fetch from system settings
      const settings = await systemSettingsService.getSettings();
      
      if (settings) {
        this.cachedPolicy = {
          minLength: settings.password_min_length || DEFAULT_POLICY.minLength,
          requireUppercase: settings.password_require_uppercase ?? DEFAULT_POLICY.requireUppercase,
          requireLowercase: settings.password_require_lowercase ?? DEFAULT_POLICY.requireLowercase,
          requireNumber: settings.password_require_number ?? DEFAULT_POLICY.requireNumber,
          requireSpecial: settings.password_require_special ?? DEFAULT_POLICY.requireSpecial,
        };
        this.lastPolicyFetch = Date.now();
        console.log('🔐 Password policy loaded:', this.cachedPolicy);
        return this.cachedPolicy;
      }

      return DEFAULT_POLICY;
    } catch (error) {
      console.error('Error fetching password policy:', error);
      return DEFAULT_POLICY;
    }
  }

  /**
   * Validate password against current policy
   * Only returns requirements that are enabled in the admin panel
   */
  async validatePassword(password: string): Promise<PasswordValidationResult> {
    const policy = await this.getPolicy();
    const errors: string[] = [];

    // Build requirements object - only include enabled requirements
    const requirements: Record<string, { met: boolean; message: string }> = {};

    // Min length is always required
    requirements.minLength = {
      met: password.length >= policy.minLength,
      message: i18n.t('password.requirements.minLength', { count: policy.minLength }),
    };
    if (!requirements.minLength.met) {
      errors.push(requirements.minLength.message);
    }

    // Only add uppercase requirement if enabled in policy
    if (policy.requireUppercase) {
      requirements.uppercase = {
        met: /[A-Z]/.test(password),
        message: i18n.t('password.requirements.uppercase'),
      };
      if (!requirements.uppercase.met) {
        errors.push(requirements.uppercase.message);
      }
    }

    // Only add lowercase requirement if enabled in policy
    if (policy.requireLowercase) {
      requirements.lowercase = {
        met: /[a-z]/.test(password),
        message: i18n.t('password.requirements.lowercase'),
      };
      if (!requirements.lowercase.met) {
        errors.push(requirements.lowercase.message);
      }
    }

    // Only add number requirement if enabled in policy
    if (policy.requireNumber) {
      requirements.number = {
        met: /[0-9]/.test(password),
        message: i18n.t('password.requirements.number'),
      };
      if (!requirements.number.met) {
        errors.push(requirements.number.message);
      }
    }

    // Only add special character requirement if enabled in policy
    if (policy.requireSpecial) {
      requirements.special = {
        met: /[!@#$%^&*(),.?":{}|<>]/.test(password),
        message: i18n.t('password.requirements.special'),
      };
      if (!requirements.special.met) {
        errors.push(requirements.special.message);
      }
    }

    // Calculate strength
    const strength = this.calculateStrength(password, policy);

    return {
      isValid: errors.length === 0,
      errors,
      strength,
      requirements,
    };
  }

  /**
   * Calculate password strength score
   */
  private calculateStrength(
    password: string,
    policy: PasswordPolicy
  ): { score: number; label: 'weak' | 'medium' | 'strong'; color: string } {
    let score = 0;
    const maxScore = 6;

    // Length scoring
    if (password.length >= policy.minLength) score++;
    if (password.length >= policy.minLength + 4) score++;
    if (password.length >= policy.minLength + 8) score++;

    // Character variety
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Normalize to 0-6 scale
    score = Math.min(score, maxScore);

    if (score <= 2) {
      return { score, label: 'weak', color: '#EF3340' };
    } else if (score <= 4) {
      return { score, label: 'medium', color: '#F59E0B' };
    } else {
      return { score, label: 'strong', color: '#00B67A' };
    }
  }

  /**
   * Get policy requirements as formatted strings (for UI display)
   */
  async getPolicyRequirements(): Promise<string[]> {
    const policy = await this.getPolicy();
    const requirements: string[] = [];

    requirements.push(i18n.t('password.requirements.minLength', { count: policy.minLength }));
    
    if (policy.requireUppercase) {
      requirements.push(i18n.t('password.requirements.uppercase'));
    }
    if (policy.requireLowercase) {
      requirements.push(i18n.t('password.requirements.lowercase'));
    }
    if (policy.requireNumber) {
      requirements.push(i18n.t('password.requirements.number'));
    }
    if (policy.requireSpecial) {
      requirements.push(i18n.t('password.requirements.special'));
    }

    return requirements;
  }

  /**
   * Clear cached policy (force refresh on next call)
   */
  clearCache(): void {
    this.cachedPolicy = null;
    this.lastPolicyFetch = 0;
    console.log('🗑️ Password policy cache cleared');
  }

  /**
   * Create a Zod schema based on current policy
   * This allows dynamic validation in forms
   */
  async createZodSchema() {
    const { z } = await import('zod');
    const policy = await this.getPolicy();

    let schema = z.string().min(policy.minLength, `Password must be at least ${policy.minLength} characters`);

    if (policy.requireUppercase) {
      schema = schema.regex(/[A-Z]/, 'Password must contain at least one uppercase letter');
    }
    if (policy.requireLowercase) {
      schema = schema.regex(/[a-z]/, 'Password must contain at least one lowercase letter');
    }
    if (policy.requireNumber) {
      schema = schema.regex(/[0-9]/, 'Password must contain at least one number');
    }
    if (policy.requireSpecial) {
      schema = schema.regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');
    }

    return schema;
  }
}

export const passwordPolicyService = new PasswordPolicyService();
