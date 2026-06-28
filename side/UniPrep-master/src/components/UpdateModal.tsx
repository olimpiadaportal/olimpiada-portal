import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../constants/theme';

interface UpdateModalProps {
  visible: boolean;
  forceUpdate: boolean;
  version: string;
  message: string;
  onUpdate: () => void;
  onLater?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  forceUpdate,
  version,
  message,
  onUpdate,
  onLater,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download" size={64} color="#3B82F6" />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            {forceUpdate ? t('update.requiredTitle') : t('update.availableTitle')}
          </Text>

          {/* Version */}
          <Text style={[styles.version, { color: colors.textSecondary }]}>
            {t('update.version', { version })}
          </Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.updateButton, { backgroundColor: '#3B82F6' }]}
              onPress={onUpdate}
              accessibilityLabel={t('update.updateNow')}
              accessibilityRole="button"
            >
              <Text style={styles.updateButtonText}>
                {t('update.updateNow')}
              </Text>
            </TouchableOpacity>

            {!forceUpdate && onLater && (
              <TouchableOpacity
                style={[styles.laterButton, { borderColor: colors.border }]}
                onPress={onLater}
                accessibilityLabel={t('update.later')}
                accessibilityRole="button"
              >
                <Text style={[styles.laterButtonText, { color: colors.text }]}>
                  {t('update.later')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {forceUpdate && (
            <Text style={[styles.forceNote, { color: colors.textSecondary }]}>
              {t('update.forceNote')}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  version: {
    fontSize: typography.fontSizes.md,
    marginBottom: spacing.md,
  },
  message: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  buttons: {
    width: '100%',
    gap: spacing.md,
  },
  updateButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: '#FFFFFF',
  },
  laterButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  laterButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  forceNote: {
    fontSize: typography.fontSizes.sm,
    marginTop: spacing.md,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
