// Elmly Design System — Motion Constants
// Centralized animation durations, spring configs, and easing curves
// Used by both Animated API and react-native-reanimated

import { Easing } from 'react-native';

export const duration = {
  instant:  100,   // Micro-feedback (button press, toggle)
  fast:     200,   // Quick transitions (tab switch, icon morph)
  normal:   300,   // Standard transitions (modal, slide, card)
  slow:     500,   // Emphasis transitions (page load, celebration start)
  emphasis: 800,   // Grand celebrations (exam completion, achievement)
};

// Spring configs for react-native-reanimated withSpring()
export const spring = {
  snappy:  { damping: 15, stiffness: 150 },
  bouncy:  { damping: 10, stiffness: 100 },
  gentle:  { damping: 20, stiffness: 80  },
  default: { damping: 15, stiffness: 120 },
  tab:     { damping: 18, stiffness: 140 },
};

// Easing curves for Animated.timing()
export const easing = {
  enter:    Easing.out(Easing.cubic),      // Decelerate — content entering
  exit:     Easing.in(Easing.cubic),       // Accelerate — content leaving
  move:     Easing.inOut(Easing.ease),     // Standard — repositioning
  bounce:   Easing.elastic(1),             // Playful — achievements
  standard: Easing.out(Easing.ease),       // General purpose
};

export const motion = {
  duration,
  spring,
  easing,
};
