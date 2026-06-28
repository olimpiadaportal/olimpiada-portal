/**
 * Notification Center Screen
 * Dedicated screen for viewing and managing all notifications.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../services/supabase';
import { spacing } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import NotificationDetailModal from '../../components/notifications/NotificationDetailModal';
import { FadeIn } from '../../components/animated';

interface NotificationData {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: any;
}

export const NotificationCenterScreen = ({ navigation }: any) => {
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { t } = useTranslation();
  
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState<NotificationData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const filters = [
    { key: 'all', label: t('notifications.all', 'All'), icon: 'notifications-outline' },
    { key: 'general', label: t('notifications.general', 'General'), icon: 'information-circle-outline' },
    { key: 'exam', label: t('notifications.exams', 'Exams'), icon: 'school-outline' },
    { key: 'booking', label: t('notifications.bookings', 'Bookings'), icon: 'calendar-outline' },
    { key: 'payment', label: t('notifications.payments', 'Payments'), icon: 'card-outline' },
    { key: 'achievement', label: t('notifications.achievements', 'Achievements'), icon: 'trophy-outline' },
    { key: 'reminder', label: t('notifications.reminders', 'Reminders'), icon: 'alarm-outline' },
    { key: 'announcement', label: t('notifications.announcements', 'Announcements'), icon: 'megaphone-outline' },
  ];

  useEffect(() => {
    loadNotifications();

    // Set up real-time subscription for new notifications
    // This has minimal performance impact as Supabase uses WebSocket connections
    if (user?.id) {
      const subscription = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Add new notification to the top of the list
            const newNotification: NotificationData = {
              id: payload.new.id,
              user_id: payload.new.user_id,
              title: payload.new.title,
              body: payload.new.body,
              type: payload.new.type || 'general',
              is_read: payload.new.is_read || false,
              created_at: payload.new.created_at,
              data: payload.new.data || {},
            };
            setNotifications(prev => [newNotification, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Update notification in list
            setNotifications(prev =>
              prev.map(n =>
                n.id === payload.new.id
                  ? { ...n, is_read: payload.new.is_read }
                  : n
              )
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Remove notification from list
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        )
        .subscribe();

      // Cleanup subscription on unmount
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user?.id]);

  // Use useMemo for filtered notifications to avoid unnecessary re-renders
  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];

    if (selectedFilter !== 'all') {
      filtered = filtered.filter(n => n.type === selectedFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        n =>
          n.title.toLowerCase().includes(query) ||
          n.body.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [notifications, searchQuery, selectedFilter]);

  const loadNotifications = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);

      // Query the notifications table directly - this is populated by admin_send_notification RPC
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Transform data to match NotificationData interface
      const transformedData = (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        title: item.title,
        body: item.body,
        type: item.type || 'general',
        is_read: item.is_read || false,
        created_at: item.created_at,
        data: item.data || {},
      }));

      setNotifications(transformedData);
      
      const unread = transformedData.filter((n: NotificationData) => !n.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [user?.id]);


  const markAsRead = async (notificationId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationPress = (notification: NotificationData) => {
    setSelectedNotification(notification);
    setShowDetailModal(true);
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedNotification(null);
  };

  const handleDeleteFromModal = (id: string) => {
    deleteNotification(id);
    handleCloseModal();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'exam': return 'school-outline';
      case 'booking': return 'calendar-outline';
      case 'achievement': return 'trophy-outline';
      case 'reminder': return 'alarm-outline';
      default: return 'notifications-outline';
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
    if (diffMins < 60) return t('notifications.minutesAgo', '{{count}}m ago', { count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', '{{count}}h ago', { count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', '{{count}}d ago', { count: diffDays });
    return date.toLocaleDateString();
  };

  const renderNotificationItem = ({ item, index }: { item: NotificationData; index: number }) => (
    <FadeIn delay={index * 30} duration={250}>
      <TouchableOpacity
        style={[
          styles.notificationItem,
          { backgroundColor: item.is_read ? colors.background : colors.card },
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons
            name={getNotificationIcon(item.type) as keyof typeof Ionicons.glyphMap}
            size={24}
            color={colors.primary}
          />
        </View>
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.is_read && (
              <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
            )}
          </View>
          <Text style={[styles.notificationBody, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteNotification(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} />
        </TouchableOpacity>
      </TouchableOpacity>
    </FadeIn>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={64} color={colors.textSecondary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('notifications.noNotifications', 'No notifications')}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {searchQuery || selectedFilter !== 'all'
          ? t('notifications.noMatch', 'No notifications match your filters')
          : t('notifications.allCaughtUp', "You're all caught up!")}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('notifications.loading', 'Loading notifications...')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header - outside FlatList to prevent TextInput losing focus */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('notifications.title', 'Notifications')}</Text>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.markAllButton, { backgroundColor: colors.primary }]}
              onPress={markAllAsRead}
            >
              <Text style={styles.markAllText}>{t('notifications.markAllRead', 'Mark all read')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder={t('notifications.search', 'Search notifications...')}
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category filters - use ScrollView instead of FlatList */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {filters.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    selectedFilter === item.key ? colors.primary : colors.card,
                  borderColor:
                    selectedFilter === item.key ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedFilter(item.key)}
            >
              <Ionicons
                name={item.icon as any}
                size={16}
                color={selectedFilter === item.key ? '#fff' : colors.text}
              />
              <Text
                style={[
                  styles.filterText,
                  { color: selectedFilter === item.key ? '#fff' : colors.text },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.statsText, { color: colors.textSecondary }]}>
          {t('notifications.count', '{{count}} notifications', { count: filteredNotifications.length })}
          {unreadCount > 0 && ` • ${t('notifications.unreadCount', '{{count}} unread', { count: unreadCount })}`}
        </Text>
      </View>

      {/* Notifications List */}
      <FlatList
        data={filteredNotifications}
        keyExtractor={item => item.id}
        renderItem={renderNotificationItem}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Notification Detail Modal */}
      <NotificationDetailModal
        visible={showDetailModal}
        notification={selectedNotification}
        onClose={handleCloseModal}
        onMarkAsRead={markAsRead}
        onDelete={handleDeleteFromModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    padding: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backButton: {
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  markAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  filtersContainer: {
    marginBottom: spacing.sm,
  },
  filtersContent: {
    paddingRight: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  filterText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  statsText: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  notificationBody: {
    fontSize: 14,
    marginTop: 4,
  },
  notificationTime: {
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
