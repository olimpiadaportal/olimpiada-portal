// Elmly Design System — AnimatedProgress
// Animated progress bar with smooth width transitions and color support
// Uses standard RN Animated API (useNativeDriver: false for layout props)

import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { duration as motionDuration, easing } from '../../design-system/motion';

interface AnimatedProgressProps {
  progress: number; // 0–1
  duration?: number;
  delay?: number;
  height?: number;
  color?: string;
  trackColor?: string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const AnimatedProgress: React.FC<AnimatedProgressProps> = ({
  progress,
  duration = motionDuration.slow,
  delay = 0,
  height = 8,
  color,
  trackColor,
  borderRadius = 4,
  style,
}) => {
  const { colors } = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(widthAnim, {
        toValue: clampedProgress,
        duration,
        easing: easing.enter,
        useNativeDriver: false,
      }).start();
    }, delay);

    return () => {
      clearTimeout(timer);
      try { widthAnim.stopAnimation(); } catch (_) {}
    };
  }, [clampedProgress, duration, delay]);

  const barColor = color || colors.primary;
  const bgColor = trackColor || colors.surfaceVariant;

  return (
    <View
      style={[
        styles.track,
        {
          height,
          borderRadius,
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius,
            backgroundColor: barColor,
            width: widthAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
