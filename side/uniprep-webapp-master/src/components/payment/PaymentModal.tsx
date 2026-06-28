'use client';

/**
 * PaymentModal.tsx — Phase 8B
 * 
 * Modal wrapper for the payment checkout flow.
 * Fetches client secret and displays Stripe Elements.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { PaymentCheckout } from './PaymentCheckout';
import { paymentService } from '@/services/paymentService';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
  bookingParams: {
    teacherId: string;
    subjectId: string;
    scheduledDate: string;
    scheduledTime: string;
    durationHours: number;
    sessionMethod: string;
    serviceType: string;
    location?: string;
    notes?: string;
  };
  teacherName: string;
  estimatedPrice: number;
}

export function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  bookingParams,
  teacherName,
  estimatedPrice,
}: PaymentModalProps) {
  const [stripe, setStripe] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualPrice, setActualPrice] = useState<number>(estimatedPrice);

  useEffect(() => {
    if (isOpen) {
      initializePayment();
    } else {
      // Reset state when modal closes
      setClientSecret(null);
      setBookingId(null);
      setError(null);
      setIsLoading(true);
    }
  }, [isOpen]);

  const initializePayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load Stripe
      const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
        await paymentService.getStripePublishableKey();
      
      if (!publishableKey || !publishableKey.startsWith('pk_')) {
        throw new Error('Stripe is not configured');
      }

      const stripeInstance = await loadStripe(publishableKey);
      setStripe(stripeInstance);

      // Create payment intent via Edge Function
      const result = await paymentService.initiateBookingPayment(bookingParams);

      if (!result) {
        throw new Error('Failed to initialize payment');
      }

      const { bookingId: newBookingId, clientSecret: secret, price } = result as any;

      if (!secret) {
        // Free booking - no payment needed
        onSuccess(newBookingId);
        return;
      }

      setBookingId(newBookingId);
      setClientSecret(secret);
      setActualPrice(price || estimatedPrice);
    } catch (err) {
      console.error('Payment initialization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = () => {
    if (bookingId) {
      onSuccess(bookingId);
    }
    onClose();
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription>
            Pay for your session with {teacherName}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-gray-600">Preparing payment...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
              <p className="text-red-600 text-center">{error}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={initializePayment}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : stripe && clientSecret ? (
            <Elements
              stripe={stripe}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#2563EB',
                    colorBackground: '#FFFFFF',
                    colorText: '#111827',
                    colorDanger: '#EF4444',
                    fontFamily: 'system-ui, sans-serif',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <PaymentCheckout
                clientSecret={clientSecret}
                amount={actualPrice}
                onSuccess={handleSuccess}
                onCancel={onClose}
                onError={handleError}
              />
            </Elements>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentModal;
