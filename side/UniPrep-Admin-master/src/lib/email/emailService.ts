// Email Service for Report Delivery
// Uses Brevo SMTP via nodemailer

import nodemailer from 'nodemailer';

// Create transporter only on server-side
let transporter: nodemailer.Transporter | null = null;

if (typeof window === 'undefined' && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export interface EmailOptions {
  to: string[];
  subject: string;
  body: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
}

export interface ReportEmailOptions {
  recipients: string[];
  reportName: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  format: 'pdf' | 'excel' | 'csv';
  fileBuffer: Buffer;
  fileName: string;
}

class EmailService {
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || '';
    this.fromName = process.env.SMTP_FROM_NAME || 'Elmly Analytics';
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return !!transporter && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  }

  /**
   * Send report via email
   */
  async sendReport(options: ReportEmailOptions): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Email service not configured. Please set SMTP_USER and SMTP_PASS in environment variables.',
      };
    }

    try {
      const emailBody = this.generateReportEmailHTML(options);

      await transporter!.sendMail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.recipients.join(', '),
        subject: `${options.reportName} - ${options.dateRange.startDate} to ${options.dateRange.endDate}`,
        html: emailBody,
        attachments: [
          {
            filename: options.fileName,
            content: options.fileBuffer,
          },
        ],
      });

      return { success: true };
    } catch (error) {
      console.error('Send report email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Email service not configured.',
      };
    }

    try {
      await transporter!.sendMail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: to,
        subject: 'Elmly Analytics - Test Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Email Service Test</h2>
            <p>This is a test email from Elmly Analytics reporting system.</p>
            <p>If you received this email, your email configuration is working correctly!</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              This email was sent from Elmly Admin Panel
            </p>
          </div>
        `,
      });

      return { success: true };
    } catch (error) {
      console.error('Send test email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send test email',
      };
    }
  }

  /**
   * Generate HTML email body for report
   */
  private generateReportEmailHTML(options: ReportEmailOptions): string {
    const formatLabel = {
      pdf: 'PDF',
      excel: 'Excel',
      csv: 'CSV',
    }[options.format];

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header -->
            <div style="background-color: #2563eb; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">
                📊 Elmly Analytics Report
              </h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #1f2937; margin-top: 0;">
                ${options.reportName}
              </h2>
              
              <p style="color: #4b5563; line-height: 1.6;">
                Your analytics report is ready! Please find the attached ${formatLabel} file with detailed insights for the selected period.
              </p>

              <!-- Report Details -->
              <div style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #374151;">
                  <strong>Report Period:</strong><br>
                  ${new Date(options.dateRange.startDate).toLocaleDateString()} - ${new Date(options.dateRange.endDate).toLocaleDateString()}
                </p>
                <p style="margin: 5px 0; color: #374151;">
                  <strong>Format:</strong> ${formatLabel}
                </p>
                <p style="margin: 5px 0; color: #374151;">
                  <strong>Generated:</strong> ${new Date().toLocaleString()}
                </p>
              </div>

              <p style="color: #4b5563; line-height: 1.6;">
                The report includes:
              </p>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>Student engagement metrics</li>
                <li>Performance analytics</li>
                <li>Exam results and completion rates</li>
                <li>Detailed data tables</li>
              </ul>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://admin.elmly.app'}/reports" 
                   style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  View More Reports
                </a>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">
                This is an automated email from Elmly Analytics
              </p>
              <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">
                © ${new Date().getFullYear()} Elmly. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Send scheduled report notification
   */
  async sendScheduledReportNotification(
    recipients: string[],
    reportName: string,
    nextRunDate: Date
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Email service not configured.' };
    }

    try {
      await transporter!.sendMail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: recipients.join(', '),
        subject: `Scheduled Report Confirmed: ${reportName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Scheduled Report Confirmed</h2>
            <p>Your scheduled report "<strong>${reportName}</strong>" has been set up successfully.</p>
            <p><strong>Next Report:</strong> ${nextRunDate.toLocaleString()}</p>
            <p>You will receive the report automatically at the scheduled time.</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              You can manage your scheduled reports in the Elmly Admin Panel
            </p>
          </div>
        `,
      });

      return { success: true };
    } catch (error) {
      console.error('Send notification error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send notification',
      };
    }
  }
}

export const emailService = new EmailService();
