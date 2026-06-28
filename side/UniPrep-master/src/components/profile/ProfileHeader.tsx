// Profile Header Component
// Stage 9 - Phase 2
// Reusable profile header with gradient and avatar

import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../../constants/theme';

interface ProfileHeaderProps {
  avatarUrl?: string;
  firstName: string;
  lastName: string;
  email?: string;
  completionPercentage?: number;
  onEditAvatar?: () => void;
  onBack?: () => void;
  onSettings?: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  avatarUrl,
  firstName,
  lastName,
  email,
  completionPercentage,
  onEditAvatar,
  onBack,
  onSettings,
}) => {
  return (
    <View style={styles.header}>
      {/* Header Actions */}
      {(onBack || onSettings) && (
        <View style={styles.headerTop}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.actionButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          <View style={styles.spacer} />
          {onSettings && (
            <TouchableOpacity onPress={onSettings} style={styles.actionButton}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={48} color="#fff" />
          </View>
        )}
        {onEditAvatar && (
          <TouchableOpacity style={styles.editAvatarButton} onPress={onEditAvatar}>
            <Ionicons name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Name */}
      <Text style={styles.name}>
        {firstName} {lastName}
      </Text>

      {/* Email */}
      {email && <Text style={styles.email}>{email}</Text>}

      {/* Completion Bar */}
      {completionPercentage !== undefined && completionPercentage < 100 && (
        <View style={styles.completionContainer}>
          <View style={styles.completionBar}>
            <View
              style={[
                styles.completionFill,
                { width: `${completionPercentage}%` },
              ]}
            />
          </View>
          <Text style={styles.completionText}>
            Profile {completionPercentage}% Complete
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    padding: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.lg,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  name: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: '#fff',
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: typography.fontSizes.sm,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.md,
  },
  completionContainer: {
    width: '100%',
    marginTop: spacing.md,
  },
  completionBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  completionFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  completionText: {
    fontSize: typography.fontSizes.xs,
    color: 'rgba(255,255,255,0.9)',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
