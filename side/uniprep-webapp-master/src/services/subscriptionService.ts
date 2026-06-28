import { createClient } from '@/lib/supabase/client';
import { SubscriptionTier, UserSubscription, SubscriptionTierName } from '@/types/payment';

class SubscriptionService {
  private supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any { return this.supabase; }

  // ── Tiers ────────────────────────────────────────────────────

  async getTiers(): Promise<SubscriptionTier[]> {
    try {
      const { data, error } = await this.db
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data as SubscriptionTier[]) || [];
    } catch (error) {
      console.error('Get subscription tiers error:', error);
      return [];
    }
  }

  // ── User Subscription ────────────────────────────────────────

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const { data, error } = await this.db
        .from('user_subscriptions')
        .select(`*, tier:subscription_tiers(*)`)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as UserSubscription;
    } catch (error) {
      console.error('Get user subscription error:', error);
      return null;
    }
  }

  async getUserTierName(userId: string): Promise<SubscriptionTierName> {
    try {
      const sub = await this.getUserSubscription(userId);
      if (!sub || !sub.tier) return 'free';
      return sub.tier.name as SubscriptionTierName;
    } catch {
      return 'free';
    }
  }

  // ── Feature Gate Helpers ─────────────────────────────────────

  async canUseScorePrediction(userId: string): Promise<boolean> {
    const tier = await this.getUserTierName(userId);
    return tier === 'plus' || tier === 'pro';
  }

  async canBookTeacher(userId: string): Promise<{ allowed: boolean; remaining: number | null }> {
    try {
      const sub = await this.getUserSubscription(userId);
      const tier = sub?.tier;

      if (!tier || tier.max_bookings_per_month === null) {
        return { allowed: true, remaining: null };
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await this.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('student_user_id', userId)
        .gte('created_at', startOfMonth.toISOString())
        .not('status', 'eq', 'cancelled');

      const used = count || 0;
      const remaining = tier.max_bookings_per_month - used;
      return { allowed: remaining > 0, remaining };
    } catch {
      return { allowed: true, remaining: null };
    }
  }
}

export const subscriptionService = new SubscriptionService();
