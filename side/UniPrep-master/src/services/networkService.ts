// Network Service
// Stage 6 - Week 3: Offline Mode Implementation
// Industry-standard network connectivity detection and monitoring

import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';

export type NetworkStatus = 'online' | 'offline' | 'unknown';

export interface NetworkState {
  status: NetworkStatus;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  details: any;
}

type NetworkListener = (state: NetworkState) => void;

class NetworkService {
  private listeners: Set<NetworkListener> = new Set();
  private currentState: NetworkState = {
    status: 'unknown',
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown',
    details: null,
  };
  private netInfoSubscription: NetInfoSubscription | null = null;
  private appStateSubscription: any = null;
  private initialized: boolean = false;

  /**
   * Initialize network monitoring
   * Should be called once when app starts
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get initial state
      const state = await NetInfo.fetch();
      this.updateState(state);

      // Subscribe to network changes
      this.netInfoSubscription = NetInfo.addEventListener(this.handleNetworkChange);

      // Subscribe to app state changes (to recheck when app comes to foreground)
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

      this.initialized = true;
      console.log('🌐 NetworkService initialized:', this.currentState.status);
    } catch (error) {
      console.error('Failed to initialize NetworkService:', error);
    }
  }

  /**
   * Cleanup subscriptions
   */
  cleanup(): void {
    if (this.netInfoSubscription) {
      this.netInfoSubscription();
      this.netInfoSubscription = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.listeners.clear();
    this.initialized = false;
  }

  /**
   * Handle network state changes
   */
  private handleNetworkChange = (state: NetInfoState): void => {
    this.updateState(state);
  };

  /**
   * Handle app state changes
   */
  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    if (nextAppState === 'active') {
      // Recheck network when app comes to foreground
      const state = await NetInfo.fetch();
      this.updateState(state);
    }
  };

  /**
   * Update internal state and notify listeners
   */
  private updateState(netInfoState: NetInfoState): void {
    const previousStatus = this.currentState.status;
    
    // Determine status based on connection and internet reachability
    let status: NetworkStatus = 'unknown';
    if (netInfoState.isConnected === false) {
      status = 'offline';
    } else if (netInfoState.isInternetReachable === true) {
      status = 'online';
    } else if (netInfoState.isInternetReachable === false) {
      status = 'offline';
    } else if (netInfoState.isConnected === true) {
      // Connected but reachability unknown - assume online
      status = 'online';
    }

    this.currentState = {
      status,
      isConnected: netInfoState.isConnected ?? false,
      isInternetReachable: netInfoState.isInternetReachable,
      type: netInfoState.type,
      details: netInfoState.details,
    };

    // Only notify if status actually changed
    if (previousStatus !== status) {
      console.log(`🌐 Network status changed: ${previousStatus} → ${status}`);
      this.notifyListeners();
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error('Error in network listener:', error);
      }
    });
  }

  /**
   * Get current network state
   */
  getState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.currentState.status === 'online';
  }

  /**
   * Check if currently offline
   */
  isOffline(): boolean {
    return this.currentState.status === 'offline';
  }

  /**
   * Force refresh network state
   */
  async refresh(): Promise<NetworkState> {
    const state = await NetInfo.fetch();
    this.updateState(state);
    return this.getState();
  }

  /**
   * Subscribe to network state changes
   * Returns unsubscribe function
   */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current state
    listener(this.currentState);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Wait for network to be online (with timeout)
   */
  async waitForOnline(timeoutMs: number = 30000): Promise<boolean> {
    if (this.isOnline()) return true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.subscribe((state) => {
        if (state.status === 'online') {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }
}

export const networkService = new NetworkService();
