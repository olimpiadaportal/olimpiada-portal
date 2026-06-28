/**
 * StripeContext.tsx — Phase 8B
 * 
 * Provides Stripe SDK initialization and PaymentSheet functionality.
 * Only initializes when bookings_paid = true in system_settings.
 * 
 * Security:
 * - Publishable key fetched from system_settings (set via Admin Panel)
 * - Secret key never exposed to client (only in Supabase Edge Functions)
 * - PaymentSheet handles PCI compliance (card data never touches our servers)
 * 
 * Note: Stripe SDK requires native modules. In Expo Go, this will be disabled.
 * For full functionality, use a development build (npx expo run:ios/android).
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import { paymentService } from '../services/paymentService';

// Conditionally import Stripe to avoid crash in Expo Go
let StripeSDKProvider: any = null;
let useStripe: any = null;
let isStripeAvailable = false;

try {
  const stripeModule = require('@stripe/stripe-react-native');
  StripeSDKProvider = stripeModule.StripeProvider;
  useStripe = stripeModule.useStripe;
  isStripeAvailable = true;
} catch (error) {
  console.log('Stripe SDK not available (Expo Go mode). Payment features disabled.');
  isStripeAvailable = false;
}

interface StripeContextType {
  isStripeReady: boolean;
  isBookingsPaid: boolean;
  isLoading: boolean;
  initializePaymentSheet: (params: {
    clientSecret: string;
    merchantDisplayName?: string;
  }) => Promise<{ error?: string }>;
  presentPaymentSheet: () => Promise<{ error?: string; success: boolean }>;
  refreshStripeStatus: () => Promise<void>;
}

const StripeContext = createContext<StripeContextType>({
  isStripeReady: false,
  isBookingsPaid: false,
  isLoading: true,
  initializePaymentSheet: async () => ({ error: 'Stripe not initialized' }),
  presentPaymentSheet: async () => ({ error: 'Stripe not initialized', success: false }),
  refreshStripeStatus: async () => {},
});

export const useStripeContext = () => useContext(StripeContext);

/**
 * Inner component that uses Stripe hooks (must be inside StripeSDKProvider)
 */
