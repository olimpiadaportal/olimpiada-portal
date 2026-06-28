// PasswordRequirements Component
// Stage 6 - Week 3: Mobile Feature Integration
// Shows dynamic password requirements based on admin settings

import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { passwordPolicyService, PasswordValidationResult } from '../services/passwordPolicyService';
import { typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface PasswordRequirementsProps {
  /**
   * Current password value to validate
   */
  password: string;
  
  /**
   * Show requirements even when password is empty
   * @default true
   */
  showWhenEmpty?: boolean;
  
  /**
   * Compact mode - show only unmet requirements
   * @default false
   */
  compact?: boolean;
  
  /**
   * Callback when validation result changes
   */
  onValidationChange?: (result: PasswordValidationResult) => void;
}

export const PasswordRequirements: React.FC<PasswordRequirementsProps> = ({
  password,
  showWhenEmpty = true,
  compact = false,
  onValidationChange,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validatePassword = async () => {
      try {
        setLoading(true);
        const result = await passwordPolicyService.validatePassword(password);
        setValidation(result);
        onValidationChange?.(result);
      } catch (error) {
        console.error('Error validating password:', error);
      } finally {
        setLoading(false);
      }
    };

    validatePassword();
  }, [password]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!validation) {
    return null;
  }

  if (!showWhenEmpty && !password) {
    return null;
  }

  const requirements = Object.entries(validation.requirements);
  const displayRequirements = compact
    ? requirements.filter(([_, req]) => !req.met)
    : requirements;

  return (
    <View style={styles.container}>
      {/* Strength Indicator */}
      {password.length > 0 && (
        <View style={styles.strengthContainer}>
          <Text style={styles.strengthLabel}>
            {t('auth.passwordStrength', 'Password Strength')}:
          </Text>
          <View style={styles.strengthBarContainer}>
            <View
              style={[
                styles.strengthBar,
                {
                  width: `${(validation.strength.score / 6) * 100}%`,
                  backgroundColor: validation.strength.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthText, { color: validation.strength.color }]}>
            {validation.strength.label === 'weak' && t('auth.weak', 'Weak')}
            {validation.strength.label === 'medium' && t('auth.medium', 'Medium')}
            {validation.strength.label === 'strong' && t('auth.strong', 'Strong')}
          </Text>
        </View>
      )}

      {/* Requirements List */}
      <View style={styles.requirementsList}>
        {displayRequirements.map(([key, requirement]) => (
          <View key={key} style={styles.requirementItem}>
            <Ionicons
              name={requirement.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={requirement.met ? colors.success : colors.textSecondary}
            />
            <Text
              style={[
                styles.requirementText,
                requirement.met && styles.requirementMet,
              ]}
            >
              {getRequirementText(key, requirement.message, t)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Helper function to get translated requirement text
function getRequirementText(
  key: string,
  fallback: string,
  t: any
): string {
  const translations: Record<string, string> = {
    minLength: t('password.requirements.minLength', { count: 8, defaultValue: fallback }),
    uppercase: t('password.requirements.uppercase', { defaultValue: 'At least one uppercase letter' }),
    lowercase: t('password.requirements.lowercase', { defaultValue: 'At least one lowercase letter' }),
    number: t('password.requirements.number', { defaultValue: 'At least one number' }),
    special: t('password.requirements.special', { defaultValue: 'At least one special character' }),
  };

  return translations[key] || fallback;
}

/**
 * Simple password strength indicator
 */
export function PasswordStrengthIndicator({ password }: { password: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [strength, setStrength] = useState<{
    score: number;
    label: string;
    color: string;
  } | null>(null);

  useEffect(() => {
    const checkStrength = async () => {
      if (!password) {
        setStrength(null);
        return;
      }
      const result = await passwordPolicyService.validatePassword(password);
      setStrength(result.strength);
    };

    checkStrength();
  }, [password]);

  if (!strength) {
    return null;
  }

  return (
    <View style={styles.simpleStrengthContainer}>
      <View style={styles.strengthBarContainer}>
        <View
          style={[
            styles.strengthBar,
            {
              width: `${(strength.score / 6) * 100}%`,
              backgroundColor: strength.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  strengthContainer: {
    marginBottom: spacing.sm,
  },
  strengthLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  strengthBarContainer: {
    height: 4,
    backgroundColor: colors.disabled,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  requirementsList: {
    marginTop: spacing.xs,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  requirementText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  requirementMet: {
    color: colors.success,
  },
  simpleStrengthContainer: {
    marginTop: 4,
  },
});

export default PasswordRequirements;
