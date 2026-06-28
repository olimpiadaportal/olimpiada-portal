import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { loginSchema, LoginFormData } from '../../utils/validation';
import { secureAuthService } from '../../services/secureAuthService';
import { colors as staticColors, typography, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../components/AlertProvider';
import { FadeIn } from '../../components/animated';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
  route?: any;
}

// Helper to translate validation error messages (keys start with 'validation.')
const translateError = (message: string | undefined, t: any): string | undefined => {
  if (!message) return undefined;
  if (message.startsWith('validation.')) {
    const translated = t(message);
    return translated !== message ? translated : message;
  }
  return message;
};

export const LoginScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showError, showWarning, showSuccess, showInfo } = useAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [showResendLink, setShowResendLink] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricName, setBiometricName] = useState('Biometric');
  const { setUser, setSession, setOnboardingCompleted, setSigningOut } = useAuthStore();
  const insets = useSafeAreaInsets();

  // Check biometric availability and load Remember Me preference on mount
  useEffect(() => {
    checkBiometricAvailability();
    loadRememberMePreference();
  }, []);

  const checkBiometricAvailability = async () => {
    const capabilities = await secureAuthService.checkBiometricCapabilities();
    setBiometricAvailable(capabilities.isAvailable);
    if (capabilities.isAvailable) {
      const name = await secureAuthService.getBiometricTypeName();
      setBiometricName(name);
    }
  };

  const loadRememberMePreference = async () => {
    const preference = await secureAuthService.getRememberMePreference();
    setRememberMe(preference);
  };

  const handleRememberMeChange = async (value: boolean) => {
    setRememberMe(value);
    await secureAuthService.saveRememberMePreference(value);
  };

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setLoading(true);
      const { user, session } = await authService.signIn(data);
      
      // Get user profile
      const profile = await authService.getUserProfile(user.id);
      
      if (!profile) {
        // Profile doesn't exist - user verified email but profile creation failed during signup
        showWarning(
          t('auth.signIn.setupRequired'),
          t('auth.signIn.setupMessage'),
          async () => {
            // Sign out the user
            await authService.signOut();
          }
        );
        return;
      }

      // Block admin users from accessing the mobile app
      if (profile.user_type !== 'student' && profile.user_type !== 'teacher') {
        await authService.signOut();
        showError(
          t('auth.signIn.accessDenied') || 'Access Denied',
          t('auth.signIn.adminNotAllowed') || 'Admin accounts cannot access this app. Please use the admin panel.'
        );
        return;
      }
      
      // Store credentials securely if Remember Me is enabled
      if (rememberMe && biometricAvailable) {
        console.log('🔐 Storing credentials for silent re-authentication...');
        const stored = await secureAuthService.storeCredentials(data.email, data.password);
        if (stored) {
          await secureAuthService.enableBiometric();
          showSuccess(
            t('auth.signIn.rememberMeEnabled'),
            `${biometricName} ${t('auth.signIn.rememberMeMessage')}`
          );
        }
      }
      
      // Fetch onboarding status BEFORE setting user to avoid loading screen flash
      // This is critical: if we set user before onboardingCompleted, the loading
      // condition (isAuthenticated && user && onboardingCompleted === null) triggers
      let onboardingDone = true; // Default to true for safety
      
      if (profile.user_type === 'student') {
        const { data: student } = await supabase
          .from('students')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .single();
        onboardingDone = student?.onboarding_completed === true;
      } else if (profile.user_type === 'teacher') {
        const { data: teacher } = await supabase
          .from('teachers')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .single();
        onboardingDone = teacher?.onboarding_completed === true;
      }
      
      // Reset isSigningOut flag (in case user logged out and back in)
      setSigningOut(false);
      
      // Set onboarding status FIRST, then user (order matters!)
      setOnboardingCompleted(onboardingDone);
      setSession(session);
      setUser(profile);
      
      // Hide resend link on successful login
      setShowResendLink(false);
      
      // Navigation will be handled automatically by RootNavigator based on onboardingCompleted
    } catch (error: any) {
      const errorResult = authService.getErrorMessage(error);
      
      // Handle structured rate-limit errors with interpolation params
      if (typeof errorResult === 'object') {
        showError(t('auth.signIn.loginFailed'), String(t(errorResult.key, errorResult.params)));
      } else {
        const errorKey = errorResult;
        // Show resend verification link if email not confirmed
        if (errorKey === 'errors.auth.emailNotConfirmed') {
          setShowResendLink(true);
        }
        
        // Translate the error key — if t() returns the key itself, it's an unknown error (use raw message)
        const translated = t(errorKey);
        const displayMessage = authService.isNetworkError(errorKey)
          ? t('errors.loginRequiresInternet')
          : (translated !== errorKey ? translated : errorKey);
        showError(t('auth.signIn.loginFailed'), displayMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    navigation.navigate('ForgotPassword');
  };

  const handleSignUp = () => {
    navigation.navigate('RoleSelection');
  };

  const handleResendVerification = () => {
    navigation.navigate('ResendVerification');
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
        >
          <FadeIn duration={400}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.signIn.title')}</Text>
            <Text style={styles.subtitle}>{t('auth.signIn.subtitle')}</Text>
          </View>
          </FadeIn>

          <FadeIn delay={200}>
          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signIn.email')}
                  placeholder={t('auth.signIn.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.email?.message, t)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={254}
                  accessibilityLabel={t('auth.signIn.email')}
                  accessibilityHint="Enter your email address to login"
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.signIn.password')}
                  placeholder={t('auth.signIn.passwordPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={translateError(errors.password?.message, t)}
                  isPassword
                  maxLength={128}
                  accessibilityLabel={t('auth.signIn.password')}
                  accessibilityHint="Enter your password to login"
                />
              )}
            />

            {/* Remember Me with Biometric */}
            {biometricAvailable && (
              <View style={styles.rememberMeContainer}>
                <Text style={styles.rememberMeText}>
                  {t('auth.signIn.rememberMe')} ({biometricName})
                </Text>
                <Switch
                  value={rememberMe}
                  onValueChange={handleRememberMeChange}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={rememberMe ? colors.surface : colors.surface}
                />
              </View>
            )}

            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotPassword}
              accessibilityLabel="Forgot password"
              accessibilityRole="button"
              accessibilityHint="Reset your password"
            >
              <Text style={styles.forgotPasswordText}>{t('auth.signIn.forgotPassword')}</Text>
            </TouchableOpacity>

            <Button
              title={t('auth.signIn.signInButton')}
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              fullWidth
              style={styles.loginButton}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('auth.signIn.or')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              onPress={handleSignUp} 
              style={styles.signupLink}
              accessibilityLabel="Sign up for a new account"
              accessibilityRole="button"
              accessibilityHint="Navigate to sign up screen"
            >
              <Text style={styles.signupText}>
                {t('auth.signIn.noAccount')}{' '}
                <Text style={styles.signupTextBold}>{t('auth.signIn.signUpLink')}</Text>
              </Text>
            </TouchableOpacity>

            {showResendLink && (
              <TouchableOpacity 
                onPress={handleResendVerification} 
                style={styles.resendLink}
                accessibilityLabel="Resend verification email"
                accessibilityRole="button"
                accessibilityHint="Navigate to resend verification screen"
              >
                <Text style={styles.resendText}>
                  {t('auth.signIn.resendVerification')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          </FadeIn>
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
    paddingTop: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xxl,
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
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  rememberMeText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
  },
  forgotPasswordText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
  loginButton: {
    marginBottom: spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.disabled,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  signupLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  signupText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  signupTextBold: {
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
  resendLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  resendText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
