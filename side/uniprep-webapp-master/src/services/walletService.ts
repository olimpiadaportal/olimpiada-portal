import { createClient } from '@/lib/supabase/client';
import {
  Wallet,
  Transaction,
  PayoutRequest,
  CreatePayoutRequestInput,
} from '@/types/payment';

class WalletService {
  private supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any { return this.supabase; }

  // ── Wallet ──────────────────────────────────────────────────

  async getWallet(userId: string): Promise<Wallet | null> {
    try {
      const { data, error } = await this.db
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as Wallet;
    } catch (error) {
      console.error('Get wallet error:', error);
      return null;
    }
  }

  // ── Transactions ────────────────────────────────────────────

  async getTransactions(
    userId: string,
    limit = 50,
    type?: Transaction['type']
  ): Promise<Transaction[]> {
    try {
      let query = this.db
        .from('transactions')
        .select('*')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (type) query = query.eq('type', type);

      const { data, error } = await query;
      if (error) throw error;
      return (data as Transaction[]) || [];
    } catch (error) {
      console.error('Get transactions error:', error);
      return [];
    }
  }

  async getEarnings(userId: string, limit = 50): Promise<Transaction[]> {
    return this.getTransactions(userId, limit, 'teacher_earning');
  }

  async getSpending(userId: string, limit = 50): Promise<Transaction[]> {
    return this.getTransactions(userId, limit, 'booking_payment');
  }

  // ── Payout Requests ─────────────────────────────────────────

  async getPayoutRequests(teacherId: string): Promise<PayoutRequest[]> {
    try {
      const { data, error } = await this.db
        .from('payout_requests')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as PayoutRequest[]) || [];
    } catch (error) {
      console.error('Get payout requests error:', error);
      return [];
    }
  }

  async createPayoutRequest(
    teacherId: string,
    input: CreatePayoutRequestInput
  ): Promise<PayoutRequest | null> {
    try {
      const { data: teacherRow } = await this.db
        .from('teachers')
        .select('user_id')
        .eq('id', teacherId)
        .single();

      if (!teacherRow) throw new Error('Teacher not found');

      const wallet = await this.getWallet(teacherRow.user_id);
      if (!wallet) throw new Error('No wallet found');

      const { data: setting } = await this.db
        .from('system_settings')
        .select('value')
        .eq('key', 'min_payout_amount')
        .single();

      const minPayout = setting ? parseFloat(JSON.parse(setting.value)) : 50;

      if (wallet.balance < input.amount) {
        throw new Error(`Insufficient balance. Available: ${wallet.balance}`);
      }
      if (input.amount < minPayout) {
        throw new Error(`Minimum payout amount is ${minPayout}`);
      }

      const { data, error } = await this.db
        .from('payout_requests')
        .insert({
          teacher_id: teacherId,
          amount: input.amount,
          currency: wallet.currency,
          bank_details_ref: input.bank_details_ref,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as PayoutRequest;
    } catch (error) {
      console.error('Create payout request error:', error);
      throw error;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  formatAmount(amount: number, currency = 'EUR'): string {
    try {
      return new Intl.NumberFormat('en-EU', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
}

export const walletService = new WalletService();
