/**
 * Realtime Service
 * Stage 10 - Phase 2.3: Real-time Sync
 * 
 * Manages Supabase Realtime subscriptions for live updates.
 * Features:
 * - Booking status updates
 * - Profile updates
 * - Message updates
 * - Conversation updates
 * - Auto-refresh UI
 * - Connection management
 */

import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeCallback = (payload: any) => void;

class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();

  /**
   * Subscribe to booking updates for a student
   */
  subscribeToBookings(studentId: string, callback: RealtimeCallback): () => void {
    const channelName = `bookings:${studentId}`;
    
    console.log('📡 Subscribing to bookings:', studentId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'bookings',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          console.log('📬 Booking update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Booking subscription status:', status);
      });

    this.channels.set(channelName, channel);

    // Return unsubscribe function
    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to booking updates for a teacher
   */
  subscribeToTeacherBookings(teacherId: string, callback: RealtimeCallback): () => void {
    const channelName = `teacher-bookings:${teacherId}`;
    
    console.log('📡 Subscribing to teacher bookings:', teacherId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `teacher_id=eq.${teacherId}`,
        },
        (payload) => {
          console.log('📬 Teacher booking update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Teacher booking subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to profile updates
   */
  subscribeToProfile(userId: string, callback: RealtimeCallback): () => void {
    const channelName = `profile:${userId}`;
    
    console.log('📡 Subscribing to profile:', userId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          console.log('📬 Profile update received');
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Profile subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to student profile updates
   */
  subscribeToStudentProfile(studentId: string, callback: RealtimeCallback): () => void {
    const channelName = `student:${studentId}`;
    
    console.log('📡 Subscribing to student profile:', studentId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'students',
          filter: `id=eq.${studentId}`,
        },
        (payload) => {
          console.log('📬 Student profile update received');
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Student subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to teacher profile updates
   */
  subscribeToTeacherProfile(teacherId: string, callback: RealtimeCallback): () => void {
    const channelName = `teacher:${teacherId}`;
    
    console.log('📡 Subscribing to teacher profile:', teacherId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teachers',
          filter: `id=eq.${teacherId}`,
        },
        (payload) => {
          console.log('📬 Teacher profile update received');
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Teacher subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to conversation updates
   */
  subscribeToConversation(conversationId: string, callback: RealtimeCallback): () => void {
    const channelName = `conversation:${conversationId}`;
    
    console.log('📡 Subscribing to conversation:', conversationId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📬 Conversation update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Conversation subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to messages in a conversation
   */
  subscribeToMessages(conversationId: string, callback: RealtimeCallback): () => void {
    const channelName = `messages:${conversationId}`;
    
    console.log('📡 Subscribing to messages:', conversationId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📬 New message received');
          callback(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📬 Message updated (read receipt)');
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Messages subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to all conversations for a user (student or teacher)
   * Used by ConversationsListScreen (screen-level)
   */
  subscribeToAllConversations(
    userId: string, 
    callback: RealtimeCallback,
    userType: 'student' | 'teacher' = 'student'
  ): () => void {
    const channelName = `all-conversations:${userId}`;
    const filterField = userType === 'student' ? 'student_id' : 'teacher_id';
    
    console.log(`📡 Subscribing to all conversations (${userType}):`, userId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `${filterField}=eq.${userId}`,
        },
        (payload) => {
          console.log('📬 Conversation list update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 All conversations subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to all conversations for a user (GLOBAL - app level)
   * Used by global messaging store - uses different channel name to avoid conflicts
   */
  subscribeToGlobalConversations(
    userId: string, 
    callback: RealtimeCallback,
    userType: 'student' | 'teacher' = 'student'
  ): () => void {
    const channelName = `global-conversations:${userId}`;  // DIFFERENT NAME!
    const filterField = userType === 'student' ? 'student_id' : 'teacher_id';
    
    console.log(`📡 Subscribing to GLOBAL conversations (${userType}):`, userId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `${filterField}=eq.${userId}`,
        },
        (payload) => {
          console.log('📬 GLOBAL conversation update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 GLOBAL conversations subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to teacher conversations
   */
  subscribeToTeacherConversations(teacherId: string, callback: RealtimeCallback): () => void {
    const channelName = `teacher-conversations:${teacherId}`;
    
    console.log('📡 Subscribing to teacher conversations:', teacherId);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `teacher_id=eq.${teacherId}`,
        },
        (payload) => {
          console.log('📬 Teacher conversation update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Teacher conversations subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to exam updates
   */
  subscribeToExams(callback: RealtimeCallback): () => void {
    const channelName = 'exams';
    
    console.log('📡 Subscribing to exams');

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exams',
        },
        (payload) => {
          console.log('📬 Exam update received:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Exams subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to presence (online/offline status)
   * Useful for showing who's online in chat
   */
  subscribeToPresence(
    roomName: string,
    onJoin: (user: any) => void,
    onLeave: (user: any) => void
  ): () => void {
    const channelName = `presence:${roomName}`;
    
    console.log('📡 Subscribing to presence:', roomName);

    const channel = supabase
      .channel(channelName)
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👋 User joined:', key);
        onJoin(newPresences[0]);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 User left:', key);
        onLeave(leftPresences[0]);
      })
      .subscribe(async (status) => {
        console.log('📡 Presence subscription status:', status);
      });

    this.channels.set(channelName, channel);

    return () => this.unsubscribe(channelName);
  }

  /**
   * Track user presence (mark as online)
   */
  async trackPresence(roomName: string, userId: string, metadata: any = {}) {
    const channelName = `presence:${roomName}`;
    const channel = this.channels.get(channelName);

    if (channel) {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...metadata,
      });
      console.log('✅ Presence tracked:', userId);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  private async unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName);
    
    if (channel) {
      await supabase.removeChannel(channel);
      this.channels.delete(channelName);
      console.log('🔌 Unsubscribed from:', channelName);
    }
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll() {
    console.log('🔌 Unsubscribing from all channels...');
    
    for (const [channelName, channel] of this.channels.entries()) {
      await supabase.removeChannel(channel);
      console.log('🔌 Unsubscribed from:', channelName);
    }
    
    this.channels.clear();
    console.log('✅ All channels unsubscribed');
  }

  /**
   * Get active channel count
   */
  getActiveChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Get active channel names
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Check if connected to a channel
   */
  isSubscribed(channelName: string): boolean {
    return this.channels.has(channelName);
  }
}

// Export singleton instance
export const realtimeService = new RealtimeService();
