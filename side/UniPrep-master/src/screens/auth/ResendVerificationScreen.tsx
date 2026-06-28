import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthStackParamList } from '../../types';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { authService } from '../../services/authService';
import { sanitizeEmail } from '../../utils/validation';
import { colors as staticColors, typography, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../components/AlertProvider';
import { Ionicons } from '@expo/vector-icons';

type ResendVerificationScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'ResendVerification'
>;

interface Props {
  navigation: ResendVerificationScreenNavigationProp;
}

const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email format'),
});

type ResendVerificationFormData = z.infer<typeof resendVerificationSchema>;

export const ResendVerificationScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showSuccess, showError } = useAlert();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendVerificationFormData>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ResendVerificationFormData) => {
    try {
      setLoading(true);
      
      // Sanitize email input before sending to backend
      const sanitizedEmail = sanitizeEmail(data.email);
      
      // Validate sanitized email
      if (!sanitizedEmail || !sanitizedEmail.includes('@')) {
        showError(t('auth.resendVerification.failed'), 'Invalid email format');
        setLoading(false);
        return;
      }
      
      await authService.resendVerificationEmail(sanitizedEmail);
      
      showSuccess(
        t('auth.resendVerification.success'),
        t('auth.resendVerification.successMessage'),
        () => navigation.goBack()
      );
    } catch (error: any) {
      const errorResult = authService.getErrorMessage(error);
      if (typeof errorResult === 'object') {
        showError(t('auth.resendVerification.failed'), String(t(errorResult.key, errorResult.params)));
      } else {
        const translated = t(errorResult);
        showError(t('auth.resendVerification.failed'), translated !== errorResult ? translated : errorResult);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    navigation.goBack();
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
          <TouchableOpacity 
            onPress={handleBackToLogin} 
            style={styles.backButton}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.resendVerification.title')}</Text>
            <Text style={styles.subtitle}>{t('auth.resendVerification.subtitle')}</Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.resendVerification.email')}
                  placeholder={t('auth.resendVerification.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={254}
                  accessibilityLabel={t('auth.resendVerification.email')}
                  accessibilityHint="Enter your email to resend verification"
                />
              )}
            />

            <Button
              title={t('auth.resendVerification.sendButton')}
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              fullWidth
              style={styles.sendButton}
            />

            <TouchableOpacity 
              onPress={handleBackToLogin} 
              style={styles.backLink}
              accessibilityLabel="Back to login"
              accessibilityRole="button"
            >
              <Text style={styles.backLinkText}>
                {t('auth.resendVerification.backToSignIn')}
              </Text>
            </TouchableOpacity>
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
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.md,
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
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  sendButton: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  backLinkText: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    fontWeight: typography.fontWeights.medium,
  },
});
