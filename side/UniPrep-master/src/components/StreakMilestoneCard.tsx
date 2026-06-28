/**
 * StreakMilestoneCard
 *
 * A slide-up overlay card shown on completion screens after a streak update.
 * - Slides up from the bottom with a spring animation.
 * - For records and milestone numbers (3, 7, 14, 21, 30 …) the Celebration
 *   confetti fires as well.
 * - Auto-dismisses after 3 s; tap anywhere on the card to dismiss early.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Celebration } from './animated';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { StreakMilestone } from '../store/authStore';

const STREAK_MILESTONES = new Set([3, 7, 14, 21, 30, 50, 75, 100]);
const AUTO_DISMISS_MS = 3200;

const getStreakEmoji = (streak: number, status: string): string => {
  if (status === 'lost') return '💔';
  if (streak >= 100) return '🏆';
  if (streak >= 50) return '💎';
  if (streak >= 30) return '⭐';
  if (streak >= 14) return '🔥';
  if (streak >= 7) return '💪';
  if (streak >= 3) return '✨';
  return '🌱';
};

interface Props {
  milestone: StreakMilestone | null;
  onDismiss: () => void;
}

export const StreakMilestoneCard: React.FC<Props> = ({ milestone, onDismiss }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const translateY = useRef(new Animated.Value(200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 200, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [translateY, opacity, onDismiss]);

  useEffect(() => {
    if (!milestone) return;

    // Reset position before animating in
    translateY.setValue(200);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 9,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [milestone, dismiss, translateY, opacity]);

  if (!milestone || milestone.status === 'lost') return null;

  const { newStreak, prevStreak, isNewRecord, status } = milestone;
  const streakExtended = newStreak > prevStreak;
  const isMilestone = STREAK_MILESTONES.has(newStreak);
  const showCelebration = isNewRecord || isMilestone;

  const emoji = getStreakEmoji(newStreak, status);
  const accentColor = status === 'at_risk' ? '#F59E0B' : '#F97316';

  return (
    <>
      {/* Confetti — fullscreen, behind the card */}
      <Celebration
        visible={showCelebration}
        intensity={isNewRecord ? 'full' : 'medium'}
        haptic
      />

      {/* Card */}
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: accentColor,
              transform: [{ translateY }],
              opacity,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.cardInner}
            onPress={dismiss}
            activeOpacity={0.9}
          >
            {/* Accent bar */}
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

            <View style={styles.row}>
              {/* Emoji */}
              <Text style={styles.emoji}>{emoji}</Text>

              {/* Info */}
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Text style={[styles.streakNumber, { color: accentColor }]}>
                    {newStreak}
                  </Text>
                  <Text style={[styles.dayLabel, { color: colors.text }]}>
                    {' '}{t('streak.popup.dayStreak', { count: newStreak })}
                  </Text>
                  {(isNewRecord || isMilestone) && (
                    <View style={[styles.badge, { backgroundColor: accentColor }]}>
                      <Text style={styles.badgeText}>
                        {isNewRecord ? t('streak.popup.newRecord') : t('streak.popup.milestone')}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.message, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {status === 'at_risk'
                    ? t('streak.popup.atRisk')
                    : streakExtended
                    ? t('streak.popup.keepItUp')
                    : t('streak.popup.greatWork')}
                </Text>
              </View>

              {/* Dismiss hint */}
              <Ionicons
                name="close"
                size={18}
                color={colors.textSecondary}
                style={styles.closeIcon}
              />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 32,
    zIndex: 100,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  cardInner: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 36,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  streakNumber: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeIcon: {
    alignSelf: 'flex-start',
    padding: 2,
  },
});
