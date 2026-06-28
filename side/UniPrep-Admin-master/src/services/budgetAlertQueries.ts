/**
 * Budget Alert Queries (Client-Safe)
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Client-safe query functions that do NOT import nodemailer.
 * For email-sending functions, see budgetAlertService.ts (server-only).
 */

import { supabaseAdmin } from '@/lib/supabase';

/**
 * Get alert history for a specific budget or all budgets
 */
export async function getBudgetAlertHistory(
  budgetId?: string,
  days: number = 30
) {
  try {
    const supabase = supabaseAdmin;

    const { data, error } = await supabase.rpc('get_budget_alert_history', {
      p_budget_id: budgetId || null,
      p_days: days,
    });

    if (error) {
      console.error('Error getting alert history:', error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getBudgetAlertHistory:', error);
    return { 
      data: null, 
      error: { message: error instanceof Error ? error.message : 'Unknown error' } 
    };
  }
}

/**
 * Check if a user is blocked by hard limit
 * This should be called before allowing AI API calls
 */
export async function checkUserHardLimit(userId: string): Promise<{
  isBlocked: boolean;
  budgetName?: string;
  currentSpend?: number;
  budgetLimit?: number;
  gracePeriodEnds?: Date;
}> {
  try {
    const supabase = supabaseAdmin;

    const { data, error } = await supabase
      .rpc('check_hard_limit', { p_user_id: userId })
      .single() as { 
        data: {
          is_blocked: boolean;
          budget_name: string | null;
          current_spend: number | null;
          budget_limit: number | null;
          grace_period_ends: string | null;
        } | null; 
        error: any 
      };

    if (error) {
      console.error('Error checking hard limit:', error);
      // On error, allow access (fail open)
      return { isBlocked: false };
    }

    if (!data) {
      return { isBlocked: false };
    }

    return {
      isBlocked: data.is_blocked,
      budgetName: data.budget_name || undefined,
      currentSpend: data.current_spend || undefined,
      budgetLimit: data.budget_limit || undefined,
      gracePeriodEnds: data.grace_period_ends ? new Date(data.grace_period_ends) : undefined,
    };
  } catch (error) {
    console.error('Error in checkUserHardLimit:', error);
    // On error, allow access (fail open)
    return { isBlocked: false };
  }
}
