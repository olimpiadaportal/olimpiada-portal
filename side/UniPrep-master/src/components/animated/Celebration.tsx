// Elmly Design System — Celebration
// Confetti/particle burst animation for achievements, exam completion, streaks
// Renders animated circles that burst outward and fade, with optional haptic

import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { brandColors } from '../../design-system/colors';
import { duration as motionDuration } from '../../design-system/motion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARTICLE_COLORS = [
  brandColors.blue[500],
  brandColors.emerald[500],
  brandColors.violet[500],
  brandColors.amber[500],
  brandColors.red[400],
  brandColors.blue[300],
  brandColors.emerald[300],
  brandColors.violet[300],
];

interface CelebrationProps {
  visible: boolean;
  intensity?: 'light' | 'medium' | 'full';
  haptic?: boolean;
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
}

const PARTICLE_COUNTS = { light: 12, medium: 24, full: 40 };

export const Celebration: React.FC<CelebrationProps> = ({
  visible,
  intensity = 'medium',
  haptic = true,
  onComplete,
}) => {
  const particleCount = PARTICLE_COUNTS[intensity];
  const anims = useRef<Animated.Value[]>([]).current;
  const hasTriggered = useRef(false);

  // Generate particle configs once
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: particleCount }, () => ({
      x: SCREEN_WIDTH / 2 + (Math.random() - 0.5) * 60,
      y: 200 + (Math.random() - 0.5) * 40,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      size: 6 + Math.random() * 8,
      angle: Math.random() * Math.PI * 2,
      speed: 80 + Math.random() * 160,
    }));
  }, [particleCount]);

  // Ensure we have enough anim values
  while (anims.length < particleCount) {
    anims.push(new Animated.Value(0));
  }

  useEffect(() => {
    if (visible && !hasTriggered.current) {
      hasTriggered.current = true;

      if (haptic) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      // Reset all
      anims.forEach(a => a.setValue(0));

      // Animate all particles
      const animations = anims.slice(0, particleCount).map((anim, i) => {
        const dur = motionDuration.emphasis + Math.random() * 400;
        return Animated.timing(anim, {
          toValue: 1,
          duration: dur,
          useNativeDriver: false,
          delay: Math.random() * 100,
        });
      });

      Animated.parallel(animations).start(() => {
        onComplete?.();
      });
    }

    if (!visible) {
      hasTriggered.current = false;
    }

    // Stop all animations on unmount to prevent stopTracking crash on Hermes
    return () => {
      anims.forEach(a => { try { a.stopAnimation(); } catch (_) {} });
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p, i) => {
        const anim = anims[i];
        if (!anim) return null;

        const translateX = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.cos(p.angle) * p.speed],
        });
        const translateY = anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, Math.sin(p.angle) * p.speed * 0.5 - 60, Math.sin(p.angle) * p.speed + 120],
        });
        const opacity = anim.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });
        const scale = anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1.2, 0.4],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  particle: {
    position: 'absolute',
  },
});
