import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing } from '../constants/theme';

interface OfflineModeToggleProps {
  isOfflineMode: boolean;
  onToggle: (value: boolean) => void;
}

export const OfflineModeToggle: React.FC<OfflineModeToggleProps> = ({
  isOfflineMode,
  onToggle,
}) => {
  const { t } = useTranslation();
  
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('common.testOfflineMode')}</Text>
      <Switch
        value={isOfflineMode}
        onValueChange={onToggle}
        trackColor={{ false: colors.gray[300], true: colors.primary }}
        thumbColor={isOfflineMode ? colors.white : colors.gray[100]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.gray[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
});
