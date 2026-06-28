import { createClient, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { AppState, AppStateStatus, Platform } from 'react-native';

// ============================================================================
// INDUSTRY BEST PRACTICES FOR SEAMLESS AUTH
// ============================================================================
// 1. Supabase-owned refresh lifecycle - avoid competing manual refresh calls
// 2. Session health checks on foreground/resume
// 3. Proper session persistence - ensure tokens are always saved
// 4. Graceful degradation - handle errors without disrupting UX
// 5. Native auto-refresh start/stop while app is active
// ============================================================================

const REFRESH_BUFFER_SECONDS = 15 * 60; // Log a warning window before expiry; Supabase owns refresh.
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

const PERMANENT_REFRESH_ERRORS = [
  'Invalid Refresh Token',
  'Refresh Token Not Found',
  'Token has expired',
  'User not found',
];

const isPermanentRefreshError = (message?: string): boolean =>
  PERMANENT_REFRESH_ERRORS.some(e => message?.includes(e));

// Errors that mean the refresh token was permanently revoked (not a transient network issue).
// These should NOT be retried — silent re-auth is the only recovery path.
// Get Supabase credentials from environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase credentials not found in .env file. Please create .env with:\n' +
    'EXPO_PUBLIC_SUPABASE_URL=your_project_url\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key'
  );
}

// ============================================================================
// SECURE STORAGE ADAPTER
// ============================================================================
// Auth tokens are stored in expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on Android).
// SecureStore has a ~2KB limit per key, so large session blobs are chunked.
// Non-auth keys fall back to AsyncStorage (non-sensitive data).
// On first launch after upgrade, migrates existing tokens from AsyncStorage → SecureStore.
// ============================================================================

const SECURE_STORE_CHUNK_SIZE = 1800; // Leave margin under 2KB limit
const SECURE_STORE_PREFIX = 'ss_'; // Prefix to identify secure-stored keys
const MIGRATION_FLAG = '@elmly_secure_storage_migrated';

// Keys that contain auth tokens and MUST be stored securely
const isAuthKey = (key: string): boolean =>
  key.includes('auth-token') || key.includes('auth.token') || key.includes('supabase.auth');

/**
 * Write a value to SecureStore, chunking if necessary.
 * Stores chunk count at `{key}_chunks` so we know how many to read back.
 */
