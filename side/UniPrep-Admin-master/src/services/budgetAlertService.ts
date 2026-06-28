/**
 * Budget Alert Service
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Checks budgets and sends alerts when thresholds are exceeded
 */

import { supabaseAdmin } from '@/lib/supabase';
import { sendBudgetAlertEmail } from './emailService';

interface BudgetProfile {
  email: string;
}

interface BudgetWithProfile {
  alert_email: string | null;
  created_by: string;
  profiles: BudgetProfile | null;
}

interface BudgetAlertCheck {
  budget_id: string;
  budget_name: string;
  alert_type: string | null;
  current_spend: number;
  budget_limit: number;
  percentage_used: number;
  should_alert: boolean;
  alert_message: string | null;
}

interface AlertResult {
  checked: number;
  alertsSent: number;
  errors: string[];
}

/**
 * Check all budgets and send alerts if needed
 * This should be called periodically (e.g., every hour via cron job)
 */
export async function checkAndSendBudgetAlerts(): Promise<AlertResult> {
  const result: AlertResult = {
    checked: 0,
    alertsSent: 0,
    errors: [],
  };

  try {
    const supabase = supabaseAdmin;

    // Call the database function to check all budgets
    const { data: checks, error: checkError } = await supabase
      .rpc('check_budget_alerts') as { data: BudgetAlertCheck[] | null; error: any };

    if (checkError) {
      console.error('Error checking budget alerts:', checkError);
      result.errors.push(`Database error: ${checkError.message}`);
      return result;
    }

    if (!checks || checks.length === 0) {
      return result;
    }

    result.checked = checks.length;

    // Process each budget that needs an alert
    for (const check of checks) {
      if (!check.should_alert || !check.alert_type || !check.alert_message) {
        continue;
      }

      try {
        // Get budget details including alert email
        const { data: budget, error: budgetError } = await supabase
          .from('ai_budgets')
          .select('alert_email, created_by, profiles(email)')
          .eq('id', check.budget_id)
          .single();

        if (budgetError || !budget) {
          result.errors.push(`Failed to get budget ${check.budget_id}: ${budgetError?.message}`);
          continue;
        }

        const budgetData = budget as unknown as BudgetWithProfile;
        
        // Determine recipient email (budget alert_email or user's email)
        const recipientEmail = budgetData.alert_email || budgetData.profiles?.email;

        if (!recipientEmail) {
          result.errors.push(`No email configured for budget ${check.budget_name}`);
          
          // Still record the alert attempt
          await recordAlert(supabase, check, false, 'No email configured');
          continue;
        }

        // Send the alert email
        const emailResult = await sendBudgetAlertEmail({
          to: recipientEmail,
          budgetName: check.budget_name,
          alertType: check.alert_type as 'threshold_80' | 'threshold_95' | 'threshold_100' | 'hard_limit_triggered',
          currentSpend: check.current_spend,
          budgetLimit: check.budget_limit,
          percentageUsed: check.percentage_used,
          alertMessage: check.alert_message,
        });

        // Record the alert in database
        await recordAlert(
          supabase,
          check,
          emailResult.success,
          emailResult.error
        );

        if (emailResult.success) {
          result.alertsSent++;
        } else {
          result.errors.push(`Failed to send alert for ${check.budget_name}: ${emailResult.error}`);
          console.error(`❌ Failed to send alert for budget "${check.budget_name}":`, emailResult.error);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Error processing budget ${check.budget_name}: ${errorMessage}`);
        console.error(`Error processing budget ${check.budget_name}:`, error);
      }
    }

    return result;
  } catch (error) {
    console.error('Fatal error in checkAndSendBudgetAlerts:', error);
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}

/**
 * Record an alert in the database
 */
async function recordAlert(
  supabase: any,
  check: BudgetAlertCheck,
  emailSent: boolean,
  emailError?: string
): Promise<void> {
  try {
    // Extract threshold percentage from alert type
    const thresholdMap: Record<string, number> = {
      'threshold_80': 80,
      'threshold_95': 95,
      'threshold_100': 100,
      'hard_limit_triggered': 100,
    };

    const thresholdPercentage = thresholdMap[check.alert_type || ''] || 0;

    const { error } = await supabase.rpc('record_budget_alert', {
      p_budget_id: check.budget_id,
      p_alert_type: check.alert_type,
      p_threshold_percentage: thresholdPercentage,
      p_current_spend: check.current_spend,
      p_budget_limit: check.budget_limit,
      p_percentage_used: check.percentage_used,
      p_alert_message: check.alert_message,
      p_email_sent: emailSent,
      p_email_error: emailError || null,
    });

    if (error) {
      console.error('Error recording alert:', error);
    }
  } catch (error) {
    console.error('Error in recordAlert:', error);
  }
}

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

/**
 * Manual trigger for testing alerts
 */
export async function triggerTestAlert(budgetId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = supabaseAdmin;


    // Get budget details
    const { data: budget, error: budgetError } = await supabase
      .from('ai_budgets')
      .select('*')
      .eq('id', budgetId)
      .single();

    if (budgetError) {
      console.error('❌ Budget query error:', budgetError);
      return { success: false, error: `Database error: ${budgetError.message}` };
    }

    if (!budget) {
      console.error('❌ Budget not found with ID:', budgetId);
      return { success: false, error: 'Budget not found' };
    }


    // Get creator's email if alert_email is not set
    let recipientEmail = budget.alert_email;
    
    if (!recipientEmail && budget.created_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', budget.created_by)
        .single();
      
      recipientEmail = profile?.email;
    }

    if (!recipientEmail) {
      return { success: false, error: 'No email configured for this budget' };
    }

    // Send test alert
    const emailResult = await sendBudgetAlertEmail({
      to: recipientEmail,
      budgetName: budget.name,
      alertType: 'threshold_80',
      currentSpend: budget.budget_usd * 0.85,
      budgetLimit: budget.budget_usd,
      percentageUsed: 85.0,
      alertMessage: `TEST ALERT: This is a test notification for budget "${budget.name}". Your actual usage may differ.`,
    });

    return emailResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
