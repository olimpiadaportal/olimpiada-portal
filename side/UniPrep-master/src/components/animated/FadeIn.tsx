import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { animations } from '../../utils/animations';

interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
}

export const FadeIn: React.FC<FadeInProps> = ({ 
  children, 
  duration = 300, 
  delay = 0,
  style 
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      animations.fadeIn(fadeAnim, duration).start();
    }, delay);

    return () => {
      clearTimeout(timer);
      try { fadeAnim.stopAnimation(); } catch (_) {}
    };
  }, [fadeAnim, duration, delay]);

  return (
    <Animated.View style={[style, { opacity: fadeAnim }]}>
      {children}
    </Animated.View>
  );
};
