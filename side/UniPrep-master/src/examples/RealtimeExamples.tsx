/**
 * Real-time Integration Examples
 * Stage 10 - Phase 2.3
 * 
 * Shows how to use real-time subscriptions in your components
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useBookingUpdates, useMessageUpdates, usePresence } from '../hooks/useRealtime';
import { realtimeService } from '../services/realtimeService';

/**
 * EXAMPLE 1: Bookings Screen with Real-time Updates
 */
export function BookingsScreenExample() {
  const [bookings, setBookings] = useState([]);
  const studentId = 'your-student-id'; // Get from auth context

  // Load initial bookings
  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    // Fetch bookings from database
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', studentId);
    
    setBookings(data || []);
  };

  // Subscribe to real-time updates
  useBookingUpdates(
    studentId,
    (payload) => {
      console.log('Booking update:', payload);
      
      switch (payload.eventType) {
        case 'INSERT':
          // New booking added
          setBookings(prev => [...prev, payload.new]);
          break;
        case 'UPDATE':
          // Booking updated
          setBookings(prev =>
            prev.map(b => b.id === payload.new.id ? payload.new : b)
          );
          break;
        case 'DELETE':
          // Booking deleted
          setBookings(prev =>
            prev.filter(b => b.id !== payload.old.id)
          );
          break;
      }
    }
  );

  return (
    <View>
      <Text>My Bookings (Real-time)</Text>
      <FlatList
        data={bookings}
        renderItem={({ item }) => (
          <View>
            <Text>{item.teacher_name}</Text>
            <Text>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

/**
 * EXAMPLE 2: Chat Screen with Real-time Messages
 */
export function ChatScreenExample({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState([]);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    setMessages(data || []);
  };

  // Subscribe to new messages
  useMessageUpdates(
    conversationId,
    (payload) => {
      console.log('New message:', payload);
      
      if (payload.eventType === 'INSERT') {
        setMessages(prev => [...prev, payload.new]);
        
        // Scroll to bottom
        // Auto-mark as read
      }
    }
  );

  return (
    <View>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <View>
            <Text>{item.content}</Text>
          </View>
        )}
      />
    </View>
  );
}

/**
 * EXAMPLE 3: Profile Screen with Real-time Updates
 */
export function ProfileScreenExample() {
  const [profile, setProfile] = useState(null);
  const userId = 'your-user-id'; // Get from auth context

  // Load initial profile
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    setProfile(data);
  };

  // Subscribe to profile updates
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = realtimeService.subscribeToProfile(
      userId,
      (payload) => {
        console.log('Profile updated:', payload);
        
        if (payload.eventType === 'UPDATE') {
          setProfile(payload.new);
        }
      }
    );

    return unsubscribe;
  }, [userId]);

  return (
    <View>
      <Text>{profile?.full_name}</Text>
      <Text>{profile?.bio}</Text>
    </View>
  );
}

/**
 * EXAMPLE 4: Conversations List with Real-time Updates
 */
export function ConversationsListExample() {
  const [conversations, setConversations] = useState([]);
  const studentId = 'your-student-id';

  // Load initial conversations
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*, teacher:teachers(*)')
      .eq('student_id', studentId)
      .order('last_message_at', { ascending: false });
    
    setConversations(data || []);
  };

  // Subscribe to conversation updates
  useEffect(() => {
    if (!studentId) return;

    const unsubscribe = realtimeService.subscribeToAllConversations(
      studentId,
      (payload) => {
        console.log('Conversation update:', payload);
        
        switch (payload.eventType) {
          case 'INSERT':
            // New conversation
            loadConversations(); // Reload to get teacher data
            break;
          case 'UPDATE':
            // Conversation updated (new message, unread count)
            setConversations(prev =>
              prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
            );
            break;
        }
      }
    );

    return unsubscribe;
  }, [studentId]);

  return (
    <View>
      <Text>Conversations (Real-time)</Text>
      <FlatList
        data={conversations}
        renderItem={({ item }) => (
          <View>
            <Text>{item.teacher.full_name}</Text>
            <Text>{item.last_message}</Text>
            {item.unread_count_student > 0 && (
              <Text>({item.unread_count_student} unread)</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

/**
 * EXAMPLE 5: Online Status with Presence
 */
export function ChatWithPresenceExample({ conversationId, userId }: any) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  // Subscribe to presence
  usePresence(
    `chat:${conversationId}`,
    userId,
    (user) => {
      // User joined
      console.log('User joined:', user);
      setOnlineUsers(prev => [...prev, user.user_id]);
    },
    (user) => {
      // User left
      console.log('User left:', user);
      setOnlineUsers(prev => prev.filter(id => id !== user.user_id));
    }
  );

  return (
    <View>
      <Text>Online: {onlineUsers.length}</Text>
      {/* Show typing indicator if other user is online */}
    </View>
  );
}

/**
 * EXAMPLE 6: Manual Subscription (Advanced)
 */
export function ManualSubscriptionExample() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Subscribe
    const unsubscribe = realtimeService.subscribeToBookings(
      'student-id',
      (payload) => {
        console.log('Update:', payload);
        setData(payload.new);
      }
    );

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return <View>{/* Your UI */}</View>;
}

/**
 * EXAMPLE 7: Multiple Subscriptions
 */
export function MultipleSubscriptionsExample() {
  const studentId = 'your-student-id';

  useEffect(() => {
    // Subscribe to bookings
    const unsubBookings = realtimeService.subscribeToBookings(
      studentId,
      (payload) => console.log('Booking:', payload)
    );

    // Subscribe to profile
    const unsubProfile = realtimeService.subscribeToProfile(
      studentId,
      (payload) => console.log('Profile:', payload)
    );

    // Subscribe to conversations
    const unsubConversations = realtimeService.subscribeToAllConversations(
      studentId,
      (payload) => console.log('Conversation:', payload)
    );

    // Cleanup all subscriptions
    return () => {
      unsubBookings();
      unsubProfile();
      unsubConversations();
    };
  }, [studentId]);

  return <View>{/* Your UI */}</View>;
}

/**
 * EXAMPLE 8: Conditional Subscription
 */
export function ConditionalSubscriptionExample() {
  const [enabled, setEnabled] = useState(true);
  const studentId = 'your-student-id';

  // Only subscribe when enabled
  useBookingUpdates(
    studentId,
    (payload) => console.log('Update:', payload),
    enabled // Pass enabled flag
  );

  return (
    <View>
      <Button 
        title={enabled ? 'Disable Real-time' : 'Enable Real-time'}
        onPress={() => setEnabled(!enabled)}
      />
    </View>
  );
}
