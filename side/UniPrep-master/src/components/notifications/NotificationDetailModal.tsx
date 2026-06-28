/**
 * NotificationDetailModal
 * Modal to display full notification details
 * Supports dark mode and translations (en, az, ru)
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { notificationHandler } from '../../services/notificationHandlerService';

interface NotificationData {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, any>;
}

interface NotificationDetailModalProps {
  visible: boolean;
  notification: NotificationData | null;
  onClose: () => void;
  onMarkAsRead?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const { width: screenWidth } = Dimensions.get('window');

const NotificationDetailModal: React.FC<NotificationDetailModalProps> = ({
  visible,
  notification,
  onClose,
  onMarkAsRead,
  onDelete,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!notification) return null;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'exam':
        return 'document-text';
      case 'achievement':
        return 'trophy';
      case 'reminder':
        return 'alarm';
      case 'booking':
        return 'calendar';
      case 'message':
        return 'chatbubble';
      case 'announcement':
        return 'megaphone';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'exam':
        return '#3B82F6';
      case 'achievement':
        return '#F59E0B';
      case 'reminder':
        return '#8B5CF6';
      case 'booking':
        return '#10B981';
      case 'message':
        return '#06B6D4';
      case 'announcement':
        return '#EF4444';
      default:
        return colors.primary;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow', 'Just now');
    if (diffMins < 60) return t('notifications.minutesAgo', '{{count}} min ago', { count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', '{{count}} hours ago', { count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', '{{count}} days ago', { count: diffDays });
    
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMarkAsRead = () => {
    if (onMarkAsRead && !notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(notification.id);
      onClose();
    }
  };

  const iconColor = getNotificationColor(notification.type);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {t('notifications.details', 'Notification Details')}
            </Text>
            <View style={styles.headerRight} />
          </View>

          <ScrollView 
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Icon and Type */}
            <View style={styles.iconSection}>
              <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
                <Ionicons 
                  name={getNotificationIcon(notification.type) as keyof typeof Ionicons.glyphMap} 
                  size={32} 
                  color={iconColor} 
                />
              </View>
              <View style={[styles.typeBadge, { backgroundColor: iconColor + '20' }]}>
                <Text style={[styles.typeText, { color: iconColor }]}>
                  {t(`notifications.types.${notification.type}`, notification.type.charAt(0).toUpperCase() + notification.type.slice(1))}
                </Text>
              </View>
              {!notification.is_read && (
                <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.unreadText}>
                    {t('notifications.new', 'New')}
                  </Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: colors.text }]}>
              {notification.title}
            </Text>

            {/* Time */}
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                {formatDate(notification.created_at)}
              </Text>
            </View>

            {/* Body */}
            <View style={[styles.bodyContainer, { backgroundColor: colors.background }]}>
              <Text style={[styles.body, { color: colors.text }]}>
                {notification.body}
              </Text>
            </View>

            {/* Payment Required Action - Go to My Bookings */}
            {(notification.data?.notification_subtype === 'booking_accepted_payment_required' || 
              notification.data?.type === 'payment_required') && (
              <TouchableOpacity
                style={[styles.actionUrlContainer, { backgroundColor: '#10B981' + '20' }]}
                onPress={() => {
                  try {
                    // Navigate to My Bookings screen with Pending tab
                    notificationHandler.handleDeepLink('elmly://bookings?tab=pending');
                    onClose();
                  } catch (error) {
                    console.error('Error navigating to bookings:', error);
                  }
                }}
              >
                <Ionicons name="card-outline" size={20} color="#10B981" />
                <Text style={[styles.actionUrlText, { color: '#10B981' }]}>
                  {t('notifications.goToBookings', 'Go to Bookings')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#10B981" />
              </TouchableOpacity>
            )}

            {/* Action URL - Display as clickable link */}
            {notification.data?.action_url && (
              <TouchableOpacity
                style={[styles.actionUrlContainer, { backgroundColor: colors.primary + '15' }]}
                onPress={async () => {
                  const url = notification.data!.action_url;
                  
                  // Check if it's an external URL (http/https)
                  if (url.startsWith('http://') || url.startsWith('https://')) {
                    try {
                      const canOpen = await Linking.canOpenURL(url);
                      if (canOpen) {
                        await Linking.openURL(url);
                      } else {
                        Alert.alert('Error', 'Cannot open this link');
                      }
                    } catch (error) {
                      console.error('Error opening URL:', error);
                      Alert.alert('Error', 'Failed to open link');
                    }
                  } 
                  // Check if it's an internal deep link (elmly://)
                  else if (url.startsWith('elmly://')) {
                    try {
                      console.log('🔗 Opening deep link from notification:', url);
                      notificationHandler.handleDeepLink(url);
                      // Close the modal after navigation
                      onClose();
                    } catch (error) {
                      console.error('Error handling deep link:', error);
                      Alert.alert('Error', 'Failed to navigate');
                    }
                  }
                  // Handle relative paths (e.g., /bookings/123) - convert to deep link
                  else if (url.startsWith('/')) {
                    try {
                      // Convert relative path to deep link format
                      // /bookings/123 -> elmly://bookings/123
                      const deepLinkUrl = `elmly:/${url}`;
                      notificationHandler.handleDeepLink(deepLinkUrl);
                      onClose();
                    } catch (error) {
                      console.error('Error handling relative path:', error);
                      Alert.alert('Error', 'Failed to navigate');
                    }
                  }
                  else {
                    console.warn('Unknown URL format:', url);
                    Alert.alert('Error', 'Invalid link format');
                  }
                }}
              >
                <Ionicons name="link-outline" size={20} color={colors.primary} />
                <Text style={[styles.actionUrlText, { color: colors.primary }]} numberOfLines={1}>
                  {t('notifications.openLink', 'Open Link')}
                </Text>
                <Ionicons name="open-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}

            {/* Additional Data (excluding technical/redundant fields) */}
            {notification.data && (() => {
              // Fields to exclude from display (technical/redundant)
              const excludedFields = [
                'action_url', 'type', 'notification_subtype', 
                'bookingId', 'booking_id', 'teacher_id', 'student_id',
                'conversationId', 'conversation_id'
              ];
              
              const filteredEntries = Object.entries(notification.data)
                .filter(([key]) => !excludedFields.includes(key) && !key.endsWith('_id'));
              
              if (filteredEntries.length === 0) return null;
              
              // Get translated label for common fields
              const getFieldLabel = (fieldKey: string): string => {
                const fieldMap: Record<string, string> = {
                  'scheduledDate': t('notifications.fields.date', 'Date'),
                  'scheduled_date': t('notifications.fields.date', 'Date'),
                  'scheduledTime': t('notifications.fields.time', 'Time'),
                  'scheduled_time': t('notifications.fields.time', 'Time'),
                  'amount': t('notifications.fields.amount', 'Amount'),
                  'price': t('notifications.fields.price', 'Price'),
                  'currency': t('notifications.fields.currency', 'Currency'),
                  'subjectName': t('notifications.fields.subject', 'Subject'),
                  'subject_name': t('notifications.fields.subject', 'Subject'),
                  'teacherName': t('notifications.fields.teacher', 'Teacher'),
                  'teacher_name': t('notifications.fields.teacher', 'Teacher'),
                  'studentName': t('notifications.fields.student', 'Student'),
                  'student_name': t('notifications.fields.student', 'Student'),
                };
                return fieldMap[fieldKey] || fieldKey.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().replace(/\b\w/g, l => l.toUpperCase());
              };

              // Format value for display
              const formatValue = (key: string, value: any): string => {
                if (value === null || value === undefined) return '-';
                if (typeof value === 'object') return JSON.stringify(value);
                // Format currency with amount
                if (key === 'amount' || key === 'price') {
                  const currency = notification.data?.currency || 'AZN';
                  return `${value} ${currency}`;
                }
                return String(value);
              };

              // Skip currency if we already showed it with amount
              const hasAmount = filteredEntries.some(([k]) => k === 'amount' || k === 'price');
              const finalEntries = filteredEntries.filter(([k]) => !(hasAmount && k === 'currency'));

              if (finalEntries.length === 0) return null;

              return (
                <View style={[styles.dataSection, { backgroundColor: colors.background }]}>
                  <Text style={[styles.dataSectionTitle, { color: colors.textSecondary }]}>
                    {t('notifications.additionalInfo', 'Additional Information')}
                  </Text>
                  {finalEntries.map(([key, value]) => (
                    <View key={key} style={styles.dataRow}>
                      <Text style={[styles.dataKey, { color: colors.textSecondary }]}>
                        {getFieldLabel(key)}:
                      </Text>
                      <Text style={[styles.dataValue, { color: colors.text }]}>
                        {formatValue(key, value)}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>

          {/* Actions - Only show delete button since mark as read happens automatically on open */}
          {onDelete && (
            <View style={[
              styles.actions, 
              { 
                borderTopColor: colors.border,
                paddingBottom: Math.max(16, insets.bottom + 8), // Safe area for Android nav bar
              }
            ]}>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>
                  {t('notifications.delete', 'Delete')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    minHeight: 400,
    maxHeight: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  iconSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unreadBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 28,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  timeText: {
    fontSize: 14,
  },
  bodyContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  actionUrlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  actionUrlText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  dataSection: {
    padding: 16,
    borderRadius: 12,
  },
  dataSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dataKey: {
    fontSize: 14,
    marginRight: 8,
  },
  dataValue: {
    fontSize: 14,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
  },
});

export default NotificationDetailModal;
