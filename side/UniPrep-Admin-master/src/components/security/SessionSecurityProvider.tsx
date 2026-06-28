'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { sessionService, SensitiveAction, SESSION_CONFIG } from '@/services/sessionService';
import { createClient } from '@/utils/supabase/client';
import { ReauthenticationModal } from './ReauthenticationModal';

interface SessionSecurityContextType {
  isSessionValid: boolean;
  remainingTime: number;
  requiresReauth: boolean;
  checkAndExecute: (action: SensitiveAction, callback: () => void | Promise<void>) => void;
  refreshSession: () => void;
}

const SessionSecurityContext = createContext<SessionSecurityContextType | null>(null);

export function useSessionSecurityContext() {
  const context = useContext(SessionSecurityContext);
  if (!context) {
    throw new Error('useSessionSecurityContext must be used within SessionSecurityProvider');
  }
  return context;
}

interface SessionSecurityProviderProps {
  children: React.ReactNode;
}

export function SessionSecurityProvider({ children }: SessionSecurityProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  
  const [isSessionValid, setIsSessionValid] = useState(true);
  const [remainingTime, setRemainingTime] = useState(SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES);
  const [requiresReauth, setRequiresReauth] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);
  const [pendingActionType, setPendingActionType] = useState<SensitiveAction | undefined>();

  // Initialize session tracking on mount
  useEffect(() => {
    const cleanup = sessionService.initializeSessionTracking();
    
    // Also update activity on initial load
    sessionService.updateLastActivity();
    
    return cleanup;
  }, []);

  // Check session validity periodically
  useEffect(() => {
    const checkSession = async () => {
      const result = await sessionService.checkSessionValidity();
      setIsSessionValid(result.valid);
      
      if (!result.valid) {
        // Clear session data
        sessionService.clearSessionData();
        // Sign out from Supabase
        await supabase.auth.signOut();
        // Redirect to login with reason
        router.push('/login?reason=session_timeout');
      }
    };

    // Check every minute
    const interval = setInterval(checkSession, 60000);
    
    // Initial check after a delay — give auth cookies and session service time to
    // fully propagate after a fresh login redirect before verifying the session.
    const initialCheck = setTimeout(checkSession, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialCheck);
    };
  }, [router, supabase]);

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
  }, [pathname]); // Re-check when navigating

  // Check if action requires re-auth and execute
  const checkAndExecute = useCallback((action: SensitiveAction, callback: () => void | Promise<void>) => {
    if (sessionService.requiresReauthentication(action)) {
      setPendingAction(() => callback);
      setPendingActionType(action);
      setShowReauthModal(true);
    } else {
      callback();
    }
  }, []);

  // Handle successful re-authentication
  const handleReauthSuccess = useCallback(() => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
      setPendingActionType(undefined);
    }
    setShowReauthModal(false);
    setRequiresReauth(false);
  }, [pendingAction]);

  // Refresh session activity
  const refreshSession = useCallback(() => {
    sessionService.updateLastActivity();
    setRemainingTime(SESSION_CONFIG.INACTIVITY_TIMEOUT_MINUTES);
  }, []);

  const value: SessionSecurityContextType = {
    isSessionValid,
    remainingTime,
    requiresReauth,
    checkAndExecute,
    refreshSession,
  };

  return (
    <SessionSecurityContext.Provider value={value}>
      {children}
      <ReauthenticationModal
        isOpen={showReauthModal}
        onClose={() => {
          setShowReauthModal(false);
          setPendingAction(null);
          setPendingActionType(undefined);
        }}
        onSuccess={handleReauthSuccess}
        action={pendingActionType}
        actionDescription={pendingActionType ? `This action requires re-authentication: ${pendingActionType.replace(/_/g, ' ')}` : undefined}
      />
    </SessionSecurityContext.Provider>
  );
}