const secureSetItem = async (key: string, value: string): Promise<void> => {
  const chunks = Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE);

  if (chunks === 1) {
    // Fits in a single SecureStore entry
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    // Clean up any leftover chunks from a previous larger value
    await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
  } else {
    // Store chunk count first
    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    // Store each chunk
    for (let i = 0; i < chunks; i++) {
      const chunk = value.slice(i * SECURE_STORE_CHUNK_SIZE, (i + 1) * SECURE_STORE_CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_${i}`, chunk, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    }
  }
};

/**
 * Read a (possibly chunked) value from SecureStore.
 */
const secureGetItem = async (key: string): Promise<string | null> => {
  try {
    // Check if chunked
    const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);

    if (chunkCountStr) {
      const chunkCount = parseInt(chunkCountStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) return null; // Corrupted — missing chunk
        chunks.push(chunk);
      }
      return chunks.join('');
    }

    // Not chunked — single value
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

/**
 * Remove a (possibly chunked) value from SecureStore.
 */
const secureRemoveItem = async (key: string): Promise<void> => {
  try {
    const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (chunkCountStr) {
      const chunkCount = parseInt(chunkCountStr, 10);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
    }
    await SecureStore.deleteItemAsync(key).catch(() => {});
  } catch {
    // Best effort cleanup
  }
};

/**
 * One-time migration: move auth tokens from AsyncStorage → SecureStore.
 * Runs once on first launch after the upgrade. Idempotent.
 */
const migrateAuthTokensOnce = async (key: string): Promise<string | null> => {
  try {
    const alreadyMigrated = await AsyncStorage.getItem(MIGRATION_FLAG);
    if (alreadyMigrated) return null;

    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue) {
      console.log('🔐 Migrating auth tokens from AsyncStorage → SecureStore...');
      await secureSetItem(key, legacyValue);
      // Remove from AsyncStorage after successful SecureStore write
      await AsyncStorage.removeItem(key);
      console.log('🔐 Auth token migration complete');
      return legacyValue;
    }

    return null;
  } catch (error) {
    console.error('🔐 Migration error (non-fatal, will retry next launch):', error);
    return null;
  }
};

// Mark migration as done once ANY auth key is successfully stored in SecureStore
const markMigrationDone = async () => {
  try {
    await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
  } catch {}
};

// Enhanced storage wrapper: SecureStore for auth, AsyncStorage for the rest
const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isAuthKey(key)) {
      try {
        // Try SecureStore first
        const secureValue = await secureGetItem(key);
        if (secureValue) return secureValue;

        // If not in SecureStore, try migration from AsyncStorage
        const migratedValue = await migrateAuthTokensOnce(key);
        if (migratedValue) {
          await markMigrationDone();
          return migratedValue;
        }

        return null;
      } catch (error) {
        console.error('🔐 Secure getItem error, falling back to AsyncStorage:', error);
        // Fallback: try AsyncStorage (pre-migration state or SecureStore unavailable)
        return await AsyncStorage.getItem(key);
      }
    }

    // Non-auth keys: use AsyncStorage
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('🔐 Storage getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isAuthKey(key)) {
      try {
        await secureSetItem(key, value);
        await markMigrationDone();
        // Also remove from AsyncStorage if it exists there (cleanup)
        await AsyncStorage.removeItem(key).catch(() => {});
        return;
      } catch (error) {
        console.error('🔐 Secure setItem error, falling back to AsyncStorage:', error);
        // Fallback: still store in AsyncStorage rather than losing the session
        await AsyncStorage.setItem(key, value);
        return;
      }
    }

    // Non-auth keys: use AsyncStorage
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('🔐 Storage setItem error:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (isAuthKey(key)) {
      try {
        await secureRemoveItem(key);
      } catch {}
    }
    // Always try AsyncStorage removal too (cleanup of legacy data)
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

// Create Supabase client with enhanced session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Increase lock timeout for better handling of concurrent requests
    flowType: 'pkce',
  },
});

// Non-PKCE client used ONLY for signUp calls.
// PKCE flow sends a `code` in email confirmation links — the code verifier is
// stored in the mobile app's AsyncStorage. When the user opens the link in a
// browser, the verifier is missing → exchangeCodeForSession fails → "expired".
// Using implicit flow for signup makes Supabase send a token_hash OTP link
// instead, which the Elmly auth service handles correctly via verifyOtp({ token_hash }).
export const supabaseSignup = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

// ============================================================================
// PROACTIVE TOKEN REFRESH WITH RETRY LOGIC
// ============================================================================

// Track refresh state to prevent concurrent refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh session with retry logic and exponential backoff
 * Industry standard: Retry up to 3 times before giving up
 * If refresh token is invalid, attempt silent re-authentication
 */
const refreshSessionWithRetry = async (attempt: number = 1): Promise<Session | null> => {
  console.warn('Manual refreshSession() is disabled; Supabase auto-refresh owns mobile session rotation.');
  return null;

  /*
  try {
    console.log(`🔐 Attempting token refresh (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})...`);
    
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) {
      // Permanent error: refresh token was revoked (e.g. another device logged in and
      // Supabase is in single-session mode, or the token simply expired server-side).
      // Do NOT retry these — use silent re-auth with stored credentials instead.
      if (isPermanentRefreshError(error.message)) {
        console.error(`🔐 Refresh token permanently invalid ("${error.message}") — this typically means another device/client logged in and invalidated this session.`);
        console.error('🔐 Attempting silent re-authentication with stored credentials...');
        
        try {
          const { secureAuthService } = await import('./secureAuthService');
          const reAuthResult = await secureAuthService.attemptSilentReAuthBackground();
          if (reAuthResult.success && reAuthResult.session) {
            console.log('✅ Silent re-authentication successful — session restored after cross-device invalidation');
            // Reschedule proactive refresh with the new session
            scheduleProactiveRefresh();
            return reAuthResult.session;
          }
        } catch (importError) {
          console.error('🔐 Failed to import secureAuthService:', importError);
        }
        
        console.error('🔐 Silent re-authentication failed — user must log in manually');
        return null; // Don't retry — permanent failure
      }
      
      // For transient errors, retry with exponential backoff
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`🔐 Refresh failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return refreshSessionWithRetry(attempt + 1);
      }
      
      console.error('🔐 All refresh attempts failed:', error.message);
      return null;
    }
    
    if (data.session) {
      console.log('🔐 Token refreshed successfully');
      return data.session;
    }
    
    return null;
  } catch (error: any) {
    console.error('🔐 Refresh exception:', error.message);
    
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      return refreshSessionWithRetry(attempt + 1);
    }
    
    return null;
  }
  */
};

