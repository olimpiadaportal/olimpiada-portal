// Offline Screen Component
// Stage 6 - Week 3: Offline Mode Implementation
// Full-screen message when a feature requires online connectivity

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useOffline } from '../contexts/OfflineContext';

interface OfflineScreenProps {
  /** Title to display */
  title?: string;
  /** Message to display */
  message?: string;
  /** Show "Go to Standard Practice" button */
  showPracticeButton?: boolean;
  /** Show "Retry" button */
  showRetryButton?: boolean;
  /** Custom action button */
  actionButton?: {
    label: string;
    onPress: () => void;
  };
  /** Icon name */
  icon?: string;
}

export const OfflineScreen: React.FC<OfflineScreenProps> = ({
  title,
  message,
  showPracticeButton = true,
  showRetryButton = true,
  actionButton,
  icon = 'cloud-offline',
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();
  const { refreshNetworkStatus, isOnline, pendingSessionCount } = useOffline();

  const defaultTitle = t('offline.title', 'You are offline');
  const defaultMessage = t(
    'offline.message',
    'This feature requires an internet connection. You can still practice in Standard Mode with downloaded questions.'
  );

  const handleGoToPractice = () => {
    navigation.navigate('Practice', { screen: 'ModeSelection' });
  };

  const handleRetry = async () => {
    await refreshNetworkStatus();
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: themeColors.surface }]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={64} color={themeColors.textSecondary} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: themeColors.text }]}>
          {title || defaultTitle}
        </Text>

        {/* Message */}
        <Text style={[styles.message, { color: themeColors.textSecondary }]}>
          {message || defaultMessage}
        </Text>

        {/* Pending sync info */}
        {pendingSessionCount > 0 && (
          <View style={[styles.syncInfo, { backgroundColor: themeColors.surface }]}>
            <Ionicons name="time-outline" size={20} color={colors.info} />
            <Text style={[styles.syncText, { color: themeColors.text }]}>
              {t('offline.pendingSessions', {
                count: pendingSessionCount,
                defaultValue: `${pendingSessionCount} practice session(s) will sync when online`,
              })}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {showRetryButton && (
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, { borderColor: themeColors.border }]}
              onPress={handleRetry}
            >
              <Ionicons name="refresh" size={20} color={themeColors.text} />
              <Text style={[styles.buttonText, { color: themeColors.text }]}>
                {t('offline.retry', 'Retry')}
              </Text>
            </TouchableOpacity>
          )}

          {showPracticeButton && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleGoToPractice}
            >
              <Ionicons name="book" size={20} color={colors.white} />
              <Text style={[styles.buttonText, { color: colors.white }]}>
                {t('offline.goToPractice', 'Standard Practice')}
              </Text>
            </TouchableOpacity>
          )}

          {actionButton && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={actionButton.onPress}
            >
              <Text style={[styles.buttonText, { color: colors.white }]}>
                {actionButton.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Offline tips */}
        <View style={styles.tipsContainer}>
          <Text style={[styles.tipsTitle, { color: themeColors.textSecondary }]}>
            {t('offline.tipsTitle', 'While offline, you can:')}
          </Text>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.tipText, { color: themeColors.textSecondary }]}>
              {t('offline.tip1', 'Practice with downloaded questions')}
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.tipText, { color: themeColors.textSecondary }]}>
              {t('offline.tip2', 'Review your previous answers')}
            </Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="close-circle" size={16} color={colors.error} />
            <Text style={[styles.tipText, { color: themeColors.textSecondary }]}>
              {t('offline.tip3', 'AI features are not available')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
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
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold as '400' | '500' | '600' | '700' | '800' | '900',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  syncInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  syncText: {
    fontSize: typography.fontSizes.sm,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    flexWrap: 'wrap',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    minWidth: 140,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  buttonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold as '400' | '500' | '600' | '700' | '800' | '900',
  },
  tipsContainer: {
    alignSelf: 'stretch',
  },
  tipsTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium as '400' | '500' | '600' | '700' | '800' | '900',
    marginBottom: spacing.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  tipText: {
    fontSize: typography.fontSizes.sm,
  },
});

export default OfflineScreen;
