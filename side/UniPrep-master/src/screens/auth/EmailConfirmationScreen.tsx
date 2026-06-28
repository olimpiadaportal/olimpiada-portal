// Email Confirmation Screen
// Shown when user clicks email confirmation link

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { supabase } from '../../services/supabase';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type EmailConfirmationParams = {
  accessToken?: string;
  refreshToken?: string;
};

export const EmailConfirmationScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: EmailConfirmationParams }, 'params'>>();
  const { colors: themeColors } = useTheme();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    confirmEmail();
  }, []);

  const confirmEmail = async () => {
    try {
      const { accessToken, refreshToken } = route.params || {};
      
      if (!accessToken || !refreshToken) {
        // No tokens - might be direct navigation, show success anyway
        // The email was already confirmed when they clicked the link
        setStatus('success');
        return;
      }

      // Set the session with the tokens from the email link
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error('Email confirmation error:', error);
        setErrorMessage(error.message);
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch (error: any) {
      console.error('Email confirmation error:', error);
      setErrorMessage(error.message || t('auth.emailConfirmation.error'));
      setStatus('error');
    }
  };

  const handleGoToLogin = () => {
    // Sign out to clear any partial session and go to login
    supabase.auth.signOut({ scope: 'local' }).then(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    });
  };

  const handleRetry = () => {
    setStatus('loading');
    confirmEmail();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: themeColors.text }]}>
              {t('auth.emailConfirmation.verifying')}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {t('auth.emailConfirmation.pleaseWait')}
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={80} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>
              {t('auth.emailConfirmation.success')}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {t('auth.emailConfirmation.successMessage')}
            </Text>
            <Button
              title={t('auth.emailConfirmation.goToLogin')}
              onPress={handleGoToLogin}
              fullWidth
              style={styles.button}
            />
          </>
        )}

        {status === 'error' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="close-circle" size={80} color={colors.error} />
            </View>
            <Text style={[styles.title, { color: themeColors.text }]}>
              {t('auth.emailConfirmation.failed')}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {errorMessage || t('auth.emailConfirmation.errorMessage')}
            </Text>
            <Button
              title={t('common.retry')}
              onPress={handleRetry}
              fullWidth
              style={styles.button}
            />
            <Button
              title={t('auth.emailConfirmation.goToLogin')}
              onPress={handleGoToLogin}
              variant="outline"
              fullWidth
              style={styles.button}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  button: {
    marginTop: spacing.md,
  },
});
