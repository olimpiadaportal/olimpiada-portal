import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { streakService } from '../services/streakService';
import { spacing } from '../constants/theme';

interface StreakIndicatorProps {
  showDetails?: boolean;
  onPress?: () => void;
}

// Cache for streak data to prevent excessive API calls
let cachedStreakData: {
  currentStreak: number;
  bestStreak: number;
  status: 'active' | 'at_risk' | 'lost';
  hoursUntilLoss: number;
  freezeAvailable: boolean;
  cachedAt: number;
} | null = null;

const CACHE_DURATION = 30000; // 30 seconds cache

export const StreakIndicator: React.FC<StreakIndicatorProps> = ({
  showDetails = false,
  onPress,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [streak, setStreak] = useState(cachedStreakData?.currentStreak ?? 0);
  const [bestStreak, setBestStreak] = useState(cachedStreakData?.bestStreak ?? 0);
  const [status, setStatus] = useState<'active' | 'at_risk' | 'lost'>(cachedStreakData?.status ?? 'active');
  const [hoursLeft, setHoursLeft] = useState(cachedStreakData?.hoursUntilLoss ?? 24);
  const [freezeAvailable, setFreezeAvailable] = useState(cachedStreakData?.freezeAvailable ?? false);
  const [loading, setLoading] = useState(!cachedStreakData);
  
  const appState = useRef(AppState.currentState);
  const isLoadingRef = useRef(false);

  const loadStreakStatus = useCallback(async (forceRefresh = false) => {
    // Prevent concurrent loads
    if (isLoadingRef.current) return;
    
    // Use cache if available and not expired
    if (!forceRefresh && cachedStreakData && Date.now() - cachedStreakData.cachedAt < CACHE_DURATION) {
      setStreak(cachedStreakData.currentStreak);
      setBestStreak(cachedStreakData.bestStreak);
      setStatus(cachedStreakData.status);
      setHoursLeft(cachedStreakData.hoursUntilLoss);
      setFreezeAvailable(cachedStreakData.freezeAvailable);
      setLoading(false);
      return;
    }
    
    isLoadingRef.current = true;
    try {
      const data = await streakService.getStreakStatus();
      
      // Update cache
      cachedStreakData = {
        currentStreak: data.currentStreak,
        bestStreak: data.bestStreak,
        status: data.status,
        hoursUntilLoss: data.hoursUntilLoss,
        freezeAvailable: data.freezeAvailable,
        cachedAt: Date.now(),
      };
      
      setStreak(data.currentStreak);
      setBestStreak(data.bestStreak);
      setStatus(data.status);
      setHoursLeft(data.hoursUntilLoss);
      setFreezeAvailable(data.freezeAvailable);
    } catch (error) {
      console.error('Error loading streak:', error);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial load (use cache if available)
    loadStreakStatus();

    // Update every 5 minutes instead of every minute (reduces API calls)
    const interval = setInterval(() => loadStreakStatus(true), 300000);

    // Subscribe to real-time updates
    const unsubscribe = streakService.subscribeToStreakChanges((newStreak) => {
      setStreak(newStreak);
      // Invalidate cache when real-time update received
      if (cachedStreakData) {
        cachedStreakData.currentStreak = newStreak;
        cachedStreakData.cachedAt = Date.now();
      }
    });
    
    // Refresh when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        loadStreakStatus(true);
      }
      appState.current = nextAppState;
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
      subscription.remove();
    };
  }, [loadStreakStatus]);

  const getStreakColor = () => {
    return streakService.getStreakColor(status, streak);
  };

  const getStreakIcon = () => {
    if (streak === 0) return 'flame-outline';
    if (status === 'lost') return 'flame-outline';
    if (status === 'at_risk') return 'warning';
    return 'flame';
  };

  const getStreakEmoji = () => {
    return streakService.getStreakEmoji(streak);
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  const content = (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={getStreakIcon()} size={24} color={getStreakColor()} />
      </View>

      <View style={styles.textContainer}>
        <View style={styles.streakRow}>
          <Text style={[styles.streakText, { color: getStreakColor() }]}>
            {getStreakEmoji()} {streak}
          </Text>
          <Text style={styles.streakLabel}>{t('common.dayStreak')}</Text>
        </View>

        {showDetails && (
          <>
            {/* Show time remaining only if at_risk AND hours > 0 */}
            {status === 'at_risk' && hoursLeft > 0 && (
              <View style={styles.warningContainer}>
                <Ionicons name="time-outline" size={14} color={colors.warning} />
                <Text style={styles.warningText}>
                  {streakService.formatTimeRemaining(hoursLeft, t)} {t('streak.remaining')}
                </Text>
              </View>
            )}

            {/* Show "Practice now to keep your streak!" when at_risk but time expired */}
            {status === 'at_risk' && hoursLeft <= 0 && (
              <View style={styles.warningContainer}>
                <Ionicons name="alert-circle" size={14} color={colors.warning} />
                <Text style={styles.warningText}>
                  {t('streak.practiceNow')}
                </Text>
              </View>
            )}

            {status === 'lost' && (
              <Text style={styles.lostText}>{t('streak.lostMessage')}</Text>
            )}

            {/* Show active status message when streak is healthy */}
            {status === 'active' && streak > 0 && (
              <View style={styles.activeContainer}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.activeText}>
                  {t('streak.keepGoing')}
                </Text>
              </View>
            )}

            {bestStreak > streak && (
              <Text style={styles.bestStreakText}>
                {t('streak.best')}: {bestStreak} {t('common.days')}
              </Text>
            )}

            {freezeAvailable && status === 'at_risk' && (
              <TouchableOpacity
                style={styles.freezeButton}
                onPress={async () => {
                  const success = await streakService.useStreakFreeze();
                  if (success) {
                    loadStreakStatus();
                  }
                }}
              >
                <Ionicons name="snow-outline" size={14} color={colors.primary} />
                <Text style={styles.freezeButtonText}>{t('streak.useFreeze')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    iconContainer: {
      marginRight: spacing.sm,
    },
    textContainer: {
      flex: 1,
    },
    streakRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
    },
    streakText: {
      fontSize: 20,
      fontWeight: '700',
    },
    streakLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
      gap: spacing.xs,
    },
    warningText: {
      fontSize: 12,
      color: colors.warning,
      fontWeight: '600',
    },
    activeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
      gap: spacing.xs,
    },
    activeText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: '600',
    },
    lostText: {
      fontSize: 12,
      color: colors.error,
      marginTop: spacing.xs,
    },
    bestStreakText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    freezeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.primaryLight,
      borderRadius: 8,
      alignSelf: 'flex-start',
      gap: spacing.xs,
    },
    freezeButtonText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
  });
