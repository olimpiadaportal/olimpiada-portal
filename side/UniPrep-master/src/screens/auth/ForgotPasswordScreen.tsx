import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
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
import { forgotPasswordSchema, ForgotPasswordFormData } from '../../utils/validation';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../constants/theme';
import { useAlert } from '../../components/AlertProvider';

type ForgotPasswordScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'ForgotPassword'
>;

interface Props {
  navigation: ForgotPasswordScreenNavigationProp;
}

export const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showSuccess, showError } = useAlert();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      setLoading(true);
      await authService.resetPassword(data.email);
      setEmailSent(true);
      showSuccess(
        t('common.success'),
        t('auth.forgotPassword.success'),
        () => navigation.navigate('Login')
      );
    } catch (error: any) {
      const errorResult = authService.getErrorMessage(error);
      if (typeof errorResult === 'object') {
        showError(t('common.error'), String(t(errorResult.key, errorResult.params)));
      } else {
        const translated = t(errorResult);
        showError(t('common.error'), translated !== errorResult ? translated : errorResult);
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
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.forgotPassword.instructions')}
            </Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.forgotPassword.email')}
                  placeholder={t('auth.forgotPassword.emailPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!emailSent}
                />
              )}
            />

            <Button
              title={emailSent ? t('common.success') : t('auth.forgotPassword.sendButton')}
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              disabled={emailSent}
              fullWidth
              style={styles.submitButton}
            />

            <Button
              title={t('auth.forgotPassword.backToSignIn')}
              variant="outline"
              onPress={() => navigation.navigate('Login')}
              fullWidth
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    content: {
      flex: 1,
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
      marginBottom: spacing.md,
    },
    subtitle: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      lineHeight: typography.lineHeights.relaxed * typography.fontSizes.md,
    },
    form: {
      flex: 1,
    },
    submitButton: {
      marginBottom: spacing.md,
    },
  });
