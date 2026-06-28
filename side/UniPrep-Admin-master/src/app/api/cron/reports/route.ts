// API Route for Scheduled Reports Cron Job
// This endpoint should be called by a cron service (Vercel Cron, AWS EventBridge, etc.)

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { reportService } from '@/services/reportService';
import { emailService } from '@/lib/email/emailService';
import { analyticsService } from '@/services/analyticsService';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }


    // Get due scheduled reports from database
    const { data: dueReports, error } = await supabase.rpc('get_due_scheduled_reports');

    if (error) {
      console.error('[Cron] Error fetching due reports:', error);
      return NextResponse.json(
        { error: 'Failed to fetch due reports' },
        { status: 500 }
      );
    }

    if (!dueReports || dueReports.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No due reports',
        processed: 0,
      });
    }


    const results = [];

    // Process each due report
    for (const report of dueReports) {
      try {

        // Determine date range based on frequency
        const dateRange = getDateRangeForFrequency(report.frequency);

        // Generate report
        const reportData = await reportService.generateReport(
          report.template_id,
          dateRange,
          'system' // System-generated
        );

        // Export report to buffer
        const fileBuffer = await exportReportToBuffer(reportData, report.format);
        const fileName = `${report.template_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.${report.format}`;

        // Send email if email service is configured
        if (emailService.isConfigured()) {
          const emailResult = await emailService.sendReport({
            recipients: report.recipients,
            reportName: report.template_name,
            dateRange,
            format: report.format,
            fileBuffer,
            fileName,
          });

          if (emailResult.success) {
            
            // Update scheduled report
            await supabase.rpc('update_scheduled_report_after_run', {
              p_report_id: report.id,
              p_success: true,
            });

            results.push({
              reportId: report.id,
              status: 'success',
              recipients: report.recipients,
            });
          } else {
            throw new Error(emailResult.error || 'Failed to send email');
          }
        } else {
          console.warn('[Cron] Email service not configured, skipping email delivery');
          
          // Still mark as processed but note email wasn't sent
          await supabase.rpc('update_scheduled_report_after_run', {
            p_report_id: report.id,
            p_success: true,
            p_error_message: 'Email service not configured',
          });

          results.push({
            reportId: report.id,
            status: 'generated_no_email',
          });
        }
      } catch (reportError) {
        console.error(`[Cron] Error processing report ${report.id}:`, reportError);
        
        // Update with error
        await supabase.rpc('update_scheduled_report_after_run', {
          p_report_id: report.id,
          p_success: false,
          p_error_message: reportError instanceof Error ? reportError.message : 'Unknown error',
        });

        results.push({
          reportId: report.id,
          status: 'failed',
          error: reportError instanceof Error ? reportError.message : 'Unknown error',
        });
      }
    }


    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[Cron] Fatal error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get date range based on report frequency
 */
function getDateRangeForFrequency(frequency: string): { startDate: string; endDate: string } {
  const endDate = new Date();
  let startDate = new Date();

  switch (frequency) {
    case 'daily':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case 'monthly':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    default:
      startDate.setDate(endDate.getDate() - 30);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Export report to buffer (placeholder - needs actual implementation)
 */
async function exportReportToBuffer(reportData: any, format: string): Promise<Buffer> {
  // TODO: Implement actual export to buffer
  // For now, return a placeholder
  return Buffer.from(`Report data for ${format} format`);
}

// Configure route as edge function (optional)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
