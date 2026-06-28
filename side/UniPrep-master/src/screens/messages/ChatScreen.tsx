/**
 * Chat Screen
 * Stage 10 - Phase 2.4: Basic Messaging System
 * 
 * One-on-one chat between student and teacher.
 * Features:
 * - Real-time message delivery
 * - Message bubbles (sent/received)
 * - Auto-scroll to bottom
 * - Mark messages as read
 * - Send messages
 * - Loading states
 */

import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { messagingService, Message } from '../../services/messagingService';
import { useMessageUpdates, useConversationUpdates } from '../../hooks/useRealtime';
import { spacing } from '../../constants/theme';
import { supabase } from '../../services/supabase';
import { MessageSkeleton } from '../../components/skeletons/MessageSkeleton';
import { sanitizeInput } from '../../utils/validation';
import { EmptyState } from '../../components/EmptyState';
import { useAlert } from '../../components/AlertProvider';

export const ChatScreen = () => {
  const route = useRoute();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { showError } = useAlert();
  
  const { conversationId, otherUser } = route.params as { conversationId: string; otherUser: { id: string; name: string; avatar?: string } };
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [userType, setUserType] = useState<'student' | 'teacher' | null>(null);
  const [isApproved, setIsApproved] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Load user type
  useEffect(() => {
    loadUserType();
  }, [user]);

  // Load messages
  useEffect(() => {
    if (conversationId) {
      loadMessages();
      markAsRead();
    }
  }, [conversationId]);

  // Subscribe to new messages (INSERT only)
  useMessageUpdates(
    conversationId,
    (payload) => {
      if (payload.eventType === 'INSERT') {
        // Only add if from another user (avoid duplicates from own optimistic update)
        if (payload.new.sender_id !== user?.id) {
          setMessages(prev => {
            // Double-check it doesn't exist
            const exists = prev.some(msg => msg.id === payload.new.id);
            if (exists) {
              console.log('Message already exists, skipping:', payload.new.id);
              return prev;
            }
            return [...prev, payload.new];
          });
          
          // Auto-scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);

          // Mark as read
          markAsRead();
        }
      }
    }
  );

  // Subscribe to conversation updates to refresh read receipts in real-time.
  // When the other user marks messages as read, the conversation's unread_count
  // changes, firing a reliable UPDATE event. We then re-fetch read_at for own messages.
  useConversationUpdates(
    conversationId,
    async (payload) => {
      if (payload.eventType === 'UPDATE') {
        // Fetch updated read_at values for all messages in this conversation
        const { data } = await supabase
          .from('messages')
          .select('id, read_at')
          .eq('conversation_id', conversationId)
          .not('read_at', 'is', null);

        if (data && data.length > 0) {
          const readMap = new Map(data.map((m: { id: string; read_at: string }) => [m.id, m.read_at]));
          setMessages(prev =>
            prev.map(msg =>
              readMap.has(msg.id) ? { ...msg, read_at: readMap.get(msg.id)! } : msg
            )
          );
        }
      }
    }
  );

  const loadUserType = async () => {
    if (!user?.id) return;

    try {
      // Check if student
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentData) {
        setUserType('student');
        return;
      }

      // Check if teacher
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

  const loadMessages = async () => {
    try {
      console.log('💬 [ChatScreen] Loading messages for conversation:', conversationId);
      const { messages: loadedMessages, error } = await messagingService.getMessages(conversationId);
      
      if (error) {
        console.error('❌ [ChatScreen] Error loading messages:', error);
      }
      
      console.log('💬 [ChatScreen] Loaded', loadedMessages.length, 'messages');
      setMessages(loadedMessages);
      
      // Check approval status and message count
      const { data: conversation } = await supabase
        .from('conversations')
        .select('is_approved')
        .eq('id', conversationId)
        .single();
      
      if (conversation) {
        setIsApproved(conversation.is_approved || false);
      }
      
      // Scroll to bottom after loading
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    } catch (error) {
      console.error('❌ [ChatScreen] Exception loading messages:', error);
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

  const handleSend = async () => {
    if (!messageText.trim() || !user?.id || !userType || sending) return;

    // Sanitize input before sending
    const text = sanitizeInput(messageText.trim());
    
    if (!text) {
      showError(t('common.error'), 'Message contains invalid content');
      return;
    }

    // Store text before clearing
    const originalText = text;
    setMessageText('');
    setSending(true);

    try {
      console.log('📤 Attempting to send message...');
      
      const { message, error } = await messagingService.sendMessage(
        conversationId,
        user.id,
        userType,
        originalText
      );

      if (error) {
        // Restore message on error
        setMessageText(originalText);
        
        // Show error alert
        showError(
          t('messaging.chat.cannotSend'),
          error.message || t('messaging.chat.failedToSend')
        );
        
        console.error('❌ Error sending message:', error);
        return;
      }

      // Add message to state only if successfully saved
      if (message) {
        console.log('✅ Message saved, adding to UI:', message.id);
        setMessages(prev => {
          // Prevent duplicates
          const exists = prev.some(m => m.id === message.id);
          if (exists) {
            console.log('Message already exists in state, skipping');
            return prev;
          }
          return [...prev, message];
        });
        
        // Auto-scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
        
        } else {
        // No message returned but no error - this shouldn't happen
        console.error('❌ No message returned but no error');
        setMessageText(originalText);
        showError(t('common.error'), t('messaging.chat.failedToSend'));
      }
    } catch (error) {
      // Restore message on error
      setMessageText(originalText);
      console.error('❌ Exception sending message:', error);
      showError(t('common.error'), t('messaging.chat.failedToSend'));
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.sender_id === user?.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer,
        ]}
      >
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
                { color: isOwnMessage ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {formatTime(item.created_at)}
            </Text>
            {isOwnMessage && (
              <Ionicons
                name={item.read_at ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={item.read_at ? '#A5F3FC' : 'rgba(255,255,255,0.7)'}
                style={styles.readTick}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      headerTitle: otherUser?.name || t('messaging.chat.title'),
      headerShown: true,
    });
  }, [otherUser]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.skeletonContainer}>
          <MessageSkeleton isOwnMessage={false} />
          <MessageSkeleton isOwnMessage={true} />
          <MessageSkeleton isOwnMessage={false} />
          <MessageSkeleton isOwnMessage={true} />
          <MessageSkeleton isOwnMessage={false} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : insets.bottom}
      >
      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="always"
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No Messages Yet"
            description="Start the conversation by sending a message"
          />
        }
      />

      {/* Input Area */}
      <View style={[styles.inputContainer, { backgroundColor: colors.background, paddingBottom: Math.max(spacing.md, insets.bottom) }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={t('messaging.chat.typeMessage')}
          placeholderTextColor={colors.textSecondary}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: !messageText.trim() || sending ? colors.border : colors.primary }
          ]}
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 16,
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
    marginBottom: 4,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  messageTime: {
    fontSize: 11,
    opacity: 0.7,
  },
  readTick: {
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    marginRight: spacing.sm,
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  skeletonContainer: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'flex-end',
  },
});
