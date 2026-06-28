// Elmly Design System — AnimatedNumber
// Counting number animation for scores, stats, XP, streaks
// Animates from 0 (or previous value) to target value with easing

import React, { useEffect, useRef, useState } from 'react';
import { Animated, TextStyle, Text, StyleProp } from 'react-native';
import { duration as motionDuration, easing } from '../../design-system/motion';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  style?: StyleProp<TextStyle>;
  formatFn?: (value: number) => string;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = motionDuration.slow,
  delay = 0,
  prefix = '',
  suffix = '',
  decimals = 0,
  style,
  formatFn,
}) => {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const from = prevValue.current;
    animValue.setValue(from);

    const timer = setTimeout(() => {
      Animated.timing(animValue, {
        toValue: value,
        duration,
        easing: easing.enter,
        useNativeDriver: false,
      }).start();
    }, delay);

    // Listen to animated value changes
    const listenerId = animValue.addListener(({ value: v }) => {
      setDisplayValue(v);
    });

    prevValue.current = value;

    return () => {
      clearTimeout(timer);
      try { animValue.stopAnimation(); } catch (_) {}
      try { animValue.removeListener(listenerId); } catch (_) {}
    };
  }, [value, duration, delay]);

  const formatted = formatFn
    ? formatFn(displayValue)
    : displayValue.toFixed(decimals);

  return (
    <Text style={style}>
      {prefix}{formatted}{suffix}
    </Text>
  );
};
