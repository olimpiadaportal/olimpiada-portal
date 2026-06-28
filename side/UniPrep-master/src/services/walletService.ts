import { supabase } from './supabase';
import {
  Wallet,
  Transaction,
  PayoutRequest,
  CreatePayoutRequestInput,
} from '../types/payment';

class WalletService {
  // ── Wallet ──────────────────────────────────────────────────

  async getWallet(userId: string): Promise<Wallet | null> {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No wallet yet
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
      let query = supabase
        .from('transactions')
        .select('*')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (type) {
        query = query.eq('type', type);
      }

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
      const { data, error } = await supabase
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
      // Validate: fetch teacher's wallet balance
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('user_id')
        .eq('id', teacherId)
        .single();

      if (!teacherRow) throw new Error('Teacher not found');

      const wallet = await this.getWallet(teacherRow.user_id);
      if (!wallet) throw new Error('No wallet found');

      // Fetch min payout amount from system_settings
      const { data: setting } = await supabase
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

      const { data, error } = await supabase
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
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  formatNumber(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }
}

export const walletService = new WalletService();
