/**
 * useNotificationRealtime Hook
 * Phase 2: Event-Driven Notifications
 * 
 * React hook to manage real-time notification subscription.
 * Automatically subscribes/unsubscribes based on user authentication.
 */

import { useEffect } from 'react';
import { notificationRealtimeService } from '../services/notificationRealtimeService';

export function useNotificationRealtime(userId: string | null) {
  useEffect(() => {
    if (!userId) {
      // Unsubscribe if no user
      notificationRealtimeService.unsubscribe();
      return;
    }

    // Subscribe to real-time notifications
    notificationRealtimeService.subscribe(userId);

    // Cleanup on unmount or user change
    return () => {
      notificationRealtimeService.unsubscribe();
    };
  }, [userId]);

  return {
    isActive: notificationRealtimeService.isActive(),
  };
}
