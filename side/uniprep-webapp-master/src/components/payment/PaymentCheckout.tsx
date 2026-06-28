'use client';

/**
 * PaymentCheckout.tsx — Phase 8B
 * 
 * Stripe Payment Element checkout component for booking payments.
 * Uses Stripe Elements for PCI-compliant card collection.
 */

import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface PaymentCheckoutProps {
  clientSecret: string;
  amount: number;
  currency?: string;
  onSuccess: () => void;
  onCancel: () => void;
  onError: (error: string) => void;
}

export function PaymentCheckout({
  clientSecret,
  amount,
  currency = 'EUR',
  onSuccess,
  onCancel,
  onError,
}: PaymentCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('processing');
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/student/bookings?payment=success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setPaymentStatus('error');
        setErrorMessage(error.message || 'Payment failed');
        onError(error.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        setPaymentStatus('success');
        setTimeout(() => onSuccess(), 2000);
      } else if (paymentIntent && paymentIntent.status === 'requires_action') {
        // 3D Secure or other action required - Stripe handles this
        setPaymentStatus('processing');
      } else {
        setPaymentStatus('error');
        setErrorMessage('Unexpected payment status');
        onError('Unexpected payment status');
      }
    } catch (err) {
      setPaymentStatus('error');
      const message = err instanceof Error ? err.message : 'Payment failed';
      setErrorMessage(message);
      onError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (paymentStatus === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500" />
        <h3 className="text-xl font-semibold text-gray-900">{t('payment.modal.paymentSuccess')}</h3>
        <p className="text-gray-600 text-center">
          {t('payment.modal.paymentSuccessDesc')}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Amount Display */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">{t('payment.modal.totalAmount')}</span>
          <span className="text-2xl font-bold text-primary">
            {formatCurrency(amount)}
          </span>
        </div>
      </div>

      {/* Stripe Payment Element */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card'],
          }}
        />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isProcessing}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || !elements || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('payment.modal.processing')}
            </>
          ) : (
            t('payment.modal.payButton').replace('{amount}', formatCurrency(amount))
          )}
        </Button>
      </div>

      {/* Security Note */}
      <p className="text-xs text-gray-500 text-center">
        🔒 {t('payment.modal.securityNote')}
      </p>
    </form>
  );
}

export default PaymentCheckout;
