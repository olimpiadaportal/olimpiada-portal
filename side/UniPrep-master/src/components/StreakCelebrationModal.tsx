/**
 * StreakCelebrationModal
 *
 * Full-screen celebration overlay shown ONCE per day on the first activity.
 * - Flaming heart animation for streak continuation
 * - Broken heart → repair animation for streak restart
 * - Confetti for milestones and new records
 * - Auto-dismisses after 5 seconds; "Continue" button for manual dismiss
 */

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { Celebration } from './animated';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { StreakMilestone } from '../store/authStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100]);
const AUTO_DISMISS_MS = 5000;
const FLAME_PARTICLE_COUNT = 8;

interface Props {
  milestone: StreakMilestone | null;
  onDismiss: () => void;
}

// ── Flame Particle ─────────────────────────────────────────────────────────
const FlameParticle: React.FC<{ delay: number; index: number }> = ({ delay, index }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const angle = (index / FLAME_PARTICLE_COUNT) * 2 * Math.PI;
    const offsetX = Math.cos(angle) * 6;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -40 - Math.random() * 20,
            duration: 800 + Math.random() * 400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.9,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 600 + Math.random() * 400,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(scale, {
            toValue: 0.3,
            duration: 800 + Math.random() * 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, index, translateY, opacity, scale]);

  const angle = (index / FLAME_PARTICLE_COUNT) * 2 * Math.PI;
  const offsetX = Math.cos(angle) * 18;
  const colors = ['#FF6B35', '#FFA500', '#FFD700', '#FF4500'];
  const color = colors[index % colors.length];
  const size = 6 + Math.random() * 4;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        left: 60 + offsetX,
        top: 30,
        opacity,
        transform: [{ translateY }, { scale }],
      }}
    />
  );
};

