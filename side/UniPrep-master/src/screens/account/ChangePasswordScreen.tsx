// Change Password Screen
// Stage 9 - Phase 4
// Password change with strength validation

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { accountService } from '../../services/accountService';
import { passwordPolicyService, PasswordValidationResult } from '../../services/passwordPolicyService';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAlert } from '../../components/AlertProvider';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineScreen } from '../../components/OfflineScreen';

export const ChangePasswordScreen = () => {
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();
  const { t } = useLanguage();
  const { showSuccess, showError } = useAlert();
  const { isOnline } = useNetworkStatus();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidationResult | null>(null);
  const [policyRequirements, setPolicyRequirements] = useState<string[]>([]);

  // Load password policy requirements on mount
  useEffect(() => {
    const loadPolicy = async () => {
      try {
        const requirements = await passwordPolicyService.getPolicyRequirements();
        setPolicyRequirements(requirements);
      } catch (error) {
        console.error('Error loading password policy:', error);
      }
    };
    loadPolicy();
  }, []);

  // Validate password against policy when it changes
  useEffect(() => {
    const validatePassword = async () => {
      if (newPassword.length > 0) {
        const result = await passwordPolicyService.validatePassword(newPassword);
        setPasswordValidation(result);
      } else {
        setPasswordValidation(null);
      }
    };
    validatePassword();
  }, [newPassword]);

  const getStrengthColor = () => {
    if (!passwordValidation) return colors.error;
    return passwordValidation.strength.color;
  };

  const getStrengthText = () => {
    if (!passwordValidation) return '';
    const label = passwordValidation.strength.label;
    if (label === 'weak') return t('password.weak');
    if (label === 'medium') return t('password.fair');
    return t('password.strong');
  };

  const getStrengthScore = () => {
    if (!passwordValidation) return 0;
    // Normalize score to 0-4 range for the 5 bars
    return Math.min(Math.floor(passwordValidation.strength.score * 4 / 6), 4);
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword.trim()) {
      showError(t('common.error'), 'Current password is required');
      return;
    }

    if (!newPassword.trim()) {
      showError(t('common.error'), 'New password is required');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError(t('common.error'), t('password.passwordMismatch'));
      return;
    }

    if (!passwordValidation || !passwordValidation.isValid) {
      const errorMsg = passwordValidation?.errors.join(', ') || 'Password does not meet requirements';
      showError(t('common.error'), errorMsg);
      return;
    }

    try {
      setLoading(true);

      const result = await accountService.changePassword(currentPassword, newPassword);

      if (result.success) {
        showSuccess(
          t('common.success'),
          t('password.passwordChanged'),
          () => navigation.goBack()
        );
      } else {
        // Translate error message if it's a translation key
        const errorMessage = result.error?.startsWith('password.')
          ? t(result.error)
          : result.error || t('errors.generic');
        showError(t('common.error'), errorMessage);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      showError(t('common.error'), t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOnline) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={28} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {t('settings.changePassword')}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <OfflineScreen
          title={t('offline.accountTitle')}
          message={t('offline.accountMessage')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="lock-closed-outline"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>
            {t('settings.changePassword')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
          {/* Current Password */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: themeColors.text }]}>
              {t('password.currentPassword')}
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}>
              <Ionicons name="lock-closed-outline" size={20} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder={t('password.currentPassword')}
                placeholderTextColor={themeColors.placeholder}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrentPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                <Ionicons
                  name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: themeColors.text }]}>
              {t('password.newPassword')}
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}>
              <Ionicons name="lock-closed-outline" size={20} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder={t('password.newPassword')}
                placeholderTextColor={themeColors.placeholder}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                <Ionicons
                  name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBars}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            index <= getStrengthScore()
                              ? getStrengthColor()
                              : themeColors.disabled,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthText, { color: getStrengthColor() }]}>
                  {getStrengthText()}
                </Text>
                {passwordValidation && passwordValidation.errors.length > 0 && (
                  <Text style={[styles.feedbackText, { color: themeColors.textSecondary }]}>
                    {passwordValidation.errors[0]}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.inputSection}>
            <Text style={[styles.label, { color: themeColors.text }]}>
              {t('password.confirmPassword')}
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}>
              <Ionicons name="lock-closed-outline" size={20} color={themeColors.textSecondary} />
              <TextInput
                style={[styles.input, { color: themeColors.text }]}
                placeholder={t('password.confirmPassword')}
                placeholderTextColor={themeColors.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {t('password.passwordMismatch')}
              </Text>
            )}
          </View>

          {/* Requirements */}
          <View style={[styles.requirementsContainer, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.requirementsTitle, { color: themeColors.text }]}>
              {t('password.requirements.title')}
            </Text>
            {policyRequirements.map((requirement, index) => (
              <Text key={index} style={[styles.requirementText, { color: themeColors.textSecondary }]}>
                - {requirement}
              </Text>
            ))}
          </View>

          {/* Change Password Button */}
          <TouchableOpacity
            style={[
              styles.changeButton,
              { backgroundColor: colors.primary },
              loading && styles.disabledButton,
            ]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={[styles.changeButtonText, styles.loadingText]}>
                  {t('common.loading')}
                </Text>
              </View>
            ) : (
              <Text style={styles.changeButtonText}>
                {t('settings.changePassword')}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  inputSection: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  input: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.md,
  },
  strengthContainer: {
    marginTop: spacing.sm,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
  },
  feedbackText: {
    fontSize: typography.fontSizes.xs,
  },
  errorText: {
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
  requirementsContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xl,
  },
  requirementsTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.sm,
  },
  requirementText: {
    fontSize: typography.fontSizes.xs,
    marginBottom: spacing.xs,
  },
  changeButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  disabledButton: {
    opacity: 0.5,
  },
  changeButtonText: {
    color: '#fff',
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: spacing.sm,
  },
});
