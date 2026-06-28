import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { Button } from '../Button';
import { AppPressable } from './AppPressable';

type IconName = keyof typeof Ionicons.glyphMap;

type ChoiceChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  icon?: IconName;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export const ChoiceChip: React.FC<ChoiceChipProps> = ({
  label,
  selected = false,
  onPress,
  disabled = false,
  icon,
  accentColor,
  style,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();
  const activeColor = accentColor ?? colors.primary;

  return (
    <AppPressable
      compact
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      haptic={Boolean(onPress && !disabled)}
      onPress={onPress}
      style={[
        styles.choiceChip,
        {
          backgroundColor: selected ? activeColor : colors.card,
          borderColor: selected ? activeColor : colors.border,
        },
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={selected ? '#FFFFFF' : activeColor}
        />
      ) : null}
      <Text
        style={[
          styles.choiceChipText,
          { color: selected ? '#FFFFFF' : colors.text },
          selected && styles.choiceChipTextSelected,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </AppPressable>
  );
};

type ScreenShellProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const ScreenShell: React.FC<ScreenShellProps> = ({
  children,
  scroll = true,
  contentStyle,
  style,
  testID,
}) => {
  const { colors } = useTheme();

  const content = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.screenContent, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, styles.staticContent, contentStyle]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={['top']}
      testID={testID}
      style={[styles.screen, { backgroundColor: colors.background }, style]}
    >
      {content}
    </SafeAreaView>
  );
};

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  actionAccessibilityHint?: string;
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon,
  style,
  actionAccessibilityHint,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={colors.primary}
            style={styles.sectionIcon}
          />
        )}
        <View style={styles.sectionTextBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {actionLabel && onAction && (
        <AppPressable
          accessibilityLabel={actionLabel}
          accessibilityHint={actionAccessibilityHint}
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          haptic={false}
          style={styles.sectionActionTarget}
        >
          <Text style={[styles.sectionAction, { color: colors.primary }]}>
            {actionLabel}
          </Text>
        </AppPressable>
      )}
    </View>
  );
};

type ActionCardProps = {
  title: string;
  description?: string;
  descriptionLines?: number;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  accentColor?: string;
  rightContent?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  descriptionLines = 3,
  icon,
  onPress,
  disabled,
  accentColor,
  rightContent,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const { colors, shadows } = useTheme();
  const color = accentColor ?? colors.primary;

  return (
    <AppPressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={[
        styles.card,
        shadows.sm,
        { backgroundColor: colors.card, borderColor: colors.border },
        disabled && styles.disabled,
        style,
      ]}
      haptic={Boolean(onPress)}
    >
      {icon && (
        <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
      )}
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {description && (
          <Text
            style={[styles.cardDescription, { color: colors.textSecondary }]}
            numberOfLines={descriptionLines}
          >
            {description}
          </Text>
        )}
      </View>
      {rightContent ?? (
        onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} /> : null
      )}
    </AppPressable>
  );
};

type MetricCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: IconName;
  accentColor?: string;
  labelLines?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  helper,
  icon,
  accentColor,
  labelLines = 1,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const { colors, shadows } = useTheme();
  const color = accentColor ?? colors.primary;

  const content = (
    <>
      <View style={styles.metricTopRow}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]} numberOfLines={labelLines}>
          {label}
        </Text>
        {icon && <Ionicons name={icon} size={18} color={color} />}
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {helper && (
        <Text style={[styles.metricHelper, { color: colors.textTertiary }]} numberOfLines={2}>
          {helper}
        </Text>
      )}
    </>
  );

  const cardStyle = [
    styles.metricCard,
    shadows.sm,
    { backgroundColor: colors.card, borderColor: colors.border },
    style,
  ];

  if (onPress) {
    return (
      <AppPressable
        accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={cardStyle}
      >
        {content}
      </AppPressable>
    );
  }

  return (
    <View
      style={[
        styles.metricCard,
        shadows.sm,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {content}
    </View>
  );
};

type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'accent';

const getVariantColors = (
  variant: StatusVariant,
  colors: ReturnType<typeof useTheme>['colors']
) => {
  switch (variant) {
    case 'success':
      return { foreground: colors.success, background: colors.successLight };
    case 'warning':
      return { foreground: colors.warning, background: colors.warningLight };
    case 'error':
      return { foreground: colors.error, background: colors.errorLight };
    case 'accent':
      return { foreground: colors.accent, background: colors.primaryLight };
    case 'info':
      return { foreground: colors.info, background: colors.infoLight };
    default:
      return { foreground: colors.textSecondary, background: colors.surfaceVariant };
  }
};

type PillProps = {
  label: string;
  value?: string | number;
  icon?: IconName;
  variant?: StatusVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export const StatusBadge: React.FC<PillProps> = ({
  label,
  icon,
  variant = 'neutral',
  style,
  textStyle,
}) => {
  const { colors } = useTheme();
  const variantColors = getVariantColors(variant, colors);

  return (
    <View style={[styles.pill, { backgroundColor: variantColors.background }, style]}>
      {icon && <Ionicons name={icon} size={14} color={variantColors.foreground} />}
      <Text
        style={[styles.pillText, { color: variantColors.foreground }, textStyle]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

export const EvidencePill: React.FC<PillProps> = ({
  label,
  value,
  icon = 'analytics-outline',
  variant = 'info',
  style,
}) => {
  const displayLabel = value === undefined ? label : `${label}: ${value}`;

  return (
    <StatusBadge
      label={displayLabel}
      icon={icon}
      variant={variant}
      style={style}
    />
  );
};

type LoadingStateProps = {
  title?: string;
  message?: string;
  style?: StyleProp<ViewStyle>;
};

export const LoadingState: React.FC<LoadingStateProps> = ({
  title,
  message,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.stateContainer, style]}>
      <ActivityIndicator color={colors.primary} />
      {title && <Text style={[styles.stateTitle, { color: colors.text }]}>{title}</Text>}
      {message && (
        <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>
          {message}
        </Text>
      )}
    </View>
  );
};

type ErrorStateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  actionLabel,
  onAction,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.stateContainer, style]}>
      <View style={[styles.stateIcon, { backgroundColor: colors.errorLight }]}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.text }]}>{title}</Text>
      {message && (
        <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>
          {message}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          size="compact"
          onPress={onAction}
          style={styles.stateAction}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  choiceChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  choiceChipText: {
    fontSize: typography.fontSizes.sm,
    textAlign: 'center',
  },
  choiceChipTextSelected: {
    fontWeight: '600',
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  staticContent: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  sectionIcon: {
    marginRight: spacing.sm,
  },
  sectionTextBlock: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.lg * typography.lineHeights.tight,
  },
  sectionSubtitle: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 2,
  },
  sectionAction: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  sectionActionTarget: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  card: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 84,
    padding: spacing.md,
  },
  disabled: {
    opacity: 0.55,
  },
  actionIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 44,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: typography.fontSizes.md * typography.lineHeights.tight,
  },
  cardDescription: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: 4,
  },
  metricCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 104,
    padding: spacing.md,
  },
  metricTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  metricValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    lineHeight: typography.fontSizes.xxl * typography.lineHeights.tight,
    marginTop: spacing.sm,
  },
  metricHelper: {
    fontSize: typography.fontSizes.xs,
    lineHeight: typography.fontSizes.xs * typography.lineHeights.normal,
    marginTop: 2,
  },
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: borderRadius.full,
    flexDirection: 'row',
    gap: 6,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  stateIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 64,
  },
  stateTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  stateMessage: {
    fontSize: typography.fontSizes.sm,
    lineHeight: typography.fontSizes.sm * typography.lineHeights.normal,
    marginTop: spacing.sm,
    maxWidth: 320,
    textAlign: 'center',
  },
  stateAction: {
    marginTop: spacing.lg,
  },
});