// ── Heart Animation ────────────────────────────────────────────────────────
const AnimatedHeart: React.FC<{ type: 'flame' | 'broken' }> = ({ type }) => {
  const scale = useRef(new Animated.Value(0.5)).current;
  const glow = useRef(new Animated.Value(0.3)).current;
  const leftHalf = useRef(new Animated.Value(0)).current;
  const rightHalf = useRef(new Animated.Value(0)).current;
  const repairScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (type === 'flame') {
      // Entry bounce + continuous pulse
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1,
          tension: 50,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.12,
              duration: 600,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 600,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        ).start();
      });

      // Glow pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 0.8,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Broken heart: split apart, then come back together
      Animated.sequence([
        // Split
        Animated.parallel([
          Animated.timing(leftHalf, {
            toValue: -12,
            duration: 400,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(rightHalf, {
            toValue: 12,
            duration: 400,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          Animated.timing(repairScale, {
            toValue: 0.9,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        // Pause
        Animated.delay(600),
        // Repair
        Animated.parallel([
          Animated.spring(leftHalf, {
            toValue: 0,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.spring(rightHalf, {
            toValue: 0,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.spring(repairScale, {
            toValue: 1.1,
            tension: 60,
            friction: 5,
            useNativeDriver: true,
          }),
        ]),
        // Settle
        Animated.spring(repairScale, {
          toValue: 1,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [type, scale, glow, leftHalf, rightHalf, repairScale]);

  if (type === 'flame') {
    return (
      <View style={styles.heartContainer}>
        {/* Glow */}
        <Animated.View
          style={[
            styles.heartGlow,
            { opacity: glow },
          ]}
        />
        {/* Flame particles */}
        {Array.from({ length: FLAME_PARTICLE_COUNT }).map((_, i) => (
          <FlameParticle key={i} delay={i * 100} index={i} />
        ))}
        {/* Heart */}
        <Animated.Text style={[styles.heartEmoji, { transform: [{ scale }] }]}>
          ❤️‍🔥
        </Animated.Text>
      </View>
    );
  }

  // Broken heart
  return (
    <View style={styles.heartContainer}>
      <Animated.View style={{ transform: [{ scale: repairScale }], flexDirection: 'row' }}>
        <Animated.Text
          style={[styles.brokenHalf, { transform: [{ translateX: leftHalf }, { rotate: '-5deg' }] }]}
        >
          💔
        </Animated.Text>
        <Animated.Text
          style={[styles.brokenHalf, { transform: [{ translateX: rightHalf }], opacity: 0 }]}
        >
          💔
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

// ── Main Modal ─────────────────────────────────────────────────────────────
export const StreakCelebrationModal: React.FC<Props> = ({ milestone, onDismiss }) => {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(40)).current;
  const numberScale = useRef(new Animated.Value(0.3)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(contentTranslateY, { toValue: 40, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [contentOpacity, contentTranslateY, onDismiss]);

  useEffect(() => {
    if (!milestone) return;

    // Reset
    contentOpacity.setValue(0);
    contentTranslateY.setValue(40);
    numberScale.setValue(0.3);

    // Animate in
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.spring(numberScale, {
          toValue: 1,
          tension: 40,
          friction: 5,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [milestone, dismiss, contentOpacity, contentTranslateY, numberScale]);

  const computed = useMemo(() => {
    if (!milestone) return null;
    const { newStreak, isNewRecord, celebrationType } = milestone;
    const isMilestone = STREAK_MILESTONES.has(newStreak);
    const showCelebration = isNewRecord || isMilestone;
    const celebrationIntensity = isNewRecord ? 'full' as const : 'medium' as const;
    return { isMilestone, showCelebration, celebrationIntensity, celebrationType };
  }, [milestone]);

  if (!milestone || !computed) return null;

  const { newStreak, isNewRecord } = milestone;
  const { isMilestone, showCelebration, celebrationIntensity, celebrationType } = computed;

  const getMessage = () => {
    if (celebrationType === 'lost') {
      return t('streak.celebration.lostMessage');
    }
    if (isNewRecord) {
      return t('streak.celebration.newRecord');
    }
    return t('streak.celebration.keepGoing');
  };

  return (
    <Modal transparent animationType="fade" visible={!!milestone} onRequestClose={dismiss}>
      <View style={styles.overlay}>
        {/* Confetti */}
        <Celebration visible={showCelebration} intensity={celebrationIntensity} haptic />

        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentOpacity,
              transform: [{ translateY: contentTranslateY }],
            },
          ]}
        >
          {/* Heart animation */}
          <AnimatedHeart type={celebrationType === 'lost' ? 'broken' : 'flame'} />

          {/* Streak number */}
          <Animated.Text
            style={[
              styles.streakNumber,
              {
                color: celebrationType === 'lost' ? '#EF4444' : '#F97316',
                transform: [{ scale: numberScale }],
              },
            ]}
          >
            {newStreak}
          </Animated.Text>

          {/* Day Streak label */}
          <Text style={styles.dayLabel}>
            {t('streak.celebration.dayStreak')}
          </Text>

          {/* Milestone / Record badge */}
          {(isMilestone || isNewRecord) && (
            <View
              style={[
                styles.badge,
                { backgroundColor: isNewRecord ? '#F97316' : '#8B5CF6' },
              ]}
            >
              <Text style={styles.badgeText}>
                {isNewRecord
                  ? t('streak.celebration.newRecordBadge')
                  : t('streak.celebration.milestone')}
              </Text>
            </View>
          )}

          {/* Message */}
          <Text style={styles.messageText}>{getMessage()}</Text>

          {/* Continue button */}
          <TouchableOpacity style={styles.continueButton} onPress={dismiss} activeOpacity={0.8}>
            <Text style={styles.continueButtonText}>
              {t('streak.celebration.continue')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  heartContainer: {
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  heartGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF6B35',
  },
  heartEmoji: {
    fontSize: 72,
  },
  brokenHalf: {
    fontSize: 72,
  },
  streakNumber: {
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -2,
    marginTop: -4,
  },
  dayLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: -2,
    marginBottom: 12,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 16,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  continueButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
