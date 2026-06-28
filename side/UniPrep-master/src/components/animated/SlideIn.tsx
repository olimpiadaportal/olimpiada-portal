import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, Dimensions } from 'react-native';
import { animations } from '../../utils/animations';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SlideInProps {
  children: React.ReactNode;
  direction?: 'bottom' | 'right' | 'left' | 'top';
  duration?: number;
  delay?: number;
  style?: ViewStyle;
}

export const SlideIn: React.FC<SlideInProps> = ({ 
  children, 
  direction = 'bottom',
  duration = 300, 
  delay = 0,
  style 
}) => {
  const slideAnim = useRef(new Animated.Value(getInitialValue(direction))).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start();
    }, delay);

    return () => {
      clearTimeout(timer);
      try { slideAnim.stopAnimation(); } catch (_) {}
    };
  }, [slideAnim, duration, delay]);

  // NOTE: Use top/left + position:'relative' instead of transform:[{translateY/X}]
  // to avoid Hermes GC race condition that causes stopTracking crash on Android.
  const getPositionStyle = () => {
    switch (direction) {
      case 'bottom':
      case 'top':
        return { top: slideAnim };
      case 'left':
      case 'right':
        return { left: slideAnim };
    }
  };

  return (
    <Animated.View style={[style, { position: 'relative' as const, ...getPositionStyle() }]}>
      {children}
    </Animated.View>
  );
};

function getInitialValue(direction: 'bottom' | 'right' | 'left' | 'top'): number {
  switch (direction) {
    case 'bottom':
      return 100;
    case 'top':
      return -100;
    case 'right':
      return 100;
    case 'left':
      return -100;
  }
}
