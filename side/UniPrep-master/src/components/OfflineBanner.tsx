// Offline Banner Component
// Stage 6 - Week 3: Offline Mode Implementation
// Shows offline status and pending sync count

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing } from '../constants/theme';
import { useOffline } from '../contexts/OfflineContext';

interface OfflineBannerProps {
  /** Override unsynced count (optional, uses context by default) */
  unsyncedCount?: number;
  /** Show sync button */
  showSyncButton?: boolean;
  /** Compact mode */
  compact?: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ 
  unsyncedCount: propUnsyncedCount,
  showSyncButton = false,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { isOffline, pendingSessionCount, isSyncing, syncNow, isOnline } = useOffline();
  const insets = useSafeAreaInsets();
  const [pulseAnim] = useState(new Animated.Value(1));
  
  const unsyncedCount = propUnsyncedCount ?? pendingSessionCount;

  // Pulse animation when syncing
  useEffect(() => {
    if (isSyncing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSyncing]);

  // Don't show if online and no pending syncs
  if (isOnline && unsyncedCount === 0 && !isSyncing) {
    return null;
  }

  const handleSync = async () => {
    if (!isSyncing && isOnline) {
      await syncNow();
    }
  };

  const backgroundColor = isOffline ? colors.warning : colors.info;
  const icon = isOffline ? 'cloud-offline' : isSyncing ? 'sync' : 'cloud-upload';

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={colors.white} />
        {unsyncedCount > 0 && (
          <Text style={styles.compactText}>{unsyncedCount}</Text>
        )}
      </View>
    );
  }
  
  return (
    <Animated.View style={[styles.container, { backgroundColor, opacity: pulseAnim, paddingTop: insets.top > 0 ? insets.top : spacing.md }]}>
      <View style={styles.content}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.white} />
        <Text style={styles.text}>
          {isOffline 
            ? t('common.offlineMode', 'Offline Mode')
            : isSyncing 
              ? t('common.syncing', 'Syncing...')
              : t('common.pendingSync', 'Pending sync')
          }
        </Text>
      </View>
      
      {showSyncButton && isOnline && unsyncedCount > 0 && !isSyncing && (
        <TouchableOpacity onPress={handleSync} style={styles.syncButton}>
          <Text style={styles.syncButtonText}>{t('common.syncNow', 'Sync Now')}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    fontSize: typography.fontSizes.xs,
    color: colors.white,
    fontWeight: typography.fontWeights.medium as '400' | '500' | '600' | '700' | '800' | '900',
  },
  syncButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncButtonText: {
    fontSize: typography.fontSizes.xs,
    color: colors.white,
    fontWeight: typography.fontWeights.semibold as '400' | '500' | '600' | '700' | '800' | '900',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  compactText: {
    fontSize: 10,
    color: colors.white,
    fontWeight: typography.fontWeights.bold as '400' | '500' | '600' | '700' | '800' | '900',
  },
});
