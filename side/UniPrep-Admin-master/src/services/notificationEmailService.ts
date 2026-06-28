/**
 * Notification Email Service
 * Phase 3: Email & SMS Integration
 * 
 * Handles sending notification emails via Brevo SMTP (nodemailer)
 */

import nodemailer from 'nodemailer';
import { getEmailTemplate } from '@/lib/email/notificationEmailTemplates';

interface SendNotificationEmailParams {
  to: string;
  userName: string;
  notificationType: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  emailSubject?: string;
}

interface EmailResult {
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
 * Send notification email via Brevo SMTP
 */
export async function sendNotificationEmail(
  params: SendNotificationEmailParams
): Promise<EmailResult> {
  try {
    // Validate email configuration
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️ SMTP credentials not configured, skipping email');
      return { success: false, error: 'Email service not configured' };
    }

    if (!process.env.SMTP_FROM_EMAIL) {
      console.warn('⚠️ SMTP_FROM_EMAIL not configured, skipping email');
      return { success: false, error: 'From email not configured' };
    }

    // Prepare template data
    const templateData = {
      userName: params.userName,
      title: params.title,
      body: params.body,
      ...params.data,
    };

    // Get email template
    const template = getEmailTemplate(params.notificationType, templateData);

    // Use custom subject if provided (for multi-language support), otherwise use template subject
    const emailSubject = params.emailSubject || template.subject;

    // Send email via Brevo SMTP
    const transporter = createTransporter();
    const result = await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME || 'Elmly'} <${process.env.SMTP_FROM_EMAIL}>`,
      to: params.to,
      subject: emailSubject,
      html: template.html,
      text: template.text,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('❌ Error sending notification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send batch notification emails
 */
export async function sendBatchNotificationEmails(
  notifications: SendNotificationEmailParams[]
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  // Send emails sequentially to avoid rate limiting
  for (const notification of notifications) {
    const result = await sendNotificationEmail(notification);
    results.push(result);

    // Small delay between emails to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export const notificationEmailService = {
  sendNotificationEmail,
  sendBatchNotificationEmails,
  isValidEmail,
};
