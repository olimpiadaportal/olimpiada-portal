import { supabase } from './supabase';
import { SubscriptionTier, UserSubscription, SubscriptionTierName } from '../types/payment';
import i18n from '../i18n';

class SubscriptionService {
  // ── Tiers ────────────────────────────────────────────────────

  async getTiers(): Promise<SubscriptionTier[]> {
    try {
      const { data, error } = await supabase
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

  getTierDisplayName(tier: SubscriptionTier): string {
    const lang = i18n.language;
    if (lang === 'az' && tier.display_name_az) return tier.display_name_az;
    if (lang === 'ru' && tier.display_name_ru) return tier.display_name_ru;
    return tier.display_name;
  }

  // ── User Subscription ────────────────────────────────────────

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          tier:subscription_tiers(*)
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No subscription
        throw error;
      }
      return data as UserSubscription;
    } catch (error) {
      console.error('Get user subscription error:', error);
      return null;
    }
  }

  // Returns the user's current tier name, defaulting to 'free'
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
  // These are used to check if a feature is available for the user's tier.
  // All return true for now (subscriptions not yet billed), but are
  // structured for easy activation in Phase 8C.

  async canUseScorePrediction(userId: string): Promise<boolean> {
    const tier = await this.getUserTierName(userId);
    return tier === 'plus' || tier === 'pro';
  }

  async canBookTeacher(userId: string): Promise<{ allowed: boolean; remaining: number | null }> {
    try {
      const sub = await this.getUserSubscription(userId);
      const tier = sub?.tier;

      // No limit on free tier for now (bookings are free at launch)
      if (!tier || tier.max_bookings_per_month === null) {
        return { allowed: true, remaining: null };
      }

      // Count bookings this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
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

  async getAiExplanationsRemaining(userId: string): Promise<number | null> {
    try {
      const sub = await this.getUserSubscription(userId);
      const tier = sub?.tier;
      if (!tier || tier.ai_explanations_limit === null) return null; // unlimited

      // Count AI explanations used this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('ai_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('feature_type', 'explanation')
        .gte('created_at', startOfMonth.toISOString());

      const used = count || 0;
      return Math.max(tier.ai_explanations_limit - used, 0);
    } catch {
      return null;
    }
  }
}

export const subscriptionService = new SubscriptionService();
