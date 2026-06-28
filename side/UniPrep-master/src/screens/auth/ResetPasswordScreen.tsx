// Reset Password Screen
// Shown when user clicks password reset link from email

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { supabase } from '../../services/supabase';
import { validatePasswordWithPolicy } from '../../utils/validation';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../components/AlertProvider';

type ResetPasswordParams = {
  accessToken?: string;
  refreshToken?: string;
};

interface FormData {
  password: string;
  confirmPassword: string;
}

export const ResetPasswordScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: ResetPasswordParams }, 'params'>>();
  const { colors: themeColors } = useTheme();
  const { showError } = useAlert();
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');

  const { control, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const watchedPassword = watch('password');
  
  useEffect(() => {
    setPasswordValue(watchedPassword || '');
  }, [watchedPassword]);

  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      const { accessToken, refreshToken } = route.params || {};
      
      if (!accessToken || !refreshToken) {
        setErrorMessage(t('auth.resetPassword.invalidLink'));
        setStatus('error');
        return;
      }

      // Set the session with the tokens from the email link
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('Session initialization error:', error);
        setErrorMessage(error.message);
        setStatus('error');
        return;
      }

      setStatus('ready');
    } catch (error: any) {
      console.error('Session initialization error:', error);
      setErrorMessage(error.message || t('auth.resetPassword.error'));
      setStatus('error');
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      setSubmitting(true);

      // Validate password against policy
      const passwordValidation = await validatePasswordWithPolicy(data.password);
      if (!passwordValidation.isValid) {
        showError(t('common.error'), passwordValidation.errors[0]);
        setSubmitting(false);
        return;
      }

      // Check passwords match
      if (data.password !== data.confirmPassword) {
        showError(t('common.error'), t('auth.resetPassword.passwordsDoNotMatch'));
        setSubmitting(false);
        return;
      }

      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        console.error('Password update error:', error);
        showError(t('common.error'), error.message);
        setSubmitting(false);
        return;
      }

      setStatus('success');
    } catch (error: any) {
      console.error('Password update error:', error);
      showError(t('common.error'), error.message || t('auth.resetPassword.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoToLogin = () => {
    // Sign out and go to login
    supabase.auth.signOut({ scope: 'local' }).then(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    });
  };

  const handleRetry = () => {
    setStatus('loading');
    initializeSession();
  };

  // Loading state
  if (status === 'loading') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.title, { color: themeColors.text }]}>
            {t('auth.resetPassword.initializing')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.iconContainer, { backgroundColor: colors.error + '20' }]}>
            <Ionicons name="close-circle" size={80} color={colors.error} />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>
            {t('auth.resetPassword.linkExpired')}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {errorMessage || t('auth.resetPassword.linkExpiredMessage')}
          </Text>
          <Button
            title={t('common.retry')}
            onPress={handleRetry}
            fullWidth
            style={styles.button}
          />
          <Button
            title={t('auth.resetPassword.requestNewLink')}
            onPress={() => navigation.navigate('ForgotPassword')}
            variant="outline"
            fullWidth
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.centerContent}>
          <View style={[styles.iconContainer, { backgroundColor: colors.success + '20' }]}>
            <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>
            {t('auth.resetPassword.success')}
          </Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {t('auth.resetPassword.successMessage')}
          </Text>
          <Button
            title={t('auth.resetPassword.goToLogin')}
            onPress={handleGoToLogin}
            fullWidth
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Ready state - show password form
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="lock-closed" size={60} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>
              {t('auth.resetPassword.title')}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {t('auth.resetPassword.subtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="password"
              rules={{
                required: t('auth.resetPassword.passwordRequired'),
                minLength: {
                  value: 6,
                  message: t('auth.resetPassword.passwordMinLength'),
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.resetPassword.newPassword')}
                  placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  isPassword
                />
              )}
            />

            <PasswordRequirements password={passwordValue} />

            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: t('auth.resetPassword.confirmPasswordRequired'),
                validate: (value) =>
                  value === watchedPassword || t('auth.resetPassword.passwordsDoNotMatch'),
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.resetPassword.confirmPassword')}
                  placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.confirmPassword?.message}
                  isPassword
                />
              )}
            />

            <Button
              title={t('auth.resetPassword.updatePassword')}
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              fullWidth
              style={styles.submitButton}
            />
          </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  form: {
    flex: 1,
  },
  submitButton: {
    marginTop: spacing.lg,
  },
  button: {
    marginTop: spacing.md,
  },
});
