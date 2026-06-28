/**
 * Centralized Import Security Validation Utility
 * 
 * This module provides enterprise-grade security validation for all file imports
 * across the application. It protects against:
 * - DoS attacks (file size, array limits)
 * - SQL injection
 * - XSS attacks
 * - Code injection
 * - Path traversal
 * - Data tampering
 * 
 * Usage:
 * import { validateImportFile, validateImportStructure } from '@/utils/importValidation';
 */

// File size limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_QUESTIONS_PER_IMPORT = 5000;
export const MAX_SETTINGS_PER_IMPORT = 1000;
export const MAX_FLAGS_PER_IMPORT = 500;

/**
 * Validate file before processing
 */
export function validateImportFile(
  file: File,
  options: {
    maxSize?: number;
    allowedExtensions?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const maxSize = options.maxSize || MAX_FILE_SIZE;
  const allowedExtensions = options.allowedExtensions || ['.json'];

  // 1. File size check
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large (max ${(maxSize / 1024 / 1024).toFixed(1)}MB)`
    };
  }

  // 2. File extension check
  const hasValidExtension = allowedExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Only ${allowedExtensions.join(', ')} files are allowed`
    };
  }

  // 3. File name validation (prevent path traversal)
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid file name'
    };
  }

  return { valid: true };
}

/**
 * Safely parse JSON with error handling
 */
export function safeJSONParse(text: string): { success: boolean; data?: any; error?: string } {
  try {
    const data = JSON.parse(text);
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: 'Invalid JSON format. Please check for syntax errors.'
    };
  }
}

/**
 * Check for suspicious patterns (XSS, code injection)
 */
