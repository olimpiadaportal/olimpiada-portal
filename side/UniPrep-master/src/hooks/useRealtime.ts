/**
 * useRealtime Hook
 * Stage 10 - Phase 2.3: Real-time Sync
 * 
 * React hooks for easy real-time subscriptions.
 * Automatically handles subscription/unsubscription on mount/unmount.
 */

import { useEffect, useCallback, useRef } from 'react';
import { realtimeService } from '../services/realtimeService';

/**
 * Subscribe to booking updates
 */
export function useBookingUpdates(
  studentId: string | null,
  onUpdate: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!studentId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToBookings(
      studentId,
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [studentId, enabled]);
}

/**
 * Subscribe to teacher booking updates
 */
export function useTeacherBookingUpdates(
  teacherId: string | null,
  onUpdate: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!teacherId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToTeacherBookings(
      teacherId,
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [teacherId, enabled]);
}

/**
 * Subscribe to profile updates
 */
export function useProfileUpdates(
  userId: string | null,
  onUpdate: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToProfile(
      userId,
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [userId, enabled]);
}

/**
 * Subscribe to conversation updates
 */
export function useConversationUpdates(
  conversationId: string | null,
  onUpdate: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!conversationId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToConversation(
      conversationId,
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [conversationId, enabled]);
}

/**
 * Subscribe to new messages in a conversation
 */
export function useMessageUpdates(
  conversationId: string | null,
  onNewMessage: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onNewMessage);
  callbackRef.current = onNewMessage;

  useEffect(() => {
    if (!conversationId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToMessages(
      conversationId,
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [conversationId, enabled]);
}

/**
 * Subscribe to all conversations for a user (student or teacher)
 */
export function useAllConversations(
  userId: string | null,
  onUpdate: (payload: any) => void,
  userType: 'student' | 'teacher' = 'student',
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = realtimeService.subscribeToAllConversations(
      userId,
      (payload) => callbackRef.current(payload),
      userType
    );

    return unsubscribe;
  }, [userId, userType, enabled]);
}

/**
 * Subscribe to exam updates
 */
export function useExamUpdates(
  onUpdate: (payload: any) => void,
  enabled: boolean = true
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = realtimeService.subscribeToExams(
      (payload) => callbackRef.current(payload)
    );

    return unsubscribe;
  }, [enabled]);
}

/**
 * Subscribe to presence (online/offline status)
 */
export function usePresence(
  roomName: string | null,
  userId: string | null,
  onJoin: (user: any) => void,
  onLeave: (user: any) => void,
  enabled: boolean = true
) {
  const onJoinRef = useRef(onJoin);
  const onLeaveRef = useRef(onLeave);
  
  onJoinRef.current = onJoin;
  onLeaveRef.current = onLeave;

  useEffect(() => {
    if (!roomName || !userId || !enabled) return;

    // Subscribe to presence
    const unsubscribe = realtimeService.subscribeToPresence(
      roomName,
      (user) => onJoinRef.current(user),
      (user) => onLeaveRef.current(user)
    );

    // Track own presence
    realtimeService.trackPresence(roomName, userId);

    return unsubscribe;
  }, [roomName, userId, enabled]);
}

/**
 * Auto-refresh data when updates occur
 * 
 * Example:
 * ```typescript
 * const { data, refetch } = useQuery(...);
 * useAutoRefresh(studentId, refetch);
 * ```
 */
export function useAutoRefresh(
  identifier: string | null,
  refetchFn: () => void,
  subscriptionType: 'bookings' | 'profile' | 'conversations' = 'bookings'
) {
  const refetchRef = useRef(refetchFn);
  refetchRef.current = refetchFn;

  useEffect(() => {
    if (!identifier) return;

    let unsubscribe: (() => void) | undefined;

    switch (subscriptionType) {
      case 'bookings':
        unsubscribe = realtimeService.subscribeToBookings(identifier, () => {
          console.log('🔄 Auto-refreshing bookings...');
          refetchRef.current();
        });
        break;
      case 'profile':
        unsubscribe = realtimeService.subscribeToProfile(identifier, () => {
          console.log('🔄 Auto-refreshing profile...');
          refetchRef.current();
        });
        break;
      case 'conversations':
        unsubscribe = realtimeService.subscribeToAllConversations(identifier, () => {
          console.log('🔄 Auto-refreshing conversations...');
          refetchRef.current();
        });
        break;
    }

    return unsubscribe;
  }, [identifier, subscriptionType]);
}
