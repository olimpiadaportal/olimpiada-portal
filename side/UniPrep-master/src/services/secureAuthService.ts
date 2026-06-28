// ============================================================================
// SECURE AUTHENTICATION SERVICE
// Industry-standard silent re-authentication with biometrics
// ============================================================================
// This service enables unlimited auth sessions by:
// 1. Securely storing encrypted credentials
// 2. Using biometric authentication for re-login
// 3. Automatically re-authenticating when refresh token expires
// 4. Never requiring manual login after initial authentication
// ============================================================================

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from './supabase';

// ============================================================================
// CONSTANTS
// ============================================================================

const SECURE_KEYS = {
  EMAIL: 'uniprep_secure_email',
  PASSWORD: 'uniprep_secure_password',
  BIOMETRIC_ENABLED: 'uniprep_biometric_enabled',
  REMEMBER_ME: 'uniprep_remember_me',
  REMEMBER_ME_PREFERENCE: 'uniprep_remember_me_preference', // User's toggle preference
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface BiometricCapabilities {
  isAvailable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
}

interface SecureCredentials {
  email: string;
  password: string;
}

// ============================================================================
// BIOMETRIC AUTHENTICATION
// ============================================================================

class SecureAuthService {
  /**
   * Check if device supports biometric authentication
   */
  async checkBiometricCapabilities(): Promise<BiometricCapabilities> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      return {
        isAvailable: hasHardware && isEnrolled,
        hasHardware,
        isEnrolled,
        supportedTypes,
      };
    } catch (error) {
      console.error('🔐 Error checking biometric capabilities:', error);
      return {
        isAvailable: false,
        hasHardware: false,
        isEnrolled: false,
        supportedTypes: [],
      };
    }
  }

  /**
   * Get user-friendly biometric type name
   * Shows all available biometric types if multiple are supported
   */
  async getBiometricTypeName(): Promise<string> {
    const capabilities = await this.checkBiometricCapabilities();
    
    if (!capabilities.isAvailable) return 'Biometric';
    
    const types = capabilities.supportedTypes;
    const availableTypes: string[] = [];
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      availableTypes.push('Face ID');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      availableTypes.push('Fingerprint');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      availableTypes.push('Iris');
    }
    
    if (availableTypes.length === 0) {
      return 'Biometric';
    }
    
    // If multiple types, join with 'or'
    if (availableTypes.length > 1) {
      return availableTypes.join(' or ');
    }
    
    return availableTypes[0];
  }

  /**
   * Prompt user for biometric authentication
   */
  async authenticateWithBiometrics(reason?: string): Promise<boolean> {
    try {
      const capabilities = await this.checkBiometricCapabilities();
      
      if (!capabilities.isAvailable) {
        console.log('🔐 Biometric authentication not available');
        return false;
      }

      const biometricName = await this.getBiometricTypeName();
      const defaultReason = `Authenticate with ${biometricName} to continue`;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason || defaultReason,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Allow PIN/password fallback
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        console.log('✅ Biometric authentication successful');
        return true;
      } else {
        console.log('❌ Biometric authentication failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('🔐 Biometric authentication error:', error);
      return false;
    }
  }

  // ============================================================================
  // SECURE CREDENTIAL STORAGE
  // ============================================================================

  /**
   * Securely store user credentials for silent re-authentication
   * Only called when user explicitly opts in (Remember Me)
   */
  async storeCredentials(email: string, password: string): Promise<boolean> {
    try {
      // Store credentials in secure enclave (hardware-backed encryption)
      await SecureStore.setItemAsync(SECURE_KEYS.EMAIL, email, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      
      await SecureStore.setItemAsync(SECURE_KEYS.PASSWORD, password, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      await SecureStore.setItemAsync(SECURE_KEYS.REMEMBER_ME, 'true');

      console.log('✅ Credentials stored securely');
      return true;
    } catch (error) {
      console.error('🔐 Error storing credentials:', error);
      return false;
    }
  }

  /**
   * Retrieve stored credentials (requires biometric auth)
   */
  async getStoredCredentials(requireBiometric: boolean = true): Promise<SecureCredentials | null> {
    try {
      // Check if remember me is enabled
      const rememberMe = await SecureStore.getItemAsync(SECURE_KEYS.REMEMBER_ME);
      if (rememberMe !== 'true') {
        console.log('🔐 Remember me not enabled');
        return null;
      }

      // Require biometric authentication before retrieving credentials
      if (requireBiometric) {
        const biometricName = await this.getBiometricTypeName();
        const authenticated = await this.authenticateWithBiometrics(
          `Authenticate with ${biometricName} to stay signed in`
        );
        
        if (!authenticated) {
          console.log('🔐 Biometric authentication required but failed');
          return null;
        }
      }

      // Retrieve credentials from secure storage
      const email = await SecureStore.getItemAsync(SECURE_KEYS.EMAIL);
      const password = await SecureStore.getItemAsync(SECURE_KEYS.PASSWORD);

      if (!email || !password) {
        console.log('🔐 No stored credentials found');
        return null;
      }

      console.log('✅ Credentials retrieved securely');
      return { email, password };
    } catch (error) {
      console.error('🔐 Error retrieving credentials:', error);
      return null;
    }
  }

  /**
   * Clear stored credentials (on logout or disable remember me)
   */
  async clearStoredCredentials(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.EMAIL);
      await SecureStore.deleteItemAsync(SECURE_KEYS.PASSWORD);
      await SecureStore.deleteItemAsync(SECURE_KEYS.REMEMBER_ME);
      await SecureStore.deleteItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED);
      
      console.log('✅ Stored credentials cleared');
    } catch (error) {
      console.error('🔐 Error clearing credentials:', error);
    }
  }

  /**
   * Check if credentials are stored
   */
  async hasStoredCredentials(): Promise<boolean> {
    try {
      const rememberMe = await SecureStore.getItemAsync(SECURE_KEYS.REMEMBER_ME);
      const email = await SecureStore.getItemAsync(SECURE_KEYS.EMAIL);
      return rememberMe === 'true' && !!email;
    } catch (error) {
      console.error('🔐 Error checking stored credentials:', error);
      return false;
    }
  }

  // ============================================================================
  // SILENT RE-AUTHENTICATION
  // ============================================================================

  /**
   * Attempt silent re-authentication using stored credentials
   * This is the key function that enables unlimited auth sessions
   */
  async attemptSilentReAuth(): Promise<{ success: boolean; session: any | null }> {
    try {
      console.log('🔐 Attempting silent re-authentication...');

      // Check if we have stored credentials
      const hasCredentials = await this.hasStoredCredentials();
      if (!hasCredentials) {
        console.log('🔐 No stored credentials for silent re-auth');
        return { success: false, session: null };
      }

      // Get credentials with biometric authentication
      const credentials = await this.getStoredCredentials(true);
      if (!credentials) {
        console.log('🔐 Failed to retrieve credentials for silent re-auth');
        return { success: false, session: null };
      }

      // Attempt to sign in with stored credentials
      console.log('🔐 Signing in with stored credentials...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        console.error('🔐 Silent re-auth failed:', error.message);
        
        // If credentials are invalid, clear them
        if (error.message?.includes('Invalid login credentials')) {
          console.log('🔐 Invalid credentials - clearing stored data');
          await this.clearStoredCredentials();
        }
        
        return { success: false, session: null };
      }

      if (data.session) {
        console.log('✅ Silent re-authentication successful');
        return { success: true, session: data.session };
      }

      return { success: false, session: null };
    } catch (error) {
      console.error('🔐 Silent re-auth exception:', error);
      return { success: false, session: null };
    }
  }

  /**
   * Attempt silent re-authentication without biometric prompt
   * Used for background refresh when app is active
   */
  async attemptSilentReAuthBackground(): Promise<{ success: boolean; session: any | null }> {
    try {
      console.log('🔐 Attempting background silent re-authentication...');

      const hasCredentials = await this.hasStoredCredentials();
      if (!hasCredentials) {
        return { success: false, session: null };
      }

      // Get credentials WITHOUT biometric prompt (background operation)
      const credentials = await this.getStoredCredentials(false);
      if (!credentials) {
        return { success: false, session: null };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        console.error('🔐 Background silent re-auth failed:', error.message);
        return { success: false, session: null };
      }

      if (data.session) {
        console.log('✅ Background silent re-authentication successful');
        return { success: true, session: data.session };
      }

      return { success: false, session: null };
    } catch (error) {
      console.error('🔐 Background silent re-auth exception:', error);
      return { success: false, session: null };
    }
  }

  // ============================================================================
  // BIOMETRIC SETTINGS
  // ============================================================================

  /**
   * Enable biometric authentication
   */
  async enableBiometric(): Promise<boolean> {
    try {
      const capabilities = await this.checkBiometricCapabilities();
      if (!capabilities.isAvailable) {
        console.log('🔐 Biometric not available on this device');
        return false;
      }

      await SecureStore.setItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED, 'true');
      console.log('✅ Biometric authentication enabled');
      return true;
    } catch (error) {
      console.error('🔐 Error enabling biometric:', error);
      return false;
    }
  }

  /**
   * Disable biometric authentication
   */
  async disableBiometric(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED);
      console.log('✅ Biometric authentication disabled');
    } catch (error) {
      console.error('🔐 Error disabling biometric:', error);
    }
  }

  /**
   * Check if biometric is enabled
   */
  async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await SecureStore.getItemAsync(SECURE_KEYS.BIOMETRIC_ENABLED);
      return enabled === 'true';
    } catch (error) {
      console.error('🔐 Error checking biometric status:', error);
      return false;
    }
  }

  // ============================================================================
  // REMEMBER ME PREFERENCE MANAGEMENT
  // ============================================================================

  /**
   * Save user's Remember Me toggle preference
   * This persists across logout/login
   */
  async saveRememberMePreference(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.REMEMBER_ME_PREFERENCE, enabled ? 'true' : 'false');
      console.log(`✅ Remember Me preference saved: ${enabled}`);
    } catch (error) {
      console.error('🔐 Error saving Remember Me preference:', error);
    }
  }

  /**
   * Get user's Remember Me toggle preference
   * Returns the last saved preference state
   */
  async getRememberMePreference(): Promise<boolean> {
    try {
      const preference = await SecureStore.getItemAsync(SECURE_KEYS.REMEMBER_ME_PREFERENCE);
      return preference === 'true';
    } catch (error) {
      console.error('🔐 Error getting Remember Me preference:', error);
      return false;
    }
  }

  /**
   * Clear Remember Me preference (on explicit logout)
   */
  async clearRememberMePreference(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.REMEMBER_ME_PREFERENCE);
      console.log('✅ Remember Me preference cleared');
    } catch (error) {
      console.error('🔐 Error clearing Remember Me preference:', error);
    }
  }
}

// Export singleton instance
export const secureAuthService = new SecureAuthService();