export function detectSuspiciousPatterns(data: any): string[] {
  const suspiciousPatterns = [
    { pattern: /<script/i, name: 'Script tags' },
    { pattern: /javascript:/i, name: 'JavaScript protocol' },
    { pattern: /onerror=/i, name: 'Error event handlers' },
    { pattern: /onclick=/i, name: 'Click event handlers' },
    { pattern: /onload=/i, name: 'Load event handlers' },
    { pattern: /__proto__/, name: 'Prototype pollution' },
    { pattern: /constructor\s*\[/, name: 'Constructor access' },
    { pattern: /eval\s*\(/, name: 'Eval function' },
    { pattern: /Function\s*\(/, name: 'Function constructor' },
    { pattern: /setTimeout\s*\(/, name: 'setTimeout with string' },
    { pattern: /setInterval\s*\(/, name: 'setInterval with string' },
  ];

  const jsonString = JSON.stringify(data);
  const detected: string[] = [];

  suspiciousPatterns.forEach(({ pattern, name }) => {
    if (pattern.test(jsonString)) {
      detected.push(name);
    }
  });

  return detected;
}

/**
 * Validate string format (prevent SQL injection)
 */
export function validateKeyFormat(
  key: string,
  fieldName: string = 'key'
): { valid: boolean; error?: string } {
  // Only lowercase letters, numbers, and underscores
  if (!/^[a-z0-9_]+$/.test(key)) {
    return {
      valid: false,
      error: `Invalid ${fieldName} format: "${key}" (only lowercase letters, numbers, and underscores allowed)`
    };
  }

  // Prevent SQL keywords
  const sqlKeywords = [
    'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter',
    'truncate', 'exec', 'execute', 'union', 'where', 'from', 'table'
  ];
  
  if (sqlKeywords.includes(key.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid ${fieldName}: "${key}" is a reserved keyword`
    };
  }

  return { valid: true };
}

/**
 * Validate array size (prevent DoS)
 */
export function validateArraySize(
  array: any[],
  maxSize: number,
  arrayName: string = 'items'
): { valid: boolean; error?: string } {
  if (!Array.isArray(array)) {
    return {
      valid: false,
      error: `${arrayName} must be an array`
    };
  }

  if (array.length === 0) {
    return {
      valid: false,
      error: `${arrayName} array is empty`
    };
  }

  if (array.length > maxSize) {
    return {
      valid: false,
      error: `Too many ${arrayName} (max ${maxSize}, got ${array.length})`
    };
  }

  return { valid: true };
}

/**
 * Validate feature flag structure
 */
export function validateFeatureFlag(
  flag: any,
  index: number
): string[] {
  const errors: string[] = [];

  // Required fields
  if (!flag.flag_name || typeof flag.flag_name !== 'string') {
    errors.push(`Flag ${index + 1}: missing or invalid "flag_name"`);
  }

  if (!flag.display_name || typeof flag.display_name !== 'string') {
    errors.push(`Flag ${index + 1}: missing or invalid "display_name"`);
  }

  if (typeof flag.is_enabled !== 'boolean') {
    errors.push(`Flag ${index + 1}: "is_enabled" must be a boolean`);
  }

  // Validate flag_type
  const validFlagTypes = ['boolean', 'percentage', 'user_list', 'group_list'];
  if (flag.flag_type && !validFlagTypes.includes(flag.flag_type)) {
    errors.push(`Flag ${index + 1}: invalid flag_type "${flag.flag_type}"`);
  }

  // Validate rollout_percentage
  if (flag.flag_type === 'percentage') {
    if (typeof flag.rollout_percentage !== 'number' ||
        flag.rollout_percentage < 0 ||
        flag.rollout_percentage > 100) {
      errors.push(`Flag ${index + 1}: rollout_percentage must be between 0 and 100`);
    }
  }

  // Validate flag_name format
  if (flag.flag_name) {
    const keyValidation = validateKeyFormat(flag.flag_name, 'flag_name');
    if (!keyValidation.valid) {
      errors.push(`Flag ${index + 1}: ${keyValidation.error}`);
    }
  }

  return errors;
}

/**
 * Validate question structure for bulk upload
 * Supports: mcq, codable_open, written_open
 */
export function validateQuestion(
  question: any,
  index: number,
  availableTopics?: string[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get question type (default to 'mcq' for backward compatibility)
  const questionType = question.question_type || 'mcq';

  // Validate question_type
  if (!['mcq', 'codable_open', 'written_open'].includes(questionType)) {
    errors.push(`Question ${index + 1}: question_type must be "mcq", "codable_open", or "written_open"`);
  }

  // Common required field: question_text
  if (!question.question_text || typeof question.question_text !== 'string') {
    errors.push(`Question ${index + 1}: missing or invalid "question_text"`);
  }

  // Type-specific validation
  if (questionType === 'mcq') {
    // MCQ: Require all options and correct_answer as A-E
    const mcqFields = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];
    mcqFields.forEach(field => {
      if (!question[field] || typeof question[field] !== 'string') {
        errors.push(`Question ${index + 1}: missing or invalid "${field}" (required for MCQ)`);
      }
    });

    // Validate correct_answer for MCQ
    if (!question.correct_answer) {
      errors.push(`Question ${index + 1}: missing "correct_answer"`);
    } else if (!['A', 'B', 'C', 'D', 'E'].includes(question.correct_answer)) {
      errors.push(`Question ${index + 1}: correct_answer must be A, B, C, D, or E for MCQ`);
    }
  } else if (questionType === 'codable_open') {
    // Codable Open: Require correct_answer as text (or expected_answer for backward compatibility)
    const hasCorrectAnswer = question.correct_answer && typeof question.correct_answer === 'string';
    const hasExpectedAnswer = question.expected_answer && typeof question.expected_answer === 'string';
    
    if (!hasCorrectAnswer && !hasExpectedAnswer) {
      errors.push(`Question ${index + 1}: missing "correct_answer" or "expected_answer" (required for codable_open)`);
    }
  } else if (questionType === 'written_open') {
    // Written Open: Require correct_answer as model answer (or expected_answer for backward compatibility)
    const hasCorrectAnswer = question.correct_answer && typeof question.correct_answer === 'string';
    const hasExpectedAnswer = question.expected_answer && typeof question.expected_answer === 'string';
    
    if (!hasCorrectAnswer && !hasExpectedAnswer) {
      errors.push(`Question ${index + 1}: missing "correct_answer" or "expected_answer" (required for written_open)`);
    }
  }

  // Validate difficulty
  if (question.difficulty && !['easy', 'medium', 'hard'].includes(question.difficulty)) {
    errors.push(`Question ${index + 1}: difficulty must be "easy", "medium", or "hard"`);
  }

  // Note: exam_stage validation removed - questions no longer have exam_stage

  // Validate topic
  if (question.topic) {
    if (typeof question.topic !== 'string') {
      errors.push(`Question ${index + 1}: topic must be a string`);
    } else if (availableTopics && !availableTopics.includes(question.topic)) {
      warnings.push(`Question ${index + 1}: topic "${question.topic}" not found (will be created or question unassigned)`);
    }
  }

  // Validate text length (prevent DoS)
  if (question.question_text && question.question_text.length > 5000) {
    errors.push(`Question ${index + 1}: question_text too long (max 5000 characters)`);
  }

  ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach(option => {
    if (question[option] && question[option].length > 1000) {
      errors.push(`Question ${index + 1}: ${option} too long (max 1000 characters)`);
    }
  });

  if (question.explanation && question.explanation.length > 10000) {
    errors.push(`Question ${index + 1}: explanation too long (max 10000 characters)`);
  }

  return { errors, warnings };
}

/**
 * Comprehensive import validation
 */
export function validateImport(
  data: any,
  type: 'questions' | 'feature_flags' | 'settings',
  options: {
    availableTopics?: string[];
    maxItems?: number;
  } = {}
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check basic structure
  if (!data || typeof data !== 'object') {
    errors.push('Invalid data structure');
    return { valid: false, errors, warnings };
  }

  // 2. Detect suspicious patterns
  const suspiciousPatterns = detectSuspiciousPatterns(data);
  if (suspiciousPatterns.length > 0) {
    errors.push(`Security risk detected: ${suspiciousPatterns.join(', ')}`);
    return { valid: false, errors, warnings };
  }

  // 3. Type-specific validation
  switch (type) {
    case 'questions': {
      const maxItems = options.maxItems || MAX_QUESTIONS_PER_IMPORT;
      const sizeValidation = validateArraySize(data, maxItems, 'questions');
      if (!sizeValidation.valid) {
        errors.push(sizeValidation.error!);
        return { valid: false, errors, warnings };
      }

      data.forEach((question: any, index: number) => {
        const validation = validateQuestion(question, index, options.availableTopics);
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      });
      break;
    }

    case 'feature_flags': {
      const maxItems = options.maxItems || MAX_FLAGS_PER_IMPORT;
      const sizeValidation = validateArraySize(data, maxItems, 'feature flags');
      if (!sizeValidation.valid) {
        errors.push(sizeValidation.error!);
        return { valid: false, errors, warnings };
      }

      data.forEach((flag: any, index: number) => {
        const flagErrors = validateFeatureFlag(flag, index);
        errors.push(...flagErrors);
      });
      break;
    }

    case 'settings': {
      // Settings validation is handled in the specific component
      // This is a placeholder for future centralization
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
