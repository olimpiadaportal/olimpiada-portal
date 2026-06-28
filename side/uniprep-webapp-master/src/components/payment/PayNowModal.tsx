'use client';

/**
 * PayNowModal.tsx — Phase 8B
 *
 * Payment modal for the pay-after-acceptance flow.
 * Used when teacher has accepted a booking and the student needs to pay.
 *
 * Differs from PaymentModal (upfront creation flow):
 * - Receives an existing bookingId (not new booking params)
 * - Calls getPaymentClientSecret() to fetch the PaymentIntent client_secret
 * - Calls completePayment() as an optimistic local update after Stripe confirms
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
import { useTranslation } from '@/lib/i18n/useTranslation';

interface PayNowModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful payment confirmation. Typically reloads the bookings list. */
  onSuccess: () => void;
  bookingId: string;
  teacherName: string;
}

export function PayNowModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  teacherName,
}: PayNowModalProps) {
  const { t } = useTranslation();
  const [stripe, setStripe] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [price, setPrice] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('EUR');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      initializePayment();
    } else {
      setClientSecret(null);
      setError(null);
      setIsLoading(true);
    }
  }, [isOpen, bookingId]);

  const initializePayment = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const publishableKey =
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
        (await paymentService.getStripePublishableKey());

      if (!publishableKey?.startsWith('pk_')) {
        throw new Error('Payment is not configured. Please try again later.');
      }

      const [stripeInstance, result] = await Promise.all([
        loadStripe(publishableKey),
        paymentService.getPaymentClientSecret(bookingId),
      ]);

      if (!result) {
        throw new Error('Failed to retrieve payment details. Please try again.');
      }

      // Webhook already processed this payment — close and refresh
      if (result.alreadyPaid) {
        onSuccess();
        return;
      }

      if (!result.clientSecret) {
        throw new Error('No payment is required for this booking.');
      }

      setStripe(stripeInstance);
      setClientSecret(result.clientSecret);
      if (result.price) setPrice(result.price);
      if (result.currency) setCurrency(result.currency.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuccess = async () => {
    // Optimistic local update — webhook handles the authoritative confirmation
    await paymentService.completePayment(bookingId);
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('payment.modal.title')}</DialogTitle>
          <DialogDescription>
            {t('payment.modal.description').replace('{teacherName}', teacherName)}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('payment.modal.loadingPayment')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-destructive text-center text-sm">{error}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={initializePayment}>{t('common.tryAgain')}</Button>
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
                amount={price}
                currency={currency}
                onSuccess={handleSuccess}
                onCancel={onClose}
                onError={(msg) => setError(msg)}
              />
            </Elements>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PayNowModal;
