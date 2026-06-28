import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useMessagingStore } from '../../store/messagingStore';
import { messagingService, Conversation } from '../../services/messagingService';
import { useAllConversations } from '../../hooks/useRealtime';
import { spacing } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { ErrorMessage } from '../../components/ErrorMessage';
import { supabase } from '../../services/supabase';
import { ConversationSkeleton } from '../../components/skeletons/ConversationSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { FadeIn } from '../../components/animated/FadeIn';
import { ScaleButton } from '../../components/animated/ScaleButton';

type ConversationsCacheEntry = {
  conversations: Conversation[];
  timestamp: number;
};

type MessagingIdentityCacheEntry = {
  studentId: string | null;
  teacherId: string | null;
  userType: 'student' | 'teacher';
};

const CONVERSATIONS_CACHE_MS = 60_000;
const conversationsCache = new Map<string, ConversationsCacheEntry>();
const messagingIdentityCache = new Map<string, MessagingIdentityCacheEntry>();

export const ConversationsListScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const cachedIdentity = user?.id ? messagingIdentityCache.get(user.id) : undefined;
  const cachedOwnerId = cachedIdentity?.studentId || cachedIdentity?.teacherId;
  const cachedConversationEntry = cachedIdentity && cachedOwnerId
    ? conversationsCache.get(`${cachedIdentity.userType}:${cachedOwnerId}`)
    : undefined;

  const [conversations, setConversations] = useState<Conversation[]>(cachedConversationEntry?.conversations ?? []);
  const [loading, setLoading] = useState(!cachedConversationEntry);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(cachedIdentity?.studentId ?? null);
  const [teacherId, setTeacherId] = useState<string | null>(cachedIdentity?.teacherId ?? null);
  const [userType, setUserType] = useState<'student' | 'teacher' | null>(cachedIdentity?.userType ?? null);

  const ownerId = studentId || teacherId;

  const loadUserInfo = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentData) {
        setStudentId(studentData.id);
        setTeacherId(null);
        setUserType('student');
        messagingIdentityCache.set(user.id, {
          studentId: studentData.id,
          teacherId: null,
          userType: 'student',
        });
        return;
      }

      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (teacherData) {
        setTeacherId(teacherData.id);
        setStudentId(null);
        setUserType('teacher');
        messagingIdentityCache.set(user.id, {
          studentId: null,
          teacherId: teacherData.id,
          userType: 'teacher',
        });
      }
    } catch (error) {
      console.error('Error loading messaging user info:', error);
    }
  }, [user?.id]);

  const loadConversations = useCallback(async (
    options: { silent?: boolean; force?: boolean } = {}
  ) => {
    const { silent = false, force = false } = options;
    const cacheKey = ownerId && userType ? `${userType}:${ownerId}` : null;
    const cached = cacheKey ? conversationsCache.get(cacheKey) : undefined;
    const hasFreshCache = cached && Date.now() - cached.timestamp < CONVERSATIONS_CACHE_MS;

    if (!force && hasFreshCache) {
      setConversations(cached.conversations);
      setError(null);
      setLoading(false);
      void loadConversations({ silent: true, force: true });
      return;
    }

    try {
      if (!silent && !cached) {
        setLoading(true);
      }
      if (!silent || !cached) {
        setError(null);
      }

      let result;
      if (studentId) {
        result = await messagingService.getStudentConversations(studentId);
      } else if (teacherId) {
        result = await messagingService.getTeacherConversations(teacherId);
      } else {
        setLoading(false);
        return;
      }

      if (result.error) {
        if (!silent || !cached) {
          setError(t('messaging.conversations.failedToLoad'));
        }
        return;
      }

      if (cacheKey) {
        conversationsCache.set(cacheKey, {
          conversations: result.conversations,
          timestamp: Date.now(),
        });
      }
      setConversations(result.conversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      if (!silent || !cached) {
        setError(t('messaging.conversations.failedToLoad'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerId, studentId, t, teacherId, userType]);

  useEffect(() => {
    void loadUserInfo();
  }, [loadUserInfo]);

  useEffect(() => {
    if (ownerId && userType) {
      void loadConversations();
    }
  }, [loadConversations, ownerId, userType]);

  useAllConversations(
    ownerId,
    () => {
      void loadConversations({ silent: true, force: true });
      void useMessagingStore.getState().loadUnreadCount();
    },
    userType || 'student',
    !!ownerId && !!userType
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadConversations({ silent: true, force: true });
  };

  const handleConversationPress = useCallback((conversation: Conversation) => {
    (navigation as any).navigate('Chat', {
      conversationId: conversation.id,
      otherUser: userType === 'student' ? conversation.teacher : conversation.student,
    });
  }, [navigation, userType]);

  const formatTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('messaging.chat.justNow');
    if (diffMins < 60) return t('messaging.chat.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('messaging.chat.hoursAgo', { count: diffHours });
    if (diffDays === 1) return t('messaging.chat.yesterday');

    return formatShortDate(date, t('common.locale'));
  }, [t]);

  const renderConversation = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    const otherUser = userType === 'student' ? item.teacher : item.student;
    const unreadCount = userType === 'student'
      ? item.unread_count_student
      : item.unread_count_teacher;

    const lastMessage = item.last_message
      ? item.last_message === '📷 Photo'
        ? t('messaging.chat.filePhoto')
        : item.last_message === '📄 PDF'
          ? t('messaging.chat.filePdf')
          : item.last_message === '📎 File'
            ? t('messaging.chat.fileAttachment')
            : item.last_message
      : t('messaging.conversations.noMessages');

    return (
      <FadeIn delay={index * 30} duration={250}>
        <ScaleButton
          style={[styles.conversationCard, { backgroundColor: colors.card }]}
          onPress={() => handleConversationPress(item)}
          scaleValue={0.98}
        >
          <View style={styles.avatarContainer}>
            {otherUser?.profiles?.avatar_url ? (
              <Image
                source={{ uri: otherUser.profiles.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="person" size={24} color={colors.primary} />
              </View>
            )}
            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]} />
            )}
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.headerRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {otherUser?.profiles?.full_name || t('common.unknown', 'Unknown User')}
              </Text>
              {item.last_message_at && (
                <Text style={[styles.time, { color: colors.textSecondary }]}>
                  {formatTime(item.last_message_at)}
                </Text>
              )}
            </View>

            <Text
              style={[
                styles.lastMessage,
                { color: colors.textSecondary },
                unreadCount > 0 && styles.unreadMessage,
              ]}
              numberOfLines={1}
            >
              {lastMessage}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </ScaleButton>
      </FadeIn>
    );
  }, [colors, formatTime, handleConversationPress, t, userType]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={{ padding: spacing.md }}>
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
          <ConversationSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ErrorMessage message={error} onRetry={() => loadConversations({ force: true })} />
      </SafeAreaView>
    );
  }

  if (conversations.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <EmptyState
          icon="chatbubbles-outline"
          title={t('messaging.conversations.noConversations')}
          description={t('messaging.conversations.noConversationsDesc')}
          actionLabel={userType === 'student' ? t('messaging.conversations.findTeachers') : undefined}
          onAction={userType === 'student' ? () => {
            navigation.dispatch(
              CommonActions.navigate({
                name: 'Main',
                params: {
                  screen: 'Teachers',
                  params: { screen: 'TeachersList' },
                },
              })
            );
          } : undefined}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={15}
        windowSize={7}
        initialNumToRender={15}
        updateCellsBatchingPeriod={50}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  contentContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
    marginLeft: spacing.xs,
  },
  lastMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  unreadMessage: {
    fontWeight: '600',
  },
});
