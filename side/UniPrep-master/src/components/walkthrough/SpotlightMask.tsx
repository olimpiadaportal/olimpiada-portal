/**
 * SpotlightMask Component
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Creates a semi-transparent overlay with a spotlight effect
 * that highlights the target element during walkthrough
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Animated,
  Easing,
} from 'react-native';
import { TargetMeasurements, WalkthroughAnimationConfig } from '../../types/walkthrough';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SpotlightMaskProps {
  /** Target element measurements */
  targetMeasurements: TargetMeasurements | null;
  /** Whether the spotlight is visible */
  visible: boolean;
  /** Animation configuration */
  animationConfig: WalkthroughAnimationConfig;
  /** Padding around the spotlight */
  spotlightPadding?: number;
  /** Border radius of the spotlight */
  spotlightBorderRadius?: number;
  /** Backdrop opacity (0-1) */
  backdropOpacity?: number;
  /** Called when backdrop is pressed */
  onBackdropPress?: () => void;
  /** Whether backdrop press is disabled */
  disableBackdropPress?: boolean;
}

export const SpotlightMask: React.FC<SpotlightMaskProps> = ({
  targetMeasurements,
  visible,
  animationConfig,
  spotlightPadding = 8,
  spotlightBorderRadius = 12,
  backdropOpacity = 0.75,
  onBackdropPress,
  disableBackdropPress = false,
}) => {
  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const spotlightX = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  const spotlightY = useRef(new Animated.Value(SCREEN_HEIGHT / 2)).current;
  const spotlightWidth = useRef(new Animated.Value(100)).current;
  const spotlightHeight = useRef(new Animated.Value(100)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  // Update spotlight position when target changes
  useEffect(() => {
    if (visible && targetMeasurements) {
      // Animate all values together
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: animationConfig.spotlightDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.spring(spotlightX, {
          toValue: targetMeasurements.pageX - spotlightPadding,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightY, {
          toValue: targetMeasurements.pageY - spotlightPadding,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightWidth, {
          toValue: targetMeasurements.width + spotlightPadding * 2,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(spotlightHeight, {
          toValue: targetMeasurements.height + spotlightPadding * 2,
          damping: 20,
          stiffness: 150,
          useNativeDriver: false,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 120,
          useNativeDriver: false,
        }),
      ]).start();
    } else if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: animationConfig.spotlightDuration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(scale, {
          toValue: 0.8,
          duration: animationConfig.spotlightDuration,
          useNativeDriver: false,
        }),
      ]).start();
    }

    // Stop all animations on unmount to prevent stopTracking crash on Hermes
    return () => {
      try { opacity.stopAnimation(); } catch (_) {}
      try { spotlightX.stopAnimation(); } catch (_) {}
      try { spotlightY.stopAnimation(); } catch (_) {}
      try { spotlightWidth.stopAnimation(); } catch (_) {}
      try { spotlightHeight.stopAnimation(); } catch (_) {}
      try { scale.stopAnimation(); } catch (_) {}
    };
  }, [visible, targetMeasurements, animationConfig, spotlightPadding]);

  const handleBackdropPress = () => {
    if (!disableBackdropPress && onBackdropPress) {
      onBackdropPress();
    }
  };

  if (!visible) return null;

  // Calculate derived values for overlay pieces
  const topHeight = spotlightY;
  const bottomTop = Animated.add(spotlightY, spotlightHeight);
  const bottomHeight = Animated.subtract(SCREEN_HEIGHT, bottomTop);
  const rightLeft = Animated.add(spotlightX, spotlightWidth);
  const rightWidth = Animated.subtract(SCREEN_WIDTH, rightLeft);

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="box-none">
      {/* Top overlay */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.overlay,
            { 
              backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
              height: topHeight,
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Bottom overlay */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.overlay,
            styles.bottomOverlay,
            { 
              backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
              top: bottomTop,
              height: bottomHeight,
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Left overlay */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.overlay,
            styles.sideOverlay,
            { 
              backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
              top: spotlightY,
              width: spotlightX,
              height: spotlightHeight,
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Right overlay */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View
          style={[
            styles.overlay,
            styles.sideOverlay,
            { 
              backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
              top: spotlightY,
              left: rightLeft,
              width: rightWidth,
              height: spotlightHeight,
            },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Spotlight border/glow effect */}
      <Animated.View 
        style={[
          styles.spotlightBorder, 
          {
            left: spotlightX,
            top: spotlightY,
            width: spotlightWidth,
            height: spotlightHeight,
            borderRadius: spotlightBorderRadius,
            transform: [{ scale }],
          }
        ]}
      >
        <View style={[styles.spotlightInner, { borderRadius: spotlightBorderRadius - 2 }]} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  sideOverlay: {
    position: 'absolute',
  },
  spotlightBorder: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  spotlightInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});

export default SpotlightMask;
