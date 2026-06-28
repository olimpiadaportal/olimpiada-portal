import { Animated, Easing } from 'react-native';

/**
 * Animation utilities for consistent animations across the app
 */

export const animations = {
  // Timing configurations
  timing: {
    fast: 200,
    normal: 300,
    slow: 500,
  },

  // Easing functions
  easing: {
    ease: Easing.ease,
    easeIn: Easing.in(Easing.ease),
    easeOut: Easing.out(Easing.ease),
    easeInOut: Easing.inOut(Easing.ease),
    spring: Easing.elastic(1),
  },

  /**
   * Fade in animation
   */
  fadeIn: (
    animatedValue: Animated.Value,
    duration: number = 300,
    toValue: number = 1
  ): Animated.CompositeAnimation => {
    return Animated.timing(animatedValue, {
      toValue,
      duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
  },

  /**
   * Fade out animation
   */
  fadeOut: (
    animatedValue: Animated.Value,
    duration: number = 300,
    toValue: number = 0
  ): Animated.CompositeAnimation => {
    return Animated.timing(animatedValue, {
      toValue,
      duration,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    });
  },

  /**
   * Scale animation (for button press feedback)
   */
  scale: (
    animatedValue: Animated.Value,
    toValue: number,
    duration: number = 150
  ): Animated.CompositeAnimation => {
    // useNativeDriver:false — scale values go into transform arrays which
    // cause Hermes GC stopTracking crashes with native driver on Android.
    return Animated.spring(animatedValue, {
      toValue,
      friction: 3,
      tension: 40,
      useNativeDriver: false,
    });
  },

  /**
   * Slide in from bottom
   */
  slideInFromBottom: (
    animatedValue: Animated.Value,
    duration: number = 300
  ): Animated.CompositeAnimation => {
    return Animated.timing(animatedValue, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  },

  /**
   * Slide out to bottom
   */
  slideOutToBottom: (
    animatedValue: Animated.Value,
    toValue: number,
    duration: number = 300
  ): Animated.CompositeAnimation => {
    return Animated.timing(animatedValue, {
      toValue,
      duration,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
  },

  /**
   * Slide in from right
   */
  slideInFromRight: (
    animatedValue: Animated.Value,
    duration: number = 300
  ): Animated.CompositeAnimation => {
    return Animated.timing(animatedValue, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
  },

  /**
   * Pulse animation (for notifications, badges)
   */
  pulse: (
    animatedValue: Animated.Value,
    minScale: number = 0.95,
    maxScale: number = 1.05,
    duration: number = 1000
  ): Animated.CompositeAnimation => {
    return Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: maxScale,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: minScale,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
  },

  /**
   * Shake animation (for errors)
   */
  shake: (
    animatedValue: Animated.Value,
    intensity: number = 10
  ): Animated.CompositeAnimation => {
    return Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: -intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]);
  },

  /**
   * Bounce animation
   */
  bounce: (
    animatedValue: Animated.Value,
    toValue: number = 1
  ): Animated.CompositeAnimation => {
    return Animated.spring(animatedValue, {
      toValue,
      friction: 2,
      tension: 40,
      useNativeDriver: true,
    });
  },

  /**
   * Stagger animation for lists
   */
  stagger: (
    animations: Animated.CompositeAnimation[],
    delay: number = 50
  ): Animated.CompositeAnimation => {
    return Animated.stagger(delay, animations);
  },

  /**
   * Parallel animations
   */
  parallel: (
    animations: Animated.CompositeAnimation[]
  ): Animated.CompositeAnimation => {
    return Animated.parallel(animations);
  },

  /**
   * Sequence animations
   */
  sequence: (
    animations: Animated.CompositeAnimation[]
  ): Animated.CompositeAnimation => {
    return Animated.sequence(animations);
  },
};

/**
 * Pre-configured animation presets
 */
export const animationPresets = {
  // Button press
  buttonPress: {
    scale: 0.95,
    duration: 100,
  },

  // Card press
  cardPress: {
    scale: 0.98,
    duration: 150,
  },

  // Modal
  modal: {
    duration: 300,
    easing: Easing.out(Easing.cubic),
  },

  // Toast/Snackbar
  toast: {
    duration: 250,
    easing: Easing.out(Easing.ease),
  },

  // Page transition
  pageTransition: {
    duration: 350,
    easing: Easing.out(Easing.cubic),
  },
};
