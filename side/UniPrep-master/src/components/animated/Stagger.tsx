// Elmly Design System — Stagger
// Auto-stagger children with configurable delay between each item
// Each child fades in and slides up with a sequential delay

import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';
import { duration as motionDuration, easing } from '../../design-system/motion';

interface StaggerProps {
  children: React.ReactNode;
  delay?: number;       // Delay between each child (ms)
  initialDelay?: number; // Delay before first child starts
  duration?: number;     // Duration of each child's animation
  distance?: number;     // Slide-up distance in pixels
  style?: ViewStyle;
  enabled?: boolean;     // Set false to render without animation
}

interface StaggerItemProps {
  children: React.ReactNode;
  index: number;
  delay: number;
  initialDelay: number;
  duration: number;
  distance: number;
}

const StaggerItem: React.FC<StaggerItemProps> = ({
  children,
  index,
  delay,
  initialDelay,
  duration,
  distance,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const itemDelay = initialDelay + index * delay;

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: easing.enter,
          useNativeDriver: false,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: easing.enter,
          useNativeDriver: false,
        }),
      ]).start();
    }, itemDelay);

    return () => {
      clearTimeout(timer);
      try { opacity.stopAnimation(); } catch (_) {}
      try { translateY.stopAnimation(); } catch (_) {}
    };
  }, [index, delay, initialDelay, duration]);

  // NOTE: Use 'top' + position:'relative' instead of transform:[{translateY}]
  // to avoid Hermes GC race condition that causes stopTracking crash on Android.
  return (
    <Animated.View
      style={{
        opacity,
        position: 'relative',
        top: translateY,
      }}
    >
      {children}
    </Animated.View>
  );
};

export const Stagger: React.FC<StaggerProps> = ({
  children,
  delay = 60,
  initialDelay = 0,
  duration = motionDuration.normal,
  distance = 16,
  style,
  enabled = true,
}) => {
  if (!enabled) {
    return <View style={style}>{children}</View>;
  }

  const childArray = React.Children.toArray(children);

  return (
    <View style={style}>
      {childArray.map((child, index) => (
        <StaggerItem
          key={index}
          index={index}
          delay={delay}
          initialDelay={initialDelay}
          duration={duration}
          distance={distance}
        >
          {child}
        </StaggerItem>
      ))}
    </View>
  );
};
