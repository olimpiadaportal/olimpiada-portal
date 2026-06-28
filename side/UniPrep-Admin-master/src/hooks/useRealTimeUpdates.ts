import { useEffect, useRef } from 'react';

/**
 * Real-time Updates Hook
 * Polls for data updates at specified intervals
 * Pauses when user is interacting with modals or forms
 * Stage 5.5 - Phase 2
 */

interface UseRealTimeUpdatesOptions {
  enabled?: boolean;
  interval?: number; // milliseconds
  onUpdate: () => void | Promise<void>;
  pauseWhenModalOpen?: boolean; // Pause updates when modal is open
}

export function useRealTimeUpdates({
  enabled = true,
  interval = 30000, // 30 seconds default
  onUpdate,
  pauseWhenModalOpen = true,
}: UseRealTimeUpdatesOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const update = async () => {
      if (isUpdatingRef.current) return;
      
      // Check if any modal is open (by checking for modal backdrop)
      if (pauseWhenModalOpen) {
        const hasOpenModal = document.querySelector('[role="dialog"], .modal-open, [data-modal-open="true"]');
        if (hasOpenModal) {
          return; // Skip this update cycle
        }
      }
      
      isUpdatingRef.current = true;
      try {
        await onUpdate();
      } catch (error) {
        console.error('Real-time update error:', error);
      } finally {
        isUpdatingRef.current = false;
      }
    };

    // Start polling
    intervalRef.current = setInterval(update, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, onUpdate, pauseWhenModalOpen]);

  // Manual refresh function
  const refresh = async () => {
    if (isUpdatingRef.current) return;
    await onUpdate();
  };

  return { refresh };
}
