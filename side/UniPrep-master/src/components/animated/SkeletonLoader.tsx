// Elmly Design System — SkeletonLoader
// Shimmer effect skeleton for loading states
// Pulses opacity to create a shimmer effect without LinearGradient dependency

import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

interface SkeletonGroupProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

const SkeletonItem: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const { isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulseAnim.setValue(0.6);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim, reduceMotion]);

  const bgColor = isDark ? '#1E293B' : '#E2E8F0';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: bgColor,
          opacity: pulseAnim,
        },
        style,
      ]}
    />
  );
};

// Pre-built skeleton layouts
const CardSkeleton: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      <SkeletonItem width="40%" height={12} style={{ marginBottom: 12 }} />
      <SkeletonItem width="100%" height={20} style={{ marginBottom: 8 }} />
      <SkeletonItem width="70%" height={14} style={{ marginBottom: 16 }} />
      <SkeletonItem width="100%" height={8} borderRadius={4} />
    </View>
  );
};

const ListItemSkeleton: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeletonListItem, { borderBottomColor: colors.border }, style]}>
      <SkeletonItem width={40} height={40} borderRadius={20} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <SkeletonItem width="60%" height={14} style={{ marginBottom: 6 }} />
        <SkeletonItem width="40%" height={12} />
      </View>
    </View>
  );
};

const StatSkeleton: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[styles.skeletonStat, style]}>
    <SkeletonItem width={48} height={48} borderRadius={12} style={{ marginBottom: 8 }} />
    <SkeletonItem width="80%" height={14} style={{ marginBottom: 4 }} />
    <SkeletonItem width="50%" height={12} />
  </View>
);

// Group wrapper for consistent spacing
const SkeletonGroup: React.FC<SkeletonGroupProps> = ({ children, style }) => (
  <View style={style}>{children}</View>
);

export const SkeletonLoader = Object.assign(SkeletonItem, {
  Card: CardSkeleton,
  ListItem: ListItemSkeleton,
  Stat: StatSkeleton,
  Group: SkeletonGroup,
});

const styles = StyleSheet.create({
  skeletonCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 12,
  },
  skeletonListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonStat: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
  },
});
