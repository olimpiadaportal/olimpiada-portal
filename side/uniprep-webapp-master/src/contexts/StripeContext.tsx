'use client';

/**
 * StripeContext.tsx — Phase 8B
 * 
 * Provides Stripe SDK initialization for the web app.
 * Only initializes when bookings_paid = true in system_settings.
 * 
 * Security:
 * - Publishable key fetched from system_settings (set via Admin Panel) or env
 * - Secret key never exposed to client (only in Supabase Edge Functions)
 * - Stripe Elements handles PCI compliance
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { paymentService } from '@/services/paymentService';

interface StripeContextType {
  stripe: Stripe | null;
  isStripeReady: boolean;
  isBookingsPaid: boolean;
  isLoading: boolean;
  refreshStripeStatus: () => Promise<void>;
}

const StripeContext = createContext<StripeContextType>({
  stripe: null,
  isStripeReady: false,
  isBookingsPaid: false,
  isLoading: true,
  refreshStripeStatus: async () => {},
});

export const useStripeContext = () => useContext(StripeContext);

/**
 * Main StripeProvider component
 * Wraps the app with Stripe Elements provider when publishable key is available
 */
export function StripeProvider({ children }: { children: ReactNode }) {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [isStripeReady, setIsStripeReady] = useState(false);
  const [isBookingsPaid, setIsBookingsPaid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStripeStatus = useCallback(async () => {
    try {
      const bookingsPaid = await paymentService.isBookingsPaid();
      setIsBookingsPaid(bookingsPaid);
    } catch (error) {
      console.error('Error checking Stripe status:', error);
      setIsBookingsPaid(false);
    }
  }, []);

  useEffect(() => {
    const initStripe = async () => {
      try {
        // First try environment variable
        let publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        
        // Fall back to system_settings (Admin Panel configured)
        if (!publishableKey || !publishableKey.startsWith('pk_')) {
          publishableKey = await paymentService.getStripePublishableKey();
        }

        if (publishableKey && publishableKey.startsWith('pk_')) {
          const stripeInstance = await loadStripe(publishableKey);
          setStripe(stripeInstance);
          setIsStripeReady(true);
        }

        // Check if bookings are paid
        await refreshStripeStatus();
      } catch (error) {
        console.error('Error initializing Stripe:', error);
        setIsStripeReady(false);
      } finally {
        setIsLoading(false);
      }
    };

    initStripe();
  }, [refreshStripeStatus]);

  const contextValue: StripeContextType = {
    stripe,
    isStripeReady,
    isBookingsPaid,
    isLoading,
    refreshStripeStatus,
  };

  // If Stripe is ready, wrap children with Elements provider
  if (stripe) {
    return (
      <StripeContext.Provider value={contextValue}>
        <Elements stripe={stripe} options={{
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#2563EB', // Elmly blue
              colorBackground: '#FFFFFF',
              colorText: '#111827',
              colorDanger: '#EF4444',
              fontFamily: 'system-ui, sans-serif',
              borderRadius: '8px',
            },
          },
        }}>
          {children}
        </Elements>
      </StripeContext.Provider>
    );
  }

  // No Stripe - provide context without Elements wrapper
  return (
    <StripeContext.Provider value={contextValue}>
      {children}
    </StripeContext.Provider>
  );
}

export default StripeProvider;
