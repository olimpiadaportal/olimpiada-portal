import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  PressableProps,
  ViewStyle,
} from 'react-native';
import { typography, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { AppPressable } from './ui/AppPressable';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'compact';
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  haptic?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'default',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  haptic = true,
  ...props
}) => {
  const { colors } = useTheme();
  const buttonStyle = [
    styles.button,
    size === 'compact' && styles.buttonCompact,
    variant === 'primary' && { backgroundColor: colors.primary },
    variant === 'secondary' && { backgroundColor: colors.secondary },
    variant === 'outline' && {
      backgroundColor: 'transparent',
      borderColor: colors.primary,
      borderWidth: 2,
    },
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const textStyle = [
    styles.text,
    size === 'compact' && styles.textCompact,
    variant === 'primary' && { color: '#FFFFFF' },
    variant === 'secondary' && { color: '#FFFFFF' },
    variant === 'outline' && { color: colors.primary },
  ];

  return (
    <AppPressable
      style={buttonStyle}
      wrapperStyle={fullWidth ? styles.fullWidth : undefined}
      disabled={disabled || loading}
      accessibilityLabel={props.accessibilityLabel || title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      haptic={haptic}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? colors.primary : '#FFFFFF'}
        />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  textCompact: {
    fontSize: 14,
  },
});
