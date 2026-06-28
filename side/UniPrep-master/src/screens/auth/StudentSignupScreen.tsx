import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CityPicker } from '../../components/CityPicker';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { PhoneInput } from '../../components/PhoneInput';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { studentSignupSchema, StudentSignupFormData, validatePasswordWithPolicy, sanitizeInput, sanitizeEmail } from '../../utils/validation';
import { colors as staticColors, typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../components/AlertProvider';
import { useAppInfo } from '../../hooks/useAppInfo';

type StudentSignupScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'StudentSignup'
>;

interface Props {
  navigation: StudentSignupScreenNavigationProp;
}

// Helper to translate validation error messages (keys start with 'validation.')
const translateError = (message: string | undefined, t: any): string | undefined => {
  if (!message) return undefined;
  // If it's a translation key, translate it; otherwise return as-is
  if (message.startsWith('validation.')) {
    const translated = t(message);
    return translated !== message ? translated : message;
  }
  return message;
};

export const StudentSignupScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showSuccess, showError, showInfo, showConfirm } = useAlert();
  const { webappUrl } = useAppInfo();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { setUser, setSession, setOnboardingCompleted, setSigningOut } = useAuthStore();

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<StudentSignupFormData>({
    resolver: zodResolver(studentSignupSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      city: '',
    },
  });

  // Watch password field for real-time validation
  const watchedPassword = watch('password');
  
  useEffect(() => {
    setPasswordValue(watchedPassword || '');
  }, [watchedPassword]);

  const onSubmit = async (data: StudentSignupFormData) => {
    try {
      setLoading(true);
      
      // Sanitize all text inputs before processing
      const sanitizedData = {
        firstName: sanitizeInput(data.firstName),
        lastName: sanitizeInput(data.lastName),
        email: sanitizeEmail(data.email),
        phone: data.phone ? sanitizeInput(data.phone) : '',
        city: sanitizeInput(data.city),
      };
      
      // Check if email already exists
      const emailExists = await authService.checkEmailExists(sanitizedData.email);
      if (emailExists) {
        setLoading(false);
        showConfirm(
          t('auth.signUp.emailExists'),
          t('auth.signUp.emailExistsMessage'),
          () => navigation.navigate('Login'),
          undefined,
          t('auth.signUp.goToLogin'),
          t('common.cancel')
        );
        return;
      }
      
      // Validate password against dynamic policy from admin panel
      const passwordValidation = await validatePasswordWithPolicy(data.password);
      if (!passwordValidation.isValid) {
        setPasswordError(passwordValidation.errors[0] || t('auth.signUp.passwordInvalid'));
        setLoading(false);
        return;
      }
      setPasswordError(null);
      
      const fullName = `${sanitizedData.firstName} ${sanitizedData.lastName}`.trim();
      const { user, session } = await authService.signUpStudent({
        email: sanitizedData.email,
        password: data.password,
        fullName: fullName,
        firstName: sanitizedData.firstName,
        lastName: sanitizedData.lastName,
        phone: sanitizedData.phone,
        userType: 'student',
        city: sanitizedData.city,
        // targetGroup, targetUniversity, graduationYear moved to personalization quiz
      });

      // If we have a session, user is logged in
      if (session) {
        // Get user profile
        const profile = await authService.getUserProfile(user.id);
        
        // New students always have onboarding_completed = false (DB default)
        // Reset isSigningOut flag and set state
        setSigningOut(false);
        setOnboardingCompleted(false); // New student - needs onboarding
        setSession(session);
        setUser(profile);
        
        showSuccess(t('common.success'), t('auth.signUp.success'));
        // Navigation will be handled automatically by RootNavigator
      } else {
        // No session means email confirmation is required
        showInfo(
          t('auth.signUp.verifyEmail'),
          t('auth.signUp.verifyEmailMessage'),
          () => navigation.navigate('Login')
        );
      }
    } catch (error: any) {
      const errorResult = authService.getErrorMessage(error);
      
      // Check if it's an RLS error (profile creation failed but user was created)
      // These are raw error messages (not translation keys) so check the original error
      if (error?.message?.includes('row-level security') || error?.message?.includes('Failed to create profile')) {
        showInfo(
          t('auth.signUp.verifyEmail'),
          t('auth.signUp.verifyEmailMessage'),
          () => navigation.navigate('Login')
        );
      } else if (typeof errorResult === 'object') {
        showError(t('auth.signUp.signupFailed'), String(t(errorResult.key, errorResult.params)));
      } else {
        const translated = t(errorResult);
        showError(t('auth.signUp.signupFailed'), translated !== errorResult ? translated : errorResult);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.signUp.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.signUp.subtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="firstName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signUp.firstName') + ' *'}
                  placeholder={t('auth.signUp.firstNamePlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.firstName?.message, t)}
                  maxLength={50}
                />
              )}
            />

            <Controller
              control={control}
              name="lastName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signUp.lastName') + ' *'}
                  placeholder={t('auth.signUp.lastNamePlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.lastName?.message, t)}
                  maxLength={50}
                />
              )}
            />

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signUp.email') + ' *'}
                  placeholder={t('auth.signUp.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.email?.message, t)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={254}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <PhoneInput
                  label={t('auth.signUp.phone')}
                  value={value || ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.phone?.message, t)}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signUp.password') + ' *'}
                  placeholder={t('auth.signUp.passwordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.password?.message, t) || passwordError || undefined}
                  isPassword
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                  maxLength={128}
                />
              )}
            />

            {/* Dynamic Password Requirements from Admin Panel */}
            <PasswordRequirements password={passwordValue} />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signUp.confirmPassword') + ' *'}
                  placeholder={t('auth.signUp.confirmPasswordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.confirmPassword?.message, t)}
                  isPassword
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword(!showPassword)}
                  maxLength={128}
                />
              )}
            />

            <Controller
              control={control}
              name="city"
              render={({ field: { onChange, value } }) => (
                <CityPicker
                  label={t('auth.signUp.city')}
                  value={value}
                  onChange={onChange}
                  error={translateError(errors.city?.message, t)}
                  required
                />
              )}
            />

            <Button
              title={t('auth.signUp.signUpButton')}
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              fullWidth
              style={styles.submitButton}
            />

            <Text style={styles.termsText}>
              {t('legal.bySigningUp')}{' '}
              <Text 
                style={styles.termsLink}
                onPress={() => Linking.openURL(`${webappUrl}/terms`)}
              >
                {t('legal.termsOfService')}
              </Text>
              {' '}{t('legal.and')}{' '}
              <Text 
                style={styles.termsLink}
                onPress={() => Linking.openURL(`${webappUrl}/privacy`)}
              >
                {t('legal.privacyPolicy')}
              </Text>
              {t('legal.bySigningUpSuffix', '') ? ` ${t('legal.bySigningUpSuffix')}` : '.'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  groupContainer: {
    gap: spacing.sm,
  },
  groupCard: {
    borderWidth: 2,
    borderColor: colors.disabled,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  groupCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  groupText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    textAlign: 'center',
  },
  groupTextSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  errorText: {
    fontSize: typography.fontSizes.xs,
    color: colors.error,
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  termsText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.lineHeights.relaxed * typography.fontSizes.xs,
  },
  termsLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
