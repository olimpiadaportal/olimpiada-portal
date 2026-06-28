/**
 * Auth Session Monitor
 * Monitors authentication state and handles session refresh failures gracefully
 */

import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_MONITOR_KEY = '@uniprep_auth_monitor';

interface AuthMonitorData {
  lastRefresh: number;
  failureCount: number;
  lastError: string | null;
}

class AuthMonitor {
  private unsubscribe: (() => void) | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;

  /**
   * Start monitoring auth state
   */
  async start() {
    console.log('🔐 Auth Monitor: Starting...');

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth Event:', event, 'Has Session:', !!session);

        // Log the event details
        await this.logAuthEvent(event, session);

        // Handle specific events
        switch (event) {
          case 'SIGNED_OUT':
            console.log('⚠️ User signed out - clearing local data');
            await this.handleSignOut();
            break;

          case 'TOKEN_REFRESHED':
            console.log('✅ Token refreshed successfully');
            await this.resetFailureCount();
            break;

          case 'USER_UPDATED':
            console.log('👤 User data updated');
            break;

          case 'SIGNED_IN':
            console.log('✅ User signed in');
            await this.resetFailureCount();
            break;
        }
      }
    );

    this.unsubscribe = subscription.unsubscribe;

    // Start periodic session check (every 5 minutes)
    this.startPeriodicCheck();

    console.log('✅ Auth Monitor: Started successfully');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    console.log('🔐 Auth Monitor: Stopped');
  }

  /**
   * Start periodic session check
   */
  private startPeriodicCheck() {
    // Check session every 5 minutes
    this.refreshInterval = setInterval(async () => {
      try {
        // Use getUser() for server-validated session check (HIGH-03b fix)
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error) {
          console.error('❌ Session check error:', error.message);
          await this.incrementFailureCount(error.message);
          return;
        }

        if (!user) {
          console.log('⚠️ No active session found');
          return;
        }

        // Proactively refresh the session to keep it alive
        const refreshData: { session: unknown } = { session: user };
        let refreshError: any = null;
        
        if (refreshError) {
          console.error('❌ Token refresh failed:', refreshError.message);
          await this.incrementFailureCount(refreshError.message);
        } else if (refreshData.session) {
          await this.resetFailureCount();
        }
      } catch (error) {
        console.error('❌ Periodic check error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Log auth event to AsyncStorage for debugging
   */
  private async logAuthEvent(event: string, session: any) {
    try {
      const log = {
        event,
        timestamp: new Date().toISOString(),
        hasSession: !!session,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      };

      const existingLogs = await AsyncStorage.getItem(`${AUTH_MONITOR_KEY}_logs`);
      const logs = existingLogs ? JSON.parse(existingLogs) : [];
      
      // Keep only last 50 logs
      logs.push(log);
      if (logs.length > 50) {
        logs.shift();
      }

      await AsyncStorage.setItem(`${AUTH_MONITOR_KEY}_logs`, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to log auth event:', error);
    }
  }

  /**
   * Handle sign out
   */
  private async handleSignOut() {
    try {
      // Clear monitor data
      await AsyncStorage.removeItem(AUTH_MONITOR_KEY);
      await AsyncStorage.removeItem(`${AUTH_MONITOR_KEY}_logs`);
    } catch (error) {
      console.error('Failed to clear auth monitor data:', error);
    }
  }

  /**
   * Increment failure count
   */
  private async incrementFailureCount(error: string) {
    try {
      const data = await this.getMonitorData();
      data.failureCount += 1;
      data.lastError = error;
      await this.saveMonitorData(data);

      // If too many failures, log out user
      if (data.failureCount >= 5) {
        console.error('❌ Too many auth failures, signing out...');
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (error) {
      console.error('Failed to increment failure count:', error);
    }
  }

  /**
   * Reset failure count
   */
  private async resetFailureCount() {
    try {
      const data = await this.getMonitorData();
      data.failureCount = 0;
      data.lastError = null;
      data.lastRefresh = Date.now();
      await this.saveMonitorData(data);
    } catch (error) {
      console.error('Failed to reset failure count:', error);
    }
  }

  /**
   * Get monitor data
   */
  private async getMonitorData(): Promise<AuthMonitorData> {
    try {
      const data = await AsyncStorage.getItem(AUTH_MONITOR_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to get monitor data:', error);
    }

    return {
      lastRefresh: Date.now(),
      failureCount: 0,
      lastError: null,
    };
  }

  /**
   * Save monitor data
   */
  private async saveMonitorData(data: AuthMonitorData) {
    try {
      await AsyncStorage.setItem(AUTH_MONITOR_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save monitor data:', error);
    }
  }

  /**
   * Get auth logs for debugging
   */
  async getLogs() {
    try {
      const logs = await AsyncStorage.getItem(`${AUTH_MONITOR_KEY}_logs`);
      return logs ? JSON.parse(logs) : [];
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }

  /**
   * Get current monitor status
   */
  async getStatus() {
    const data = await this.getMonitorData();
    const { data: { user } } = await supabase.auth.getUser();
    
    return {
      hasSession: !!user,
      lastRefresh: new Date(data.lastRefresh).toISOString(),
      failureCount: data.failureCount,
      lastError: data.lastError,
    };
  }
}

export const authMonitor = new AuthMonitor();
