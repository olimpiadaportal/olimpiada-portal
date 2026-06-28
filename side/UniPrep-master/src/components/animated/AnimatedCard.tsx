// Elmly Design System — AnimatedCard
// Pressable card with scale feedback, shadow elevation change, and optional haptics
// Uses standard RN Animated API (no reanimated dependency)

import React, { useRef, useCallback, useEffect } from 'react';
import {
  Animated,
  TouchableOpacity,
  ViewStyle,
  StyleSheet,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { duration as motionDuration } from '../../design-system/motion';

interface AnimatedCardProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  style?: ViewStyle;
  disabled?: boolean;
  haptic?: boolean;
  scaleValue?: number;
  testID?: string;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled = false,
  haptic = true,
  scaleValue = 0.98,
  testID,
}) => {
  const { colors, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const elevationAnim = useRef(new Animated.Value(1)).current;

  // Stop all animations on unmount to prevent stopTracking crash on Hermes
  useEffect(() => {
    return () => {
      try { scaleAnim.stopAnimation(); } catch (_) {}
      try { elevationAnim.stopAnimation(); } catch (_) {}
    };
  }, []);

  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: scaleValue,
        duration: motionDuration.instant,
        useNativeDriver: false,
      }),
      Animated.timing(elevationAnim, {
        toValue: 0.5,
        duration: motionDuration.instant,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scaleAnim, elevationAnim, scaleValue]);

  const handlePressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: false,
        damping: 15,
        stiffness: 150,
      }),
      Animated.timing(elevationAnim, {
        toValue: 1,
        duration: motionDuration.fast,
        useNativeDriver: false,
      }),
    ]).start();
  }, [scaleAnim, elevationAnim]);

  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.(event);
  }, [haptic, onPress]);

  const shadowOpacity = elevationAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0.04, isDark ? 0.3 : 0.08],
  });

  const elevation = elevationAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [1, 4],
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: scaleAnim,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: shadowOpacity as any,
                shadowRadius: 8,
              },
              android: {
                elevation: elevation as any,
              },
            }),
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
