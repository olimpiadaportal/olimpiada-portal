/**
 * Messaging Store
 * Global state management for messaging with real-time updates
 * 
 * Industry Standard: Keep subscriptions active at app level
 * Used by Instagram, WhatsApp, Messenger, etc.
 */

import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { realtimeService } from '../services/realtimeService';

interface MessagingState {
  // Unread counts
  unreadCount: number;
  
  // User info
  userId: string | null;
  userType: 'student' | 'teacher' | null;
  
  // Subscription status
  isSubscribed: boolean;
  
  // Actions
  initialize: (userId: string, userType: 'student' | 'teacher') => void;
  loadUnreadCount: () => Promise<void>;
  cleanup: () => void;
}

let unsubscribeFromConversations: (() => void) | null = null;

export const useMessagingStore = create<MessagingState>((set, get) => ({
  unreadCount: 0,
  userId: null,
  userType: null,
  isSubscribed: false,

  initialize: (userId: string, userType: 'student' | 'teacher') => {
    const state = get();
    
    // Clean up existing subscription if any
    if (unsubscribeFromConversations) {
      console.log('🧹 Cleaning up existing global subscription');
      unsubscribeFromConversations();
      unsubscribeFromConversations = null;
    }

    console.log('💬 Initializing messaging store:', { userId, userType });

    set({ userId, userType });

    // Load initial unread count
    get().loadUnreadCount();

    // Subscribe to real-time updates (using GLOBAL prefix to avoid conflicts)
    console.log('📡 Creating global subscription for:', { userId, userType });
    
    // SIMPLE TEST: Just log when ANY event happens
    const handleConversationUpdate = (payload: any) => {
      console.log('🚨🚨🚨 GLOBAL CALLBACK FIRED! 🚨🚨🚨');
      console.log('Event type:', payload?.eventType || 'unknown');
      console.log('Payload:', payload);
      
      // Reload unread count
      try {
        const currentState = useMessagingStore.getState();
        console.log('Current unread count:', currentState.unreadCount);
        currentState.loadUnreadCount();
      } catch (err) {
        console.error('Error in callback:', err);
      }
    };
    
    console.log('📡 About to call subscribeToGlobalConversations...');
    unsubscribeFromConversations = realtimeService.subscribeToGlobalConversations(
      userId,
      handleConversationUpdate,
      userType
    );
    console.log('📡 Returned from subscribeToGlobalConversations');
    
    console.log('✅ Global subscription created, unsubscribe function:', !!unsubscribeFromConversations);
    set({ isSubscribed: true });
  },

  loadUnreadCount: async () => {
    const { userId, userType } = get();
    if (!userId || !userType) return;

    try {
      console.log('🔄 Loading unread count (global):', { userId, userType });

      const { data: conversations } = await supabase
        .from('conversations')
        .select(userType === 'student' ? 'unread_count_student' : 'unread_count_teacher')
        .eq(userType === 'student' ? 'student_id' : 'teacher_id', userId);

      if (conversations) {
        // Count conversations with at least 1 unread message
        const count = conversations.filter(conv => {
          if (userType === 'student') {
            return ((conv as { unread_count_student?: number }).unread_count_student || 0) > 0;
          } else {
            return ((conv as { unread_count_teacher?: number }).unread_count_teacher || 0) > 0;
          }
        }).length;
        
        set({ unreadCount: count });
        console.log('✅ Unread count updated (global):', count);
      }
    } catch (error) {
      console.error('Error loading unread count (global):', error);
    }
  },

  cleanup: () => {
    console.log('💬 Cleaning up messaging store');
    
    if (unsubscribeFromConversations) {
      unsubscribeFromConversations();
      unsubscribeFromConversations = null;
    }

    set({
      unreadCount: 0,
      userId: null,
      userType: null,
      isSubscribed: false,
    });
  },
}));
