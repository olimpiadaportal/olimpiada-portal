import React, { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityState,
  Animated,
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { duration } from '../../design-system/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type AppPressableProps = Omit<
  PressableProps,
  'children' | 'onPress' | 'onPressIn' | 'onPressOut' | 'style'
> & {
  children: React.ReactNode;
  onPress?: ((event: GestureResponderEvent) => void) | null;
  onPressIn?: ((event: GestureResponderEvent) => void) | null;
  onPressOut?: ((event: GestureResponderEvent) => void) | null;
  style?: StyleProp<ViewStyle>;
  wrapperStyle?: StyleProp<ViewStyle>;
  accessibilityState?: AccessibilityState;
  haptic?: boolean;
  pressedOpacity?: number;
  compact?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Shared interaction primitive for buttons and tappable cards.
 *
 * Opacity feedback is intentionally used instead of transform scaling because
 * transform press animations have previously been unstable on Android/Hermes.
 */
export const AppPressable: React.FC<AppPressableProps> = ({
  children,
  onPress,
  onPressIn,
  onPressOut,
  style,
  wrapperStyle,
  disabled = false,
  accessibilityRole,
  accessibilityState,
  haptic = true,
  pressedOpacity = 0.78,
  hitSlop = 4,
  compact = false,
  ...props
}) => {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const isDisabled = Boolean(disabled);

  useEffect(() => {
    return () => {
      opacity.stopAnimation();
    };
  }, [opacity]);

  const animateTo = useCallback(
    (value: number) => {
      if (reduceMotion) {
        opacity.setValue(value);
        return;
      }

      Animated.timing(opacity, {
        toValue: value,
        duration: duration.instant,
        useNativeDriver: true,
      }).start();
    },
    [opacity, reduceMotion]
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      animateTo(pressedOpacity);
      onPressIn?.(event);
    },
    [animateTo, onPressIn, pressedOpacity]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      animateTo(1);
      onPressOut?.(event);
    },
    [animateTo, onPressOut]
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (isDisabled) return;

      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPress?.(event);
    },
    [haptic, isDisabled, onPress]
  );

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={hitSlop}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[compact ? styles.compactWrapper : styles.wrapper, wrapperStyle, style, { opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 44,
    minWidth: 44,
  },
  compactWrapper: {
    minHeight: 36,
    minWidth: 36,
  },
});
