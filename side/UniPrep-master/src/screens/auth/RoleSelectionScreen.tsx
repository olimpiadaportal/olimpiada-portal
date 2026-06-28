import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { AuthStackParamList } from '../../types';
import { colors as staticColors, typography, spacing, borderRadius, shadows } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useAppInfo } from '../../hooks/useAppInfo';

type RoleSelectionScreenNavigationProp = StackNavigationProp<
  AuthStackParamList,
  'RoleSelection'
>;

interface Props {
  navigation: RoleSelectionScreenNavigationProp;
}

export const RoleSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { flags, loading, isTeacherRegistrationEnabled } = useFeatureFlags();
  const { appName } = useAppInfo();
  
  // If teacher registration is disabled, go directly to student signup
  useEffect(() => {
    if (!loading && !isTeacherRegistrationEnabled) {
      // Auto-navigate to student signup when teacher registration is disabled
      // This provides a cleaner UX - no need to show role selection
      navigation.replace('StudentSignup');
    }
  }, [loading, isTeacherRegistrationEnabled, navigation]);
  
  const handleStudentSelect = () => {
    navigation.navigate('StudentSignup');
  };

  const handleTeacherSelect = () => {
    navigation.navigate('TeacherSignup');
  };

  const handleBackToLogin = () => {
    navigation.navigate('Login');
  };

  // Show loading while checking feature flags
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // If teacher registration is disabled, this screen won't be shown
  // (useEffect above will redirect to StudentSignup)
  // But we keep the full UI in case the redirect hasn't happened yet

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.roleSelection.title', { appName })}</Text>
        <Text style={styles.subtitle}>{t('auth.roleSelection.subtitle')}</Text>

        <View style={styles.cardsContainer}>
          {/* Student Card */}
          <TouchableOpacity
            style={styles.card}
            onPress={handleStudentSelect}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardEmoji}>🎓</Text>
              <Text style={styles.cardTitle}>{t('auth.roleSelection.student')}</Text>
              <Text style={styles.cardDescription}>
                {t('auth.roleSelection.studentDescription')}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Teacher Card - Only show if teacher registration is enabled */}
          {isTeacherRegistrationEnabled && (
            <TouchableOpacity
              style={styles.card}
              onPress={handleTeacherSelect}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardEmoji}>👨‍🏫</Text>
                <Text style={styles.cardTitle}>{t('auth.roleSelection.teacher')}</Text>
                <Text style={styles.cardDescription}>
                  {t('auth.roleSelection.teacherDescription')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={handleBackToLogin} style={styles.loginLink}>
          <Text style={styles.loginText}>
            {t('auth.roleSelection.alreadyHaveAccount')} <Text style={styles.loginTextBold}>{t('auth.roleSelection.login')}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  title: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  cardsContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    ...shadows.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardContent: {
    alignItems: 'center',
  },
  cardEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  cardDescription: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.lineHeights.relaxed * typography.fontSizes.md,
  },
  loginLink: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  loginText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  loginTextBold: {
    color: colors.primary,
    fontWeight: typography.fontWeights.semibold,
  },
});
