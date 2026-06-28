// Offline Context
// Stage 6 - Week 3: Offline Mode Implementation
// Provides app-wide offline state management and utilities

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { networkService, NetworkState } from '../services/networkService';
import { offlineSyncService, SyncResult } from '../services/offlineSyncService';
import { offlineService } from '../services/offlineService';
import { featureFlagService } from '../services/featureFlagService';

interface OfflineContextType {
  // Network state
  isOnline: boolean;
  isOffline: boolean;
  networkStatus: 'online' | 'offline' | 'unknown';
  
  // Offline mode feature flag
  isOfflineModeEnabled: boolean;
  
  // Sync state
  pendingSessionCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  
  // Actions
  syncNow: () => Promise<SyncResult>;
  refreshNetworkStatus: () => Promise<void>;
  
  // Cached data info
  hasCachedQuestions: (subjectId: string) => Promise<boolean>;
  getCachedQuestionCount: (subjectId: string) => Promise<number>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const OfflineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [networkState, setNetworkState] = useState<NetworkState>(networkService.getState());
  const [isOfflineModeEnabled, setIsOfflineModeEnabled] = useState(false);
  const [pendingSessionCount, setPendingSessionCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Initialize services
  useEffect(() => {
    const init = async () => {
      // Initialize network service
      await networkService.initialize();
      
      // Initialize sync service
      offlineSyncService.initialize();
      
      // Check feature flag
      const flagEnabled = await featureFlagService.isEnabled('offline_mode');
      setIsOfflineModeEnabled(flagEnabled);
      
      // Get initial sync status
      const syncStatus = await offlineSyncService.getSyncStatus();
      setPendingSessionCount(syncStatus.pendingSessions);
      setLastSyncTime(syncStatus.lastSync);
    };

    init();

    // Subscribe to network changes
    const unsubscribeNetwork = networkService.subscribe((state) => {
      setNetworkState(state);
    });

    // Subscribe to sync completion
    const unsubscribeSync = offlineSyncService.onSyncComplete(async (result) => {
      setIsSyncing(false);
      if (result.success || result.sessionsSynced > 0 || result.answersSynced > 0) {
        setLastSyncTime(new Date(result.timestamp));
      }
      // Refresh pending count
      const count = await offlineSyncService.getPendingSessionCount();
      setPendingSessionCount(count);
    });

    // Cleanup
    return () => {
      unsubscribeNetwork();
      unsubscribeSync();
      offlineSyncService.cleanup();
      networkService.cleanup();
    };
  }, []);

  // Refresh feature flag periodically
  useEffect(() => {
    const checkFlag = async () => {
      const flagEnabled = await featureFlagService.isEnabled('offline_mode');
      setIsOfflineModeEnabled(flagEnabled);
    };

    const interval = setInterval(checkFlag, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Sync now action
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    setIsSyncing(true);
    const result = await offlineSyncService.syncAll();
    setIsSyncing(false);
    
    if (result.success || result.sessionsSynced > 0 || result.answersSynced > 0) {
      setLastSyncTime(new Date(result.timestamp));
    }
    
    const count = await offlineSyncService.getPendingSessionCount();
    setPendingSessionCount(count);
    
    return result;
  }, []);

  // Refresh network status
  const refreshNetworkStatus = useCallback(async () => {
    await networkService.refresh();
  }, []);

  // Check if cached questions exist for a subject
  const hasCachedQuestions = useCallback(async (subjectId: string): Promise<boolean> => {
    return offlineService.hasCachedQuestions(subjectId);
  }, []);

  // Get cached question count for a subject
  const getCachedQuestionCount = useCallback(async (subjectId: string): Promise<number> => {
    const questions = await offlineService.getCachedQuestions(subjectId);
    return questions?.length ?? 0;
  }, []);

  const value: OfflineContextType = {
    isOnline: networkState.status === 'online',
    isOffline: networkState.status === 'offline',
    networkStatus: networkState.status,
    isOfflineModeEnabled,
    pendingSessionCount,
    isSyncing,
    lastSyncTime,
    syncNow,
    refreshNetworkStatus,
    hasCachedQuestions,
    getCachedQuestionCount,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

/**
 * Hook to access offline context
 */
export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};

/**
 * Hook to check if a feature requires online connectivity
 */
export const useRequiresOnline = (featureName: string): {
  isAvailable: boolean;
  reason: string | null;
} => {
  const { isOnline, isOfflineModeEnabled } = useOffline();

  // Features that require online connectivity
  const onlineOnlyFeatures = [
    'ai_explanations',
    'ai_insights',
    'competitive_mode',
    'teacher_marketplace',
    'leaderboards',
  ];

  if (!onlineOnlyFeatures.includes(featureName)) {
    return { isAvailable: true, reason: null };
  }

  if (!isOnline) {
    return {
      isAvailable: false,
      reason: 'This feature requires an internet connection',
    };
  }

  return { isAvailable: true, reason: null };
};

export default OfflineContext;
