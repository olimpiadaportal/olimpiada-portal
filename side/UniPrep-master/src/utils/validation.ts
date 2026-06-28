import { z } from 'zod';

// Common validation rules - using translation keys as error messages
// These keys will be translated in the component using t()
const emailSchema = z.string().email('validation.invalidEmail');

// Default password schema (used when dynamic policy not available)
const passwordSchema = z
  .string()
  .min(8, 'validation.passwordMin8')
  .regex(/[A-Z]/, 'validation.passwordUppercase')
  .regex(/[a-z]/, 'validation.passwordLowercase')
  .regex(/[0-9]/, 'validation.passwordNumber');

/**
 * Create dynamic password schema based on admin settings
 * Use this for forms that need to validate against current policy
 */
export async function createDynamicPasswordSchema() {
  try {
    const { passwordPolicyService } = await import('../services/passwordPolicyService');
    return await passwordPolicyService.createZodSchema();
  } catch (error) {
    console.warn('Could not load dynamic password policy, using default');
    return passwordSchema;
  }
}

/**
 * Validate password against dynamic policy
 * Returns validation result with detailed feedback
 */
export async function validatePasswordWithPolicy(password: string) {
  try {
    const { passwordPolicyService } = await import('../services/passwordPolicyService');
    return await passwordPolicyService.validatePassword(password);
  } catch (error) {
    console.warn('Could not validate with dynamic policy');
    return {
      isValid: passwordSchema.safeParse(password).success,
      errors: [],
      strength: { score: 0, label: 'unknown' as const, color: '#999' },
      requirements: {},
    };
  }
}

const phoneSchema = z
  .string()
  .regex(/^[+]?[\d\s]{10,20}$/, 'validation.invalidPhone')
  .optional()
  .or(z.literal(''));

// Login validation schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'validation.passwordRequired'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Student signup validation schema
// Note: targetGroup, targetUniversity, graduationYear moved to personalization quiz
export const studentSignupSchema = z.object({
  firstName: z.string().min(2, 'validation.firstNameMin2'),
  lastName: z.string().min(2, 'validation.lastNameMin2'),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  city: z.string().min(1, 'validation.cityRequired'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'validation.passwordsMismatch',
  path: ['confirmPassword'],
});

export type StudentSignupFormData = z.infer<typeof studentSignupSchema>;

// Teacher signup validation schema
// Note: specializations, experienceYears, availableGroups, bio, hourlyRate, monthlyRate
// are now collected in the teacher onboarding quiz after registration
export const teacherSignupSchema = z.object({
  firstName: z.string().min(2, 'validation.firstNameMin2'),
  lastName: z.string().min(2, 'validation.lastNameMin2'),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  city: z.string().min(1, 'validation.cityRequired'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'validation.passwordsMismatch',
  path: ['confirmPassword'],
});

export type TeacherSignupFormData = z.infer<typeof teacherSignupSchema>;

// Forgot password validation schema
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

// Change password validation schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'validation.currentPasswordRequired'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'validation.passwordsMismatch',
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'validation.newPasswordMustDiffer',
  path: ['newPassword'],
});

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// Password strength checker
export const getPasswordStrength = (password: string): {
  score: number;
  label: string;
  color: string;
} => {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) {
    return { score, label: 'Weak', color: '#EF3340' };
  } else if (score <= 4) {
    return { score, label: 'Medium', color: '#F59E0B' };
  } else {
    return { score, label: 'Strong', color: '#00B67A' };
  }
};

// Additional validation schemas
export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be less than 50 characters')
  .regex(/^[a-zA-ZğüşıöçĞÜŞİÖÇәəӘƏ\s'-]+$/, 'Name contains invalid characters');

export const bioSchema = z
  .string()
  .max(500, 'Bio must be less than 500 characters')
  .optional();

export const phoneSchemaAzerbaijan = z
  .string()
  .regex(/^\+994(50|51|55|70|77|99)\d{7}$/, 'Invalid Azerbaijan phone number format')
  .optional();

// Sanitize HTML/script tags and dangerous characters
// Industry best practice: Defense in depth with multiple layers
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  return input
    // Remove script tags and event handlers
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Note: SQL character stripping removed (MEDIUM-06 security audit fix)
    // Supabase uses parameterized queries — no SQL injection risk.
    // Stripping quotes broke legitimate names like O'Brien, D'Souza.
    // Remove null bytes and control characters
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Remove potential XSS vectors
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    // Trim whitespace
    .trim();
}

// Sanitize email specifically (more permissive for valid email chars)
export function sanitizeEmail(email: string): string {
  if (!email) return '';
  
  return email
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Trim and lowercase
    .trim()
    .toLowerCase();
}

// Sanitize and validate
export function validateAndSanitize<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(input);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: 'Validation failed' };
  }
}

// Validate email format
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

// Validate password strength
export function isStrongPassword(password: string): boolean {
  return passwordSchema.safeParse(password).success;
}