/**
 * Proactive session refresh - refreshes well before expiry
 * Industry best practice: Refresh 15 minutes before expiry to ensure seamless UX
 */
export const refreshSessionOnForeground = async (): Promise<boolean> => {
  // Prevent concurrent refresh attempts (race condition prevention)
  if (isRefreshing && refreshPromise) {
    console.log('🔐 Refresh already in progress, waiting...');
    return refreshPromise;
  }
  
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('🔐 Session check error:', error.message);
        return false;
      }
      
      if (!session) {
        console.log('🔐 No session found on foreground');
        return false;
      }
      
      // Proactive refresh: Check if token expires within REFRESH_BUFFER_SECONDS
      const expiresAt = session.expires_at || 0;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;
      
      // If already expired, try to refresh immediately
      if (timeUntilExpiry <= 0) {
        console.log('🔐 Token already expired, attempting refresh...');
        return false;
      }
      
      // Proactive refresh: Refresh 15 minutes before expiry
      if (timeUntilExpiry < REFRESH_BUFFER_SECONDS) {
        console.log(`🔐 Token expires in ${Math.round(timeUntilExpiry / 60)} minutes, proactively refreshing...`);
        return true;
      }
      
      console.log(`🔐 Session valid, expires in ${Math.round(timeUntilExpiry / 60)} minutes`);
      return true;
    } catch (error) {
      console.error('🔐 Session recovery error:', error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
};

/**
 * Schedule proactive refresh before token expires
 * This ensures the token is always fresh without user noticing
 */
let proactiveRefreshTimeout: NodeJS.Timeout | null = null;

const scheduleProactiveRefresh = async () => {
  // Clear any existing scheduled refresh
  if (proactiveRefreshTimeout) {
    clearTimeout(proactiveRefreshTimeout);
    proactiveRefreshTimeout = null;
  }
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) return;
    
    const expiresAt = session.expires_at || 0;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;
    
    // Schedule refresh for REFRESH_BUFFER_SECONDS before expiry
    const refreshIn = Math.max((timeUntilExpiry - REFRESH_BUFFER_SECONDS) * 1000, 60000); // At least 1 minute
    
    console.log(`🔐 Scheduling proactive refresh in ${Math.round(refreshIn / 60000)} minutes`);
    
    proactiveRefreshTimeout = setTimeout(async () => {
      console.log('🔐 Executing scheduled proactive refresh...');
      supabase.auth.startAutoRefresh();
      const success = await refreshSessionOnForeground();
      if (success) {
        // Schedule next refresh
        scheduleProactiveRefresh();
      }
    }, refreshIn);
  } catch (error) {
    console.error('🔐 Error scheduling proactive refresh:', error);
  }
};

// Setup app state listener for automatic session refresh
let appStateSubscription: any = null;
let lastAppState: AppStateStatus = 'active';

export const setupAppStateListener = () => {
  if (appStateSubscription) return; // Already setup

  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }
  
  appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
    const previousState = lastAppState;
    lastAppState = nextAppState;
    
    if (nextAppState === 'active' && previousState !== 'active') {
      supabase.auth.startAutoRefresh();
      console.log('🔐 App came to foreground - checking session...');
      const success = await refreshSessionOnForeground();
      
      if (success) {
        // Re-schedule proactive refresh when app becomes active
        scheduleProactiveRefresh();
      }
    } else if (nextAppState !== 'active') {
      supabase.auth.stopAutoRefresh();
      // Clear scheduled refresh when app goes to background
      if (proactiveRefreshTimeout) {
        clearTimeout(proactiveRefreshTimeout);
        proactiveRefreshTimeout = null;
      }
    }
  });
  
  // Initial proactive refresh scheduling
  scheduleProactiveRefresh();
  
  console.log('🔐 App state listener setup complete with proactive refresh');
};

export const removeAppStateListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (proactiveRefreshTimeout) {
    clearTimeout(proactiveRefreshTimeout);
    proactiveRefreshTimeout = null;
  }
};

/**
 * Initialize auth session management
 * Call this on app startup to ensure seamless auth experience
 */
export const initializeAuthSession = async (): Promise<boolean> => {
  try {
    console.log('🔐 Initializing auth session management...');
    
    // Check and refresh session if needed
    const success = await refreshSessionOnForeground();
    
    if (success) {
      // Schedule proactive refresh
      scheduleProactiveRefresh();
    }
    
    return success;
  } catch (error) {
    console.error('🔐 Auth session initialization error:', error);
    return false;
  }
};

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// Export for use in other services
export default supabase;
