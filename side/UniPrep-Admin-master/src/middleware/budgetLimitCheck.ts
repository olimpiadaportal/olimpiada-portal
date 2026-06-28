/**
 * Budget Hard Limit Middleware
 * Stage 5.5 - Phase 3: Hard Limit Enforcement
 * 
 * Checks if user is blocked by budget hard limits before allowing AI requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkUserHardLimit } from '@/services/budgetAlertQueries';

/**
 * Check if request should be blocked by budget hard limit
 * Call this before processing any AI request
 */
export async function checkBudgetLimit(
  userId: string
): Promise<{ 
  allowed: boolean; 
  error?: string; 
  budgetName?: string;
  currentSpend?: number;
  budgetLimit?: number;
  gracePeriodEnds?: Date;
}> {
  try {
    const limitCheck = await checkUserHardLimit(userId);

    if (limitCheck.isBlocked) {
      const errorMessage = formatBudgetLimitError(
        limitCheck.budgetName,
        limitCheck.currentSpend,
        limitCheck.budgetLimit,
        limitCheck.gracePeriodEnds
      );

      return {
        allowed: false,
        error: errorMessage,
        budgetName: limitCheck.budgetName,
        currentSpend: limitCheck.currentSpend,
        budgetLimit: limitCheck.budgetLimit,
        gracePeriodEnds: limitCheck.gracePeriodEnds,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking budget limit:', error);
    // Fail open - allow request if check fails
    return { allowed: true };
  }
}

/**
 * Middleware function to protect AI API routes
 * Add this to AI request handlers
 */
export async function budgetLimitMiddleware(
  request: NextRequest,
  userId: string
): Promise<NextResponse | null> {
  const limitCheck = await checkBudgetLimit(userId);

  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Budget limit exceeded',
        message: limitCheck.error,
        gracePeriodEnds: limitCheck.gracePeriodEnds,
        blocked: true,
      },
      { status: 402 } // 402 Payment Required
    );
  }

  return null; // Allow request to proceed
}

/**
 * Helper to format error message for users
 */
export function formatBudgetLimitError(
  budgetName?: string,
  currentSpend?: number,
  budgetLimit?: number,
  gracePeriodEnds?: Date
): string {
  let message = 'Your AI usage has exceeded the budget limit';

  if (budgetName) {
    message += ` for "${budgetName}"`;
  }

  if (currentSpend !== undefined && budgetLimit !== undefined) {
    message += `. Current spend: $${currentSpend.toFixed(2)} / $${budgetLimit.toFixed(2)}`;
  }

  if (gracePeriodEnds) {
    const now = new Date();
    if (gracePeriodEnds > now) {
      const hoursLeft = Math.ceil((gracePeriodEnds.getTime() - now.getTime()) / (1000 * 60 * 60));
      message += `. Grace period ends in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
    } else {
      message += '. Grace period has ended';
    }
  }

  message += '. Please contact your administrator to increase the budget or wait for the next billing period.';

  return message;
}
