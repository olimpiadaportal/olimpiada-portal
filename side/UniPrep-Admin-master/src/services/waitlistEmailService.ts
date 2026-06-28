/**
 * Waitlist Email Service
 * Processes waitlist invitation emails from waitlist_email_queue table
 * Uses existing Brevo SMTP infrastructure via notificationEmailService
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Lazy initialization to ensure env vars are loaded
let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error(`Supabase not configured: URL=${url ? 'set' : 'missing'}, KEY=${key ? 'set' : 'missing'}`);
    }
    
    _supabase = createClient(url, key);
  }
  return _supabase;
}

interface WaitlistEmail {
  id: string;
  subscriber_id: string;
  recipient_email: string;
  recipient_name: string | null;
  template_name: string;
  locale: string;
  metadata: Record<string, unknown>;
}

interface EmailTemplate {
  subject: string;
  body: string;
}

/**
 * Get locale-appropriate fallback for missing name
 * "there" works in English but not in other languages
 */
function getNameFallback(locale: string): string {
  const fallbacks: Record<string, string> = {
    en: 'there',      // "Hi there" - natural in English
    az: 'dostum',     // "Salam dostum" - "Hello my friend" in Azerbaijani
    ru: 'друг',       // "Привет друг" - "Hello friend" in Russian
  };
  return fallbacks[locale] || fallbacks['az']; // Default to Azerbaijani
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
 * Get email template from database
 * Waitlist templates use template_name column (e.g., 'waitlist_invitation_az')
 * and template_type = 'email'
 */
async function getEmailTemplate(templateName: string): Promise<EmailTemplate | null> {
  const { data, error } = await getSupabaseClient()
    .from('notification_templates')
    .select('subject, body')
    .eq('template_name', templateName)
    .eq('template_type', 'email')
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error(`Template ${templateName} not found:`, error);
    return null;
  }

  return data;
}

/**
 * Replace template variables with actual values
 */
function replaceVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

/**
 * Send a single waitlist email
 */
async function sendWaitlistEmail(email: WaitlistEmail): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate SMTP configuration
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM_EMAIL) {
      return { success: false, error: 'SMTP not configured' };
    }

    // Get template
    const template = await getEmailTemplate(email.template_name);
    if (!template) {
      return { success: false, error: `Template ${email.template_name} not found` };
    }

    // Prepare variables
    const signupLink = process.env.NEXT_PUBLIC_WEBAPP_URL 
      ? `${process.env.NEXT_PUBLIC_WEBAPP_URL}/signup`
      : 'https://elmly.az/signup';

    // Use locale-aware fallback for missing name
    const nameFallback = getNameFallback(email.locale);
    
    const variables: Record<string, string> = {
      name: email.recipient_name || nameFallback,
      signup_link: signupLink,
    };

    // Replace variables in template
    const subject = replaceVariables(template.subject, variables);
    const body = replaceVariables(template.body, variables);

    // Convert plain text body to simple HTML
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">Elmly</h1>
        </div>
        <div style="line-height: 1.6; color: #333;">
          ${body.split('\n').map(line => `<p style="margin: 10px 0;">${line}</p>`).join('')}
        </div>
        <div style="margin-top: 30px; text-align: center;">
          <a href="${signupLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Create Your Account
          </a>
        </div>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Elmly. All rights reserved.</p>
        </div>
      </div>
    `;

    // Send email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `${process.env.SMTP_FROM_NAME || 'Elmly'} <${process.env.SMTP_FROM_EMAIL}>`,
      to: email.recipient_email,
      subject: subject,
      html: htmlBody,
      text: body,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending waitlist email:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Process pending waitlist emails
 * Called by the notification processor API route
 */
export async function processWaitlistEmails(limit: number = 10): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0 };

  console.log('📧 [WaitlistEmail] Starting processWaitlistEmails...');
  console.log('📧 [WaitlistEmail] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('📧 [WaitlistEmail] Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');

  try {
    const supabase = getSupabaseClient();
    
    // Get pending emails using the RPC function (atomic claim)
    console.log('📧 [WaitlistEmail] Calling get_pending_waitlist_emails RPC...');
    const { data: emails, error } = await supabase.rpc('get_pending_waitlist_emails', {
      p_limit: limit
    });

    if (error) {
      console.error('❌ [WaitlistEmail] RPC Error:', error.message, error.code, error.details);
      return stats;
    }

    console.log('📧 [WaitlistEmail] RPC returned:', emails?.length ?? 0, 'emails');

    if (!emails || emails.length === 0) {
      console.log('📧 [WaitlistEmail] No pending emails to process');
      return stats;
    }

    console.log(`📧 Processing ${emails.length} waitlist emails...`);

    // Process each email
    for (const email of emails as WaitlistEmail[]) {
      stats.processed++;

      const result = await sendWaitlistEmail(email);

      // Update status in database
      await supabase.rpc('update_waitlist_email_status', {
        p_email_id: email.id,
        p_status: result.success ? 'sent' : 'failed',
        p_error_message: result.error || null
      });

      if (result.success) {
        stats.sent++;
        console.log(`✅ Sent waitlist invite to ${email.recipient_email}`);
      } else {
        stats.failed++;
        console.error(`❌ Failed to send to ${email.recipient_email}: ${result.error}`);
      }

      // Small delay between emails to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`📧 Waitlist emails: ${stats.sent} sent, ${stats.failed} failed`);
  } catch (error) {
    console.error('Error processing waitlist emails:', error);
  }

  return stats;
}

export const waitlistEmailService = {
  processWaitlistEmails,
  sendWaitlistEmail,
};
