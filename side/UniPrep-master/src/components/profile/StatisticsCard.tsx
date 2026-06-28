// Statistics Card Component
// Stage 9 - Phase 2
// Reusable statistics display card

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';

interface StatisticsCardProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

export const StatisticsCard: React.FC<StatisticsCardProps> = ({
  icon,
  label,
  value,
  color,
}) => {
  const { colors: themeColors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color={color} />
      </View>
      <Text style={[styles.value, { color: themeColors.text }]}>{value}</Text>
      <Text style={[styles.label, { color: themeColors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    margin: spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: typography.fontSizes.xs,
    textAlign: 'center',
  },
});
