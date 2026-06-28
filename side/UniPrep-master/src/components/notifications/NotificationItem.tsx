/**
 * Notification Item Component
 * Phase 1: Foundation Enhancement
 * 
 * Individual notification item with swipe actions.
 * Features:
 * - Display notification with icon and content
 * - Unread indicator
 * - Swipe to delete
 * - Mark as read/unread
 * - Time ago display
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Notification } from '../../types';

interface NotificationItemProps {
  notification: Notification;
  onPress: () => void;
  onDelete: () => void;
  onMarkAsRead: () => void;
}

export default function NotificationItem({
  notification,
  onPress,
  onDelete,
  onMarkAsRead,
}: NotificationItemProps) {
  const { colors, themeColors } = useTheme();

  const getNotificationIcon = (type: string) => {
    const icons: Record<string, string> = {
      exam: 'school',
      booking: 'calendar',
      achievement: 'trophy',
      reminder: 'alarm',
      general: 'notifications',
      message: 'chatbubble',
    };
    return icons[type] || 'notifications';
  };

  const getNotificationColor = (type: string) => {
    const colors: Record<string, string> = {
      exam: '#3B82F6',
      booking: '#8B5CF6',
      achievement: '#F59E0B',
      reminder: '#10B981',
      general: '#6B7280',
      message: '#EC4899',
    };
    return colors[type] || '#6B7280';
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: notification.is_read
            ? themeColors.background
            : themeColors.card,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {/* Icon */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: getNotificationColor(notification.type) + '20' },
          ]}
        >
          <Ionicons
            name={getNotificationIcon(notification.type) as keyof typeof Ionicons.glyphMap}
            size={24}
            color={getNotificationColor(notification.type)}
          />
        </View>

        {/* Content */}
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text
              style={[
                styles.title,
                {
                  color: colors.text,
                  fontWeight: notification.is_read ? '500' : '700',
                },
              ]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {!notification.is_read && (
              <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
            )}
          </View>

          <Text
            style={[styles.body, { color: themeColors.textSecondary }]}
            numberOfLines={2}
          >
            {notification.body}
          </Text>

          <Text style={[styles.time, { color: themeColors.textSecondary }]}>
            {getTimeAgo(notification.created_at)}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {!notification.is_read && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onMarkAsRead}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 4,
    marginLeft: 8,
  },
});
