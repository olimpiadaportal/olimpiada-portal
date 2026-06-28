import { createClient } from '@/utils/supabase/client';

// Session configuration
export const SESSION_CONFIG = {
  // Session timeout in minutes (default: 30 minutes of inactivity)
  INACTIVITY_TIMEOUT_MINUTES: 30,
  // Re-authentication required timeout in minutes (for sensitive actions)
  REAUTH_TIMEOUT_MINUTES: 15,
  // Maximum concurrent sessions per user (0 = unlimited)
  MAX_CONCURRENT_SESSIONS: 3,
  // Session storage key
  LAST_ACTIVITY_KEY: 'admin_last_activity',
  REAUTH_TIMESTAMP_KEY: 'admin_reauth_timestamp',
};

// Sensitive actions that require recent authentication
export const SENSITIVE_ACTIONS = [
  'delete_user',
  'modify_permissions',
  'export_data',
  'change_password',
  'disable_mfa',
  'bulk_operations',
  'system_settings',
] as const;

export type SensitiveAction = typeof SENSITIVE_ACTIONS[number];

class SessionService {
  private supabase = createClient();

  /**
   * Update last activity timestamp
   */
  updateLastActivity(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_CONFIG.LAST_ACTIVITY_KEY, Date.now().toString());
    }
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): number | null {
    if (typeof window === 'undefined') return null;
    const timestamp = localStorage.getItem(SESSION_CONFIG.LAST_ACTIVITY_KEY);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  /**
   * Check if session has timed out due to inactivity
   */
  isSessionTimedOut(): boolean {
    const lastActivity = this.getLastActivity();
    if (!lastActivity) return false;

    const now = Date.now();
    const timeoutMs = SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    return now - lastActivity > timeoutMs;
  }

  /**
   * Get remaining session time in minutes
   */
  getRemainingSessionTime(): number {
    const lastActivity = this.getLastActivity();
    if (!lastActivity) return SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES;

    const now = Date.now();
    const timeoutMs = SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
    const elapsed = now - lastActivity;
    const remaining = Math.max(0, timeoutMs - elapsed);
    return Math.ceil(remaining / 60000);
  }

  /**
   * Record re-authentication timestamp
   */
  recordReauthentication(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_CONFIG.REAUTH_TIMESTAMP_KEY, Date.now().toString());
    }
  }

  /**
   * Get last re-authentication timestamp
   */
  getLastReauthentication(): number | null {
    if (typeof window === 'undefined') return null;
    const timestamp = localStorage.getItem(SESSION_CONFIG.REAUTH_TIMESTAMP_KEY);
    return timestamp ? parseInt(timestamp, 10) : null;
  }

  /**
   * Check if re-authentication is required for sensitive action
   */
  requiresReauthentication(action?: SensitiveAction): boolean {
    // If action is provided, check if it's a sensitive action
    if (action && !SENSITIVE_ACTIONS.includes(action)) {
      return false;
    }

    const lastReauth = this.getLastReauthentication();
    if (!lastReauth) return true;

    const now = Date.now();
    const timeoutMs = SESSION_CONFIG.REAUTH_TIMEOUT_MINUTES * 60 * 1000;
    return now - lastReauth > timeoutMs;
  }

  /**
   * Clear session data (on logout)
   */
  clearSessionData(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_CONFIG.LAST_ACTIVITY_KEY);
      localStorage.removeItem(SESSION_CONFIG.REAUTH_TIMESTAMP_KEY);
    }
  }

  /**
   * Initialize session tracking
   * Call this on app mount
   */
  initializeSessionTracking(): () => void {
    if (typeof window === 'undefined') return () => {};

    // Update activity on user interactions
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      this.updateLastActivity();
    };

    // Throttle activity updates to once per minute
    let lastUpdate = 0;
    const throttledHandler = () => {
      const now = Date.now();
      if (now - lastUpdate > 60000) {
        lastUpdate = now;
        handleActivity();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, throttledHandler, { passive: true });
    });

    // Initial activity update
    handleActivity();

    // Return cleanup function
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandler);
      });
    };
  }

  /**
   * Check session validity and handle timeout
   * Returns true if session is valid, false if timed out
   */
  async checkSessionValidity(): Promise<{ valid: boolean; reason?: string }> {
    // Check inactivity timeout
    if (this.isSessionTimedOut()) {
      return { valid: false, reason: 'Session timed out due to inactivity' };
    }

    // Verify with Supabase that session is still valid
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error || !user) {
      return { valid: false, reason: 'Session expired or invalid' };
    }

    return { valid: true };
  }

  /**
   * Log session event to database
   */
  async logSessionEvent(
    userId: string,
    eventType: 'login' | 'logout' | 'timeout' | 'reauth' | 'activity',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.supabase.from('session_events').insert({
        user_id: userId,
        event_type: eventType,
        metadata,
        ip_address: null, // Would need server-side to get real IP
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log session event:', error);
    }
  }

  /**
   * Get user's active sessions count
   */
  async getActiveSessionsCount(userId: string): Promise<number> {
    try {
      // This would require a sessions table or Supabase's session management
      // For now, return 1 as we don't have multi-session tracking yet
      return 1;
    } catch (error) {
      console.error('Failed to get active sessions count:', error);
      return 0;
    }
  }

  /**
   * Format remaining time for display
   */
  formatRemainingTime(minutes: number): string {
    if (minutes <= 0) return 'Session expired';
    if (minutes < 1) return 'Less than a minute';
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  }
}

export const sessionService = new SessionService();