function StripeContextInner({ children }: { children: ReactNode }) {
  // Only call useStripe if available
  const stripeHooks = isStripeAvailable && useStripe ? useStripe() : null;
  const initPaymentSheet = stripeHooks?.initPaymentSheet;
  const presentSheet = stripeHooks?.presentPaymentSheet;
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [isBookingsPaid, setIsBookingsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStripeStatus = useCallback(async () => {
    try {
      const [bookingsPaid, publishableKey] = await Promise.all([
        paymentService.isBookingsPaid(),
        paymentService.getStripePublishableKey(),
      ]);

      setIsBookingsPaid(bookingsPaid);
      setIsStripeReady(!!publishableKey && publishableKey.startsWith('pk_'));
    } catch (error) {
      console.error('Error checking Stripe status:', error);
      setIsStripeReady(false);
      setIsBookingsPaid(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStripeStatus();
  }, [refreshStripeStatus]);

  const initializePaymentSheet = useCallback(async (params: {
    clientSecret: string;
    merchantDisplayName?: string;
  }): Promise<{ error?: string }> => {
    if (!isStripeReady) {
      return { error: 'Stripe is not configured' };
    }

    try {
      const { error } = await initPaymentSheet({
        paymentIntentClientSecret: params.clientSecret,
        merchantDisplayName: params.merchantDisplayName || 'Elmly',
        // Style customization
        appearance: {
          colors: {
            primary: '#2563EB', // Elmly blue
            background: '#FFFFFF',
            componentBackground: '#F3F4F6',
            componentBorder: '#E5E7EB',
            componentDivider: '#E5E7EB',
            primaryText: '#111827',
            secondaryText: '#6B7280',
            componentText: '#111827',
            placeholderText: '#9CA3AF',
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
        },
        // Allow saving payment methods for future use
        allowsDelayedPaymentMethods: false,
        // Return URL for 3D Secure redirects
        returnURL: 'elmly://stripe-redirect',
      });

      if (error) {
        console.error('PaymentSheet init error:', error);
        return { error: error.message };
      }

      return {};
    } catch (err) {
      console.error('PaymentSheet init exception:', err);
      return { error: err instanceof Error ? err.message : 'Failed to initialize payment' };
    }
  }, [isStripeReady, initPaymentSheet]);

  const presentPaymentSheet = useCallback(async (): Promise<{ error?: string; success: boolean }> => {
    if (!isStripeReady) {
      return { error: 'Stripe is not configured', success: false };
    }

    try {
      const { error } = await presentSheet();

      if (error) {
        // User cancelled is not an error
        if (error.code === 'Canceled') {
          return { error: undefined, success: false };
        }
        console.error('PaymentSheet present error:', error);
        return { error: error.message, success: false };
      }

      return { success: true };
    } catch (err) {
      console.error('PaymentSheet present exception:', err);
      return { error: err instanceof Error ? err.message : 'Payment failed', success: false };
    }
  }, [isStripeReady, presentSheet]);

  return (
    <StripeContext.Provider
      value={{
        isStripeReady,
        isBookingsPaid,
        isLoading,
        initializePaymentSheet,
        presentPaymentSheet,
        refreshStripeStatus,
      }}
    >
      {children}
    </StripeContext.Provider>
  );
}

/**
 * Fallback provider when Stripe SDK is not available (e.g. Expo Go).
 * Still fetches isBookingsPaid from DB so the booking request uses the
 * create-payment Edge Function (server-side price calculation).
 * Stripe PaymentSheet won't work, but that's only needed AFTER teacher accepts.
 */
function StripeNoSdkFallback({ children }: { children: ReactNode }) {
  const [isBookingsPaid, setIsBookingsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStripeStatus = useCallback(async () => {
    try {
      const bookingsPaid = await paymentService.isBookingsPaid();
      setIsBookingsPaid(bookingsPaid);
    } catch (error) {
      console.error('Error checking bookings_paid:', error);
      setIsBookingsPaid(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStripeStatus();
  }, [refreshStripeStatus]);

  return (
    <StripeContext.Provider
      value={{
        isStripeReady: false,
        isBookingsPaid,
        isLoading,
        initializePaymentSheet: async () => ({ error: 'Stripe SDK not available. Use a development build for payments.' }),
        presentPaymentSheet: async () => ({ error: 'Stripe SDK not available. Use a development build for payments.', success: false }),
        refreshStripeStatus,
      }}
    >
      {children}
    </StripeContext.Provider>
  );
}

/**
 * Main StripeProvider component
 * Wraps the app with Stripe SDK provider when publishable key is available
 */
export function StripeProvider({ children }: { children: ReactNode }) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStripeKey = async () => {
      try {
        // First try environment variable
        const envKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (envKey && envKey.startsWith('pk_')) {
          setPublishableKey(envKey);
          setIsLoading(false);
          return;
        }

        // Fall back to system_settings (Admin Panel configured)
        const key = await paymentService.getStripePublishableKey();
        if (key && key.startsWith('pk_')) {
          setPublishableKey(key);
        }
      } catch (error) {
        console.error('Error loading Stripe publishable key:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStripeKey();
  }, []);

  // Show children without Stripe if no key (payments disabled)
  if (isLoading) {
    return <>{children}</>;
  }

  if (!publishableKey || !isStripeAvailable || !StripeSDKProvider) {
    // Stripe SDK not available (Expo Go or no native module)
    // Still check isBookingsPaid from DB so booking requests use the paid flow
    return (
      <StripeNoSdkFallback>
        {children}
      </StripeNoSdkFallback>
    );
  }

  return (
    <StripeSDKProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.app.elmly" // For Apple Pay (optional)
      urlScheme="elmly" // For 3D Secure redirects
    >
      <StripeContextInner>{children}</StripeContextInner>
    </StripeSDKProvider>
  );
}

export default StripeProvider;
