import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { motivationService, StudyTip } from '../../services/motivationService';

interface DynamicGreetingProps {
  userName: string;
  avatarUrl?: string;
  streak?: number;
  accuracy?: number;
  questionsAttempted?: number;
  onAvatarPress?: () => void;
}

export const DynamicGreeting: React.FC<DynamicGreetingProps> = ({
  userName,
  avatarUrl,
  onAvatarPress,
}) => {
  const { colors } = useTheme();
  const [studyTip, setStudyTip] = useState<StudyTip | null>(null);

  // Get time-based greeting
  const greeting = motivationService.getGreeting(userName);

  // Load rotating study tip (changes every 6 hours)
  useEffect(() => {
    const loadTip = async () => {
      const tip = await motivationService.getRotatingTip();
      setStudyTip(tip);
    };
    loadTip();

    // Check for tip update every hour (in case 6-hour window changes)
    const interval = setInterval(loadTip, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.content}>
        {/* Avatar */}
        <TouchableOpacity 
          style={styles.avatarContainer}
          onPress={onAvatarPress}
          activeOpacity={0.7}
        >
          {avatarUrl ? (
            <Image 
              source={{ uri: avatarUrl }} 
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Greeting Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.greeting, { color: colors.text }]}>
            {greeting}
          </Text>
          {studyTip && (
            <View style={styles.tipContainer}>
              <Text style={styles.tipIcon}>{studyTip.icon}</Text>
              <Text 
                style={[styles.tipText, { color: colors.textSecondary }]} 
                numberOfLines={3}
              >
                {studyTip.tip}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  textContainer: {
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  tipIcon: {
    fontSize: 14,
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  streakEmoji: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
