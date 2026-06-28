'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sessionService, SensitiveAction, SESSION_CONFIG } from '@/services/sessionService';
import { createClient } from '@/utils/supabase/client';

interface UseSessionSecurityReturn {
  // Session state
  isSessionValid: boolean;
  remainingTime: number;
  
  // Re-authentication
  requiresReauth: boolean;
  showReauthModal: boolean;
  setShowReauthModal: (show: boolean) => void;
  
  // Actions
  checkAndExecute: (action: SensitiveAction, callback: () => void | Promise<void>) => void;
  refreshSession: () => void;
  logout: () => Promise<void>;
}

export function useSessionSecurity(): UseSessionSecurityReturn {
  const router = useRouter();
  const supabase = createClient();
  
  const [isSessionValid, setIsSessionValid] = useState(true);
  const [remainingTime, setRemainingTime] = useState(SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);

  // Initialize session tracking
  useEffect(() => {
    const cleanup = sessionService.initializeSessionTracking();
    return cleanup;
  }, []);

  // Check session validity periodically
  useEffect(() => {
    const checkSession = async () => {
      const result = await sessionService.checkSessionValidity();
      setIsSessionValid(result.valid);
      
      if (!result.valid) {
        // Session timed out, redirect to login
        await logout();
        router.push('/login?reason=session_timeout');
      }
    };

    // Check every minute
    const interval = setInterval(checkSession, 60000);
    
    // Initial check
    checkSession();

    return () => clearInterval(interval);
  }, [router]);

  // Update remaining time display
  useEffect(() => {
    const updateTime = () => {
      setRemainingTime(sessionService.getRemainingSessionTime());
    };

    const interval = setInterval(updateTime, 30000); // Update every 30 seconds
    updateTime();

    return () => clearInterval(interval);
  }, []);

  // Check if re-authentication is required
  useEffect(() => {
    setRequiresReauth(sessionService.requiresReauthentication());
  }, []);

  // Execute action after successful re-authentication
  const executeAfterReauth = useCallback(() => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    setShowReauthModal(false);
    setRequiresReauth(false);
  }, [pendingAction]);

  // Check if action requires re-auth and execute
  const checkAndExecute = useCallback((action: SensitiveAction, callback: () => void | Promise<void>) => {
    if (sessionService.requiresReauthentication(action)) {
      setPendingAction(() => callback);
      setShowReauthModal(true);
    } else {
      callback();
    }
  }, []);

  // Refresh session activity
  const refreshSession = useCallback(() => {
    sessionService.updateLastActivity();
    setRemainingTime(SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES);
  }, []);

  // Logout and clear session
  const logout = useCallback(async () => {
    sessionService.clearSessionData();
    await supabase.auth.signOut();
  }, [supabase]);

  return {
    isSessionValid,
    remainingTime,
    requiresReauth,
    showReauthModal,
    setShowReauthModal,
    checkAndExecute,
    refreshSession,
    logout,
  };
}
