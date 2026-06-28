/**
 * Chat Screen - Rewritten for Robust Keyboard Handling
 *
 * Uses manual keyboard height tracking instead of KeyboardAvoidingView
 * which has known issues on various devices.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { messagingService, Message } from '../../services/messagingService';
import { chatFileService } from '../../services/chatFileService';
import { FileMessageBubble } from '../../components/messages/FileMessageBubble';
import { FilePickerButton, PickedFile } from '../../components/messages/FilePickerButton';
import { useMessageUpdates, useConversationUpdates } from '../../hooks/useRealtime';
import { spacing } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { MessageSkeleton } from '../../components/skeletons/MessageSkeleton';
import { sanitizeInput } from '../../utils/validation';
import { EmptyState } from '../../components/EmptyState';
import { useAlert } from '../../components/AlertProvider';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ChatCacheEntry = {
  messages: Message[];
  isApproved: boolean;
  timestamp: number;
};

const CHAT_CACHE_MS = 60_000;
const chatCache = new Map<string, ChatCacheEntry>();

const writeChatCache = (
  conversationId: string,
  messages: Message[],
  isApproved: boolean
) => {
  chatCache.set(conversationId, {
    messages,
    isApproved,
    timestamp: Date.now(),
  });
};

type AnimatedMessageRowProps = {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
  shouldAnimate: boolean;
  reduceMotion: boolean;
  onAnimated?: () => void;
};

const AnimatedMessageRow: React.FC<AnimatedMessageRowProps> = ({
  children,
  style,
  shouldAnimate,
  reduceMotion,
  onAnimated,
}) => {
  const opacity = useRef(new Animated.Value(shouldAnimate && !reduceMotion ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(shouldAnimate && !reduceMotion ? 10 : 0)).current;

  useEffect(() => {
    if (!shouldAnimate || reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      onAnimated?.();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start(() => onAnimated?.());
  }, [opacity, translateY, shouldAnimate, reduceMotion, onAnimated]);

  return (
    <Animated.View
      style={[
        style,
        shouldAnimate && !reduceMotion
          ? { opacity, transform: [{ translateY }] }
          : null,
      ]}
    >
      {children}
    </Animated.View>
  );
};

export const ChatScreenNew = () => {
  const route = useRoute();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { showError } = useAlert();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { enabled: isFileSharingEnabled } = useFeatureFlag('chat_file_sharing');
  const reduceMotion = useReducedMotion();

  const { conversationId, otherUser } = route.params as { conversationId: string; otherUser: { id: string; name: string; avatar?: string } };
  const cachedChat = chatCache.get(conversationId);

  const [messages, setMessages] = useState<Message[]>(cachedChat?.messages ?? []);
  const [loading, setLoading] = useState(!cachedChat);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [userType, setUserType] = useState<'student' | 'teacher' | null>(null);
  const [isApproved, setIsApproved] = useState(cachedChat?.isApproved ?? false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [approvingConversation, setApprovingConversation] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendingRef = useRef(false);
  const uploadingFileRef = useRef(false);
  const approvingConversationRef = useRef(false);
  const animatedMessageIdsRef = useRef(new Set<string>());

  const markMessageForEntrance = useCallback((messageId?: string) => {
    if (messageId) {
      animatedMessageIdsRef.current.add(messageId);
    }
  }, []);

  const clearMessageEntrance = useCallback((messageId: string) => {
    animatedMessageIdsRef.current.delete(messageId);
  }, []);

  const scrollToBottom = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  // Keyboard listeners
  // Track keyboard height on both platforms for consistent behavior
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShowListener = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      const overlap = Math.max(0, windowHeight - e.endCoordinates.screenY);
      const nextKeyboardHeight = overlap > 0 ? overlap : (Platform.OS === 'ios' ? e.endCoordinates.height : 0);
      setKeyboardHeight(nextKeyboardHeight);
      setTimeout(() => scrollToBottom(true), 120);
    });

    const keyboardHideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, [scrollToBottom, windowHeight]);

  useEffect(() => {
    loadUserType();
  }, [user]);

  useEffect(() => {
    if (conversationId) {
      loadMessages();
      markAsRead();
    }
  }, [conversationId]);

  useMessageUpdates(
    conversationId,
    (payload) => {
      if (payload.eventType === 'INSERT') {
        if (payload.new.sender_id !== user?.id) {
          markMessageForEntrance(payload.new.id);
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === payload.new.id);
            if (exists) {
              clearMessageEntrance(payload.new.id);
              return prev;
            }
            const next = [...prev, payload.new];
            writeChatCache(conversationId, next, isApproved);
            return next;
          });

          setTimeout(() => scrollToBottom(true), 80);

          markAsRead();
        }
      }
    }
  );

  // When the other user reads messages, conversation unread_count updates → reliable realtime event.
  // Re-fetch read_at for all read messages to update ✓✓ ticks instantly.
  useConversationUpdates(
    conversationId,
    async (payload) => {
      if (payload.eventType === 'UPDATE') {
        const { data } = await supabase
          .from('messages')
          .select('id, read_at')
          .eq('conversation_id', conversationId)
          .not('read_at', 'is', null);

        if (data && data.length > 0) {
          const readMap = new Map<string, string>(data.map((m: { id: string; read_at: string }) => [m.id, m.read_at]));
          setMessages(prev => {
            const next = prev.map(msg =>
              readMap.has(msg.id) ? { ...msg, read_at: readMap.get(msg.id)! } : msg
            );
            writeChatCache(conversationId, next, isApproved);
            return next;
          });
        }
      }
    }
  );

  const loadUserType = async () => {
    if (!user?.id) return;

    try {
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentData) {
        setUserType('student');
        return;
      }

      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (teacherData) {
        setUserType('teacher');
      }
    } catch (error) {
      console.error('Error loading user type:', error);
    }
  };

  const loadMessages = async (options: { silent?: boolean; force?: boolean } = {}) => {
    const { silent = false, force = false } = options;
    const cached = chatCache.get(conversationId);
    const hasFreshCache = cached && Date.now() - cached.timestamp < CHAT_CACHE_MS;

    if (!force && hasFreshCache) {
      setMessages(cached.messages);
      setIsApproved(cached.isApproved);
      setLoading(false);
      void loadMessages({ silent: true, force: true });
      return;
    }

    try {
      if (!silent && !cached) {
        setLoading(true);
      }

      const { messages: loadedMessages, error } = await messagingService.getMessages(conversationId);

      if (error) {
        console.error('Error loading messages:', error);
      }

      let approved = cached?.isApproved ?? false;
      const { data: conversation } = await supabase
        .from('conversations')
        .select('is_approved')
        .eq('id', conversationId)
        .single();

      if (conversation) {
        approved = conversation.is_approved || false;
      }

      setMessages(loadedMessages);
      setIsApproved(approved);
      writeChatCache(conversationId, loadedMessages, approved);
    } catch (error) {
      console.error('Exception loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user?.id || !conversationId) return;

    try {
      await messagingService.markMessagesAsRead(conversationId, user.id);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const handleApproveConversation = useCallback(async () => {
    if (approvingConversationRef.current || approvingConversation) return;

    approvingConversationRef.current = true;
    setApprovingConversation(true);
    try {
      const { success, error } = await messagingService.approveConversation(conversationId);

      if (success) {
        setIsApproved(true);
        writeChatCache(conversationId, messages, true);
        // Notification will be sent automatically by SQL trigger
      } else {
        showError(t('common.error'), error?.message || 'Failed to approve conversation');
      }
    } catch (error) {
      showError(t('common.error'), 'Failed to approve conversation');
    } finally {
      approvingConversationRef.current = false;
      setApprovingConversation(false);
    }
  }, [conversationId, approvingConversation, messages, t, showError]);

  const handleFilePicked = useCallback(async (picked: PickedFile) => {
    if (!user?.id || !userType || uploadingFileRef.current || uploadingFile) return;
    uploadingFileRef.current = true;
    setUploadingFile(true);
    try {
      const { file, error } = await chatFileService.uploadFile(
        conversationId,
        user.id,
        picked.uri,
        picked.name,
        picked.mimeType
      );
      if (error || !file) {
        showError(t('common.error'), error || t('messaging.chat.failedToSend'));
        return;
      }
      const { message, error: sendError } = await messagingService.sendMessage(
        conversationId,
        user.id,
        userType,
        '',
        { url: file.storagePath, name: file.name, type: file.type, sizeBytes: file.sizeBytes }
      );
      // Patch the local message to use the signed URL for immediate display
      // (DB stores storagePath; UI needs the signed URL right now)
      if (message) {
        (message as any)._signedUrl = file.url;
      }
      if (sendError || !message) {
        showError(t('common.error'), t('messaging.chat.failedToSend'));
        return;
      }
      markMessageForEntrance(message.id);
      setMessages(prev => {
        const exists = prev.some(m => m.id === message.id);
        if (exists) return prev;
        const next = [...prev, message];
        writeChatCache(conversationId, next, isApproved);
        return next;
      });
      setTimeout(() => scrollToBottom(true), 80);
      if (userType === 'teacher' && !isApproved) handleApproveConversation();
    } catch (err) {
      showError(t('common.error'), t('messaging.chat.failedToSend'));
    } finally {
      uploadingFileRef.current = false;
      setUploadingFile(false);
    }
  }, [user?.id, userType, conversationId, uploadingFile, isApproved, handleApproveConversation, t, showError]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !user?.id || !userType || sendingRef.current || sending) return;

    const text = sanitizeInput(messageText.trim());

    if (!text) {
      showError(t('common.error'), 'Message contains invalid content');
      return;
    }

    const originalText = text;
    sendingRef.current = true;
    setMessageText('');
    setSending(true);

    try {
      const { message, error } = await messagingService.sendMessage(
        conversationId,
        user.id,
        userType,
        originalText
      );

      if (error) {
        setMessageText(originalText);
        showError(
          t('messaging.chat.cannotSend'),
          error.message || t('messaging.chat.failedToSend')
        );
        return;
      }

      if (message) {
        markMessageForEntrance(message.id);
        setMessages(prev => {
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          const next = [...prev, message];
          writeChatCache(conversationId, next, isApproved);
          return next;
        });

        setTimeout(() => scrollToBottom(true), 80);

        // Auto-approve conversation when teacher sends first message
        if (userType === 'teacher' && !isApproved) {
          handleApproveConversation();
        }
      } else {
        setMessageText(originalText);
        showError(t('common.error'), t('messaging.chat.failedToSend'));
      }
    } catch (error) {
      setMessageText(originalText);
      showError(t('common.error'), t('messaging.chat.failedToSend'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [messageText, user?.id, userType, sending, conversationId, t, showError, isApproved, handleApproveConversation]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (timestamp: string): string => {
    const msgDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(msgDate, today)) return t('messaging.chat.today');
    if (isSameDay(msgDate, yesterday)) return t('messaging.chat.yesterday');

    // Use translation-key month names for reliable az/en/ru rendering on all Android versions.
    // toLocaleDateString is unreliable on Android (Intl support varies by device/OS).
    const months: string[] = t('messaging.chat.months', { returnObjects: true }) as string[];
    const monthName = Array.isArray(months) ? (months[msgDate.getMonth()] ?? '') : '';
    return t('messaging.chat.dateFormat', {
      day: msgDate.getDate(),
      month: monthName,
      year: msgDate.getFullYear(),
    });
  };

  type ListItem =
    | { type: 'message'; data: Message }
    | { type: 'separator'; label: string; key: string };

  const buildListItems = (msgs: Message[]): ListItem[] => {
    const items: ListItem[] = [];
    let lastDateKey = '';
    for (const msg of msgs) {
      const d = new Date(msg.created_at);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        items.push({ type: 'separator', label: formatDateSeparator(msg.created_at), key: `sep-${dateKey}` });
      }
      items.push({ type: 'message', data: msg });
    }
    return items;
  };

  const listItems = useMemo(() => buildListItems(messages), [messages, t]);
  const displayListItems = useMemo(() => [...listItems].reverse(), [listItems]);

  const renderDateSeparator = (label: string) => (
    <View style={styles.dateSeparatorContainer}>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.dateSeparatorText, { color: colors.textSecondary, backgroundColor: colors.background }]}>
        {label}
      </Text>
      <View style={[styles.dateSeparatorLine, { backgroundColor: colors.border }]} />
    </View>
  );

  const renderListItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'separator') {
      return renderDateSeparator(item.label);
    }
    return renderMessage({ item: item.data });
  }, [colors, user?.id]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const isFileMessage = !!item.file_url;

    return (
      <AnimatedMessageRow
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer,
        ]}
        shouldAnimate={animatedMessageIdsRef.current.has(item.id)}
        reduceMotion={reduceMotion}
        onAnimated={() => clearMessageEntrance(item.id)}
      >
        {isFileMessage ? (
          <FileMessageBubble
            fileUrl={item.file_url!}
            fileName={item.file_name || 'File'}
            fileType={item.file_type || 'document'}
            fileSizeBytes={item.file_size_bytes ?? undefined}
            isOwnMessage={isOwnMessage}
            createdAt={item.created_at}
            readAt={item.read_at}
          />
        ) : (
          <View
            style={[
              styles.messageBubble,
              isOwnMessage
                ? [styles.ownMessageBubble, { backgroundColor: colors.primary }]
                : [styles.otherMessageBubble, { backgroundColor: colors.card }],
            ]}
          >
            <Text
              style={[
                styles.messageText,
                { color: isOwnMessage ? '#FFFFFF' : colors.text },
              ]}
            >
              {item.content}
            </Text>
            <View style={styles.messageFooter}>
              <Text
                style={[
                  styles.messageTime,
                  { color: isOwnMessage ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
                ]}
              >
                {formatTime(item.created_at)}
              </Text>
              {isOwnMessage && (
                <Ionicons
                  name={item.read_at ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.read_at ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'}
                  style={styles.readReceipt}
                />
              )}
            </View>
          </View>
        )}
      </AnimatedMessageRow>
    );
  }, [user?.id, colors, reduceMotion, clearMessageEntrance]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: (otherUser as any)?.profiles?.full_name || otherUser?.name || t('messaging.chat.title'),
      headerShown: true,
    });
  }, [otherUser, navigation, t]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.skeletonContainer}>
          <MessageSkeleton isOwnMessage={false} />
          <MessageSkeleton isOwnMessage={true} />
          <MessageSkeleton isOwnMessage={false} />
          <MessageSkeleton isOwnMessage={true} />
          <MessageSkeleton isOwnMessage={false} />
        </View>
      </View>
    );
  }

  const bottomPadding = keyboardVisible
    ? Math.max(keyboardHeight + spacing.xs, spacing.sm)
    : Math.max(insets.bottom, spacing.sm);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Note: Inquiry banner removed - booking-based approval now handles messaging restrictions */}

      <FlatList
        ref={flatListRef}
        data={displayListItems}
        renderItem={renderListItem}
        keyExtractor={(item) => item.type === 'separator' ? item.key : item.data.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        inverted={displayListItems.length > 0}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title={t('messaging.chat.noMessages')}
            description={t('messaging.chat.startConversation')}
          />
        }
      />

      <View style={[
        styles.inputContainer,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: bottomPadding,
        }
      ]}>
        {isFileSharingEnabled && (
          <FilePickerButton
            onFilePicked={handleFilePicked}
            disabled={sending || uploadingFile}
          />
        )}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.card,
            }
          ]}
          placeholder={t('messaging.chat.typeMessage')}
          placeholderTextColor={colors.textSecondary}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={1000}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: (!messageText.trim() && !uploadingFile) || sending ? colors.border : colors.primary }
          ]}
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
        >
          {sending || uploadingFile ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'flex-end',
  },
  messagesList: {
    padding: spacing.md,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: spacing.sm,
    maxWidth: '80%',
  },
  ownMessageContainer: {
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  ownMessageBubble: {
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  readReceipt: {
    marginLeft: 2,
  },
  dateSeparatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: '500',
    paddingHorizontal: 10,
    letterSpacing: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginRight: spacing.sm,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChatScreenNew;
