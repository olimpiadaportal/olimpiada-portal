/**
 * Email Service
 * Stage 5.5 - Phase 3: Budget Alerts
 * 
 * Handles sending email notifications for budget alerts
 * Uses Brevo SMTP via nodemailer
 */

import nodemailer from 'nodemailer';

interface BudgetAlertEmail {
  to: string;
  budgetName: string;
  alertType: 'threshold_80' | 'threshold_95' | 'threshold_100' | 'hard_limit_triggered';
  currentSpend: number;
  budgetLimit: number;
  percentageUsed: number;
  alertMessage: string;
}

interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Create nodemailer transporter for Brevo SMTP
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send budget alert email
 */
export async function sendBudgetAlertEmail(alert: BudgetAlertEmail): Promise<EmailResponse> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('SMTP credentials not configured');
      return {
        success: false,
        error: 'Email service not configured',
      };
    }

    // Determine email subject and priority based on alert type
    let subject: string;
    let priority: 'high' | 'normal';
    
    switch (alert.alertType) {
      case 'threshold_100':
        subject = `🚨 CRITICAL: Budget "${alert.budgetName}" Exceeded`;
        priority = 'high';
        break;
      case 'threshold_95':
        subject = `⚠️ WARNING: Budget "${alert.budgetName}" at ${alert.percentageUsed.toFixed(1)}%`;
        priority = 'high';
        break;
      case 'threshold_80':
        subject = `📊 NOTICE: Budget "${alert.budgetName}" at ${alert.percentageUsed.toFixed(1)}%`;
        priority = 'normal';
        break;
      case 'hard_limit_triggered':
        subject = `🛑 URGENT: AI Features Disabled - Budget "${alert.budgetName}" Hard Limit Reached`;
        priority = 'high';
        break;
      default:
        subject = `Budget Alert: ${alert.budgetName}`;
        priority = 'normal';
    }

    // Generate email HTML
    const html = generateAlertEmailHTML(alert);

    // Send email via Brevo SMTP
    const transporter = createTransporter();
    const result = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME || 'Elmly'} <${process.env.SMTP_FROM_EMAIL}>`,
      to: alert.to,
      subject: subject,
      html: html,
      headers: {
        'X-Priority': priority === 'high' ? '1' : '3',
      },
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('Error sending budget alert email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate HTML email content for budget alert
 */
function generateAlertEmailHTML(alert: BudgetAlertEmail): string {
  const percentageColor = 
    alert.percentageUsed >= 100 ? '#DC2626' : // Red
    alert.percentageUsed >= 95 ? '#F59E0B' :  // Orange
    alert.percentageUsed >= 80 ? '#3B82F6' :  // Blue
    '#10B981'; // Green

  const icon = 
    alert.alertType === 'threshold_100' || alert.alertType === 'hard_limit_triggered' ? '🚨' :
    alert.alertType === 'threshold_95' ? '⚠️' :
    '📊';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Budget Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">
                Budget Alert
              </h1>
            </td>
          </tr>

          <!-- Alert Message -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <div style="background-color: ${alert.percentageUsed >= 100 ? '#FEE2E2' : alert.percentageUsed >= 95 ? '#FEF3C7' : '#DBEAFE'}; border-left: 4px solid ${percentageColor}; padding: 16px; border-radius: 4px;">
                <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.5;">
                  ${alert.alertMessage}
                </p>
              </div>
            </td>
          </tr>

          <!-- Budget Details -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 20px;">
                <tr>
                  <td style="padding: 8px 0;">
                    <strong style="color: #6b7280; font-size: 14px;">Budget Name:</strong>
                    <div style="color: #111827; font-size: 16px; margin-top: 4px;">${alert.budgetName}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <strong style="color: #6b7280; font-size: 14px;">Current Spend:</strong>
                    <div style="color: #111827; font-size: 20px; font-weight: 600; margin-top: 4px;">$${alert.currentSpend.toFixed(4)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <strong style="color: #6b7280; font-size: 14px;">Budget Limit:</strong>
                    <div style="color: #111827; font-size: 16px; margin-top: 4px;">$${alert.budgetLimit.toFixed(2)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;">
                    <strong style="color: #6b7280; font-size: 14px;">Usage:</strong>
                    <div style="margin-top: 8px;">
                      <div style="background-color: #e5e7eb; height: 24px; border-radius: 12px; overflow: hidden;">
                        <div style="background-color: ${percentageColor}; height: 100%; width: ${Math.min(alert.percentageUsed, 100)}%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 600;">
                          ${alert.percentageUsed.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Required -->
          ${alert.percentageUsed >= 95 ? `
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #92400E;">
                  ⚡ Action Required
                </h3>
                <p style="margin: 0; font-size: 14px; color: #78350F; line-height: 1.5;">
                  ${alert.alertType === 'hard_limit_triggered' 
                    ? 'AI features have been disabled to prevent further spending. Please review your budget or increase the limit to re-enable AI features.'
                    : 'Please review your AI usage and consider increasing the budget limit or optimizing usage to avoid service interruption.'
                  }
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 40px 40px; text-align: center;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://admin.elmly.app'}/ai-management/costs" 
                 style="display: inline-block; background-color: #2563EB; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                View Cost Dashboard
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                This is an automated alert from Elmly Admin Panel.<br>
                To configure alert settings, visit the Cost Management dashboard.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Test email service (for development)
 */
export async function sendTestEmail(to: string): Promise<EmailResponse> {
  return sendBudgetAlertEmail({
    to,
    budgetName: 'Test Budget',
    alertType: 'threshold_80',
    currentSpend: 8.50,
    budgetLimit: 10.00,
    percentageUsed: 85.0,
    alertMessage: 'This is a test alert to verify email configuration.',
  });
}
