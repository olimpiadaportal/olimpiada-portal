import { supabase } from './supabase';

export type TeacherSubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'paused'
  | 'cancelled'
  | 'incomplete_expired';

export interface TeacherSubscription {
  id: string;
  student_id: string;
  teacher_id: string;
  status: TeacherSubscriptionStatus;
  monthly_amount: number;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  ended_at: string | null;
  last_payment_at: string | null;
  last_payment_failed_at: string | null;
}

export interface TeacherSubscriptionPublicConfig {
  subscriptionsEnabled: boolean;
  currency: string;
}

export interface StudentTeacherSubscription
  extends Omit<TeacherSubscription, 'id' | 'student_id'> {
  subscription_id: string;
  teacher_user_id: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  subject_id: string | null;
  subject_name_en: string | null;
  subject_name_az: string | null;
  created_at: string;
}

export interface TeacherSubscriber
  extends Omit<TeacherSubscription, 'id' | 'teacher_id'> {
  subscription_id: string;
  student_user_id: string;
  student_name: string;
  student_avatar_url: string | null;
  subject_id: string | null;
  subject_name_en: string | null;
  subject_name_az: string | null;
  created_at: string;
}

export interface TeacherSubscriptionPayment {
  id: string;
  amount: number;
  currency: string;
  type: 'subscription_charge' | 'refund';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  subscriptionId: string | null;
  completedAt: string | null;
  createdAt: string;
}

const parseBooleanSetting = (value: unknown): boolean => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false' || value == null) return false;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;

    try {
      return JSON.parse(value) === true;
    } catch {
      return false;
    }
  }

  return false;
};

const parseCurrencySetting = (value: unknown): string => {
  if (typeof value !== 'string') return 'AZN';

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string' && parsed.trim()) {
      return parsed.trim().toUpperCase();
    }
  } catch {
    // Supabase JSONB string settings usually arrive already unwrapped.
  }

  return value.trim() ? value.trim().toUpperCase() : 'AZN';
};

class TeacherSubscriptionService {
  private async readSettingValue(key: string): Promise<unknown> {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    return data?.value;
  }

  async getPublicConfig(): Promise<TeacherSubscriptionPublicConfig> {
    try {
      const { data, error } = await supabase.rpc('get_teacher_subscription_public_config');

      if (!error && data) {
        const payload = Array.isArray(data) ? data[0] : data;
        return {
          subscriptionsEnabled: parseBooleanSetting(
            payload?.subscriptions_enabled ?? payload?.subscriptionsEnabled
          ),
          currency: parseCurrencySetting(payload?.currency),
        };
      }
    } catch {
      // Fall back to row-level reads for older local databases before hotfix 110.
    }

    try {
      const [enabledValue, currencyValue] = await Promise.all([
        this.readSettingValue('subscriptions_enabled'),
        this.readSettingValue('currency'),
      ]);

      return {
        subscriptionsEnabled: parseBooleanSetting(enabledValue),
        currency: parseCurrencySetting(currencyValue),
      };
    } catch {
      return {
        subscriptionsEnabled: false,
        currency: 'AZN',
      };
    }
  }

  async getBillingCurrency(): Promise<string> {
    const config = await this.getPublicConfig();
    return config.currency;
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getPublicConfig();
    return config.subscriptionsEnabled;
  }

  async getForTeacher(teacherId: string): Promise<TeacherSubscription | null> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;

    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!student) return null;

    const { data, error } = await supabase
      .from('teacher_subscriptions')
      .select(`
        id,
        student_id,
        teacher_id,
        status,
        monthly_amount,
        currency,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        cancelled_at,
        ended_at,
        last_payment_at,
        last_payment_failed_at
      `)
      .eq('student_id', student.id)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as TeacherSubscription | null;
  }

  async getMySubscriptions(): Promise<StudentTeacherSubscription[]> {
    const { data, error } = await supabase.rpc('get_my_teacher_subscriptions');
    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      monthly_amount: Number(item.monthly_amount || 0),
      currency: String(item.currency || 'AZN').toUpperCase(),
    })) as StudentTeacherSubscription[];
  }

  async getMySubscribers(): Promise<TeacherSubscriber[]> {
    const { data, error } = await supabase.rpc('get_my_teacher_subscribers');
    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      monthly_amount: Number(item.monthly_amount || 0),
      currency: String(item.currency || 'AZN').toUpperCase(),
    })) as TeacherSubscriber[];
  }

  async getMyPayments(): Promise<TeacherSubscriptionPayment[]> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, currency, type, status, metadata, completed_at, created_at')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .in('type', ['subscription_charge', 'refund'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((item: any) => ({
      id: item.id,
      amount: Number(item.amount || 0),
      currency: String(item.currency || 'AZN').toUpperCase(),
      type: item.type,
      status: item.status,
      subscriptionId: item.metadata?.teacher_subscription_id || null,
      completedAt: item.completed_at,
      createdAt: item.created_at,
    }));
  }

  async create(teacherId: string): Promise<{
    subscription: TeacherSubscription;
    clientSecret: string | null;
    alreadyExists: boolean;
  }> {
    const { data, error } = await supabase.functions.invoke('create-teacher-subscription', {
      body: { teacherId },
    });
    if (error) throw error;
    if (!data?.subscription) throw new Error(data?.error || 'Subscription could not be created');
    return data;
  }

  async reconcile(teacherId: string): Promise<TeacherSubscription> {
    const result = await this.create(teacherId);
    return result.subscription;
  }

  async cancelAtPeriodEnd(teacherId: string): Promise<TeacherSubscription> {
    const { data, error } = await supabase.functions.invoke('cancel-teacher-subscription', {
      body: { teacherId },
    });
    if (error) throw error;
    if (!data?.subscription) throw new Error(data?.error || 'Subscription could not be cancelled');
    return data.subscription;
  }

  async resumeRenewal(teacherId: string): Promise<TeacherSubscription> {
    const { data, error } = await supabase.functions.invoke('resume-teacher-subscription', {
      body: { teacherId },
    });
    if (error) throw error;
    if (!data?.subscription) throw new Error(data?.error || 'Subscription could not be resumed');
    return data.subscription;
  }

  async abandonUnpaid(subscriptionId: string): Promise<TeacherSubscription> {
    const { data, error } = await supabase.functions.invoke('abandon-teacher-subscription', {
      body: { subscriptionId },
    });
    if (error) throw error;
    if (!data?.subscription) {
      throw new Error(data?.error || 'Unpaid subscription could not be removed');
    }
    return data.subscription;
  }
}

export const teacherSubscriptionService = new TeacherSubscriptionService();
