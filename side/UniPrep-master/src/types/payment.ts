// Payment Infrastructure Types — Phase 8

export type TransactionType =
  | 'booking_payment'
  | 'teacher_earning'
  | 'platform_commission'
  | 'refund'
  | 'withdrawal'
  | 'subscription_charge'
  | 'top_up';

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export type PayoutStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';

export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused';

export type SubscriptionTierName = 'free' | 'plus' | 'pro';

// ── Wallet ────────────────────────────────────────────────────
export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
  total_earned: number;
  total_spent: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
}

// ── Transaction ───────────────────────────────────────────────
export interface Transaction {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  booking_id: string | null;
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  external_payment_id: string | null;
  external_payment_method: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  description: string | null;
  metadata: Record<string, any>;
  created_at: string;
  completed_at: string | null;
  idempotency_key: string | null;
}

// ── Payout Request ────────────────────────────────────────────
export interface PayoutRequest {
  id: string;
  teacher_id: string;
  amount: number;
  currency: string;
  bank_details_ref: string;
  status: PayoutStatus;
  processed_by: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Subscription Tier ─────────────────────────────────────────
export interface SubscriptionTier {
  id: string;
  name: SubscriptionTierName;
  display_name: string;
  display_name_az: string | null;
  display_name_ru: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  max_bookings_per_month: number | null;   // null = unlimited
  ai_explanations_limit: number | null;    // null = unlimited
  has_score_prediction: boolean;
  has_priority_matching: boolean;
  has_advanced_analytics: boolean;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  is_active: boolean;
  sort_order: number;
}

// ── User Subscription ─────────────────────────────────────────
export interface UserSubscription {
  id: string;
  user_id: string;
  tier_id: string;
  status: SubscriptionStatus;
  billing_cycle: 'monthly' | 'yearly' | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
  tier?: SubscriptionTier;
}

// ── Payout Request Input ──────────────────────────────────────
export interface CreatePayoutRequestInput {
  amount: number;
  bank_details_ref: string;
}
