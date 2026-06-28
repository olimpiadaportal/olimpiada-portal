/**
 * API Route: Run Scheduled Report
 * Manually triggers a scheduled report to be generated and sent
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as nodemailer from 'nodemailer';
import { reportService } from '@/services/reportService';
import { requireAdmin } from '@/lib/apiAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  // Require admin role to run reports
  const authResult = await requireAdmin(request, 'admin');
  if (authResult.error) return authResult.error;

  try {
    const { reportId } = await request.json();

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    // Get the scheduled report
    const { data: report, error: fetchError } = await supabase
      .from('scheduled_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Validate email configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    // Generate the report
    const endDate = new Date().toISOString();
    const startDate = getStartDate(report.frequency, report.last_run_at);

    const reportData = await reportService.generateReport(
      report.template_id,
      { startDate, endDate },
      report.created_by
    );

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Generate report content based on format
    const { content, filename, mimeType } = await generateReportFile(reportData, report.format);

    // Send email to all recipients
    const emailPromises = report.recipients.map((recipient: string) =>
      transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME || 'Elmly Reports'} <${process.env.SMTP_FROM_EMAIL}>`,
        to: recipient,
        subject: `${report.template_name} - ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">📊 ${report.template_name}</h2>
            <p>Your scheduled report is ready. Please find it attached below.</p>
            <p><strong>Report Period:</strong> ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</p>
            <p><strong>Format:</strong> ${report.format.toUpperCase()}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              This is an automated report from Elmly Admin Panel.
              To manage your scheduled reports, visit the admin panel.
            </p>
          </div>
        `,
        attachments: [
          {
            filename,
            content,
            contentType: mimeType,
          },
        ],
      })
    );

    await Promise.all(emailPromises);

    // Update last_run_at and calculate next_run_at
    const nextRunAt = calculateNextRunAt(report.frequency, report.config);

    await supabase
      .from('scheduled_reports')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
      })
      .eq('id', reportId);

    return NextResponse.json({
      success: true,
      message: `Report sent to ${report.recipients.length} recipient(s)`,
    });
  } catch (error: any) {
    console.error('Run report error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run report' },
      { status: 500 }
    );
  }
}

function getStartDate(frequency: string, lastRunAt: string | null): string {
  const now = new Date();
  
  if (lastRunAt) {
    return lastRunAt;
  }

  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() - 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() - 1);
      break;
    default:
      now.setDate(now.getDate() - 7);
  }

  return now.toISOString();
}

function calculateNextRunAt(frequency: string, config: any): string {
  const now = new Date();
  const [hours, minutes] = (config.time || '09:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      const targetDay = config.day_of_week || 1;
      const currentDay = next.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + daysUntilTarget);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(config.day_of_month || 1);
      break;
  }

  return next.toISOString();
}

async function generateReportFile(
  reportData: any,
  format: string
): Promise<{ content: Buffer; filename: string; mimeType: string }> {
  const dateStr = new Date().toISOString().split('T')[0];
  
  switch (format) {
    case 'csv': {
      // Convert report data to CSV
      const sections = Object.entries(reportData.data);
      let csvContent = '';
      
      for (const [sectionId, data] of sections) {
        if (Array.isArray(data) && data.length > 0) {
          csvContent += `\n--- ${sectionId} ---\n`;
          const headers = Object.keys(data[0]);
          csvContent += headers.join(',') + '\n';
          for (const row of data) {
            csvContent += headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',') + '\n';
          }
        }
      }
      
      return {
        content: Buffer.from(csvContent, 'utf-8'),
        filename: `report_${dateStr}.csv`,
        mimeType: 'text/csv',
      };
    }
    
    case 'excel': {
      // For Excel, we'll create a simple CSV that Excel can open
      // In production, use a library like exceljs
      const sections = Object.entries(reportData.data);
      let content = '';
      
      for (const [sectionId, data] of sections) {
        if (Array.isArray(data) && data.length > 0) {
          content += `${sectionId}\n`;
          const headers = Object.keys(data[0]);
          content += headers.join('\t') + '\n';
          for (const row of data) {
            content += headers.map(h => String(row[h] || '')).join('\t') + '\n';
          }
          content += '\n';
        }
      }
      
      return {
        content: Buffer.from(content, 'utf-8'),
        filename: `report_${dateStr}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    
    case 'pdf':
    default: {
      // Generate HTML that can be converted to PDF
      // In production, use a library like puppeteer or pdfkit
      const sections = Object.entries(reportData.data);
      let htmlContent = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #2563eb; }
            h2 { color: #374151; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
            th { background-color: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Analytics Report</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Period: ${new Date(reportData.dateRange.startDate).toLocaleDateString()} - ${new Date(reportData.dateRange.endDate).toLocaleDateString()}</p>
      `;
      
      for (const [sectionId, data] of sections) {
        htmlContent += `<h2>${sectionId.replace(/_/g, ' ')}</h2>`;
        
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0]);
          htmlContent += '<table><thead><tr>';
          headers.forEach(h => { htmlContent += `<th>${h}</th>`; });
          htmlContent += '</tr></thead><tbody>';
          
          for (const row of data.slice(0, 50)) {
            htmlContent += '<tr>';
            headers.forEach(h => { htmlContent += `<td>${row[h] || ''}</td>`; });
            htmlContent += '</tr>';
          }
          
          htmlContent += '</tbody></table>';
          if (data.length > 50) {
            htmlContent += `<p><em>Showing first 50 of ${data.length} records</em></p>`;
          }
        } else if (typeof data === 'object' && data !== null) {
          htmlContent += '<ul>';
          Object.entries(data).forEach(([key, value]) => {
            htmlContent += `<li><strong>${key}:</strong> ${value}</li>`;
          });
          htmlContent += '</ul>';
        }
      }
      
      htmlContent += '</body></html>';
      
      return {
        content: Buffer.from(htmlContent, 'utf-8'),
        filename: `report_${dateStr}.html`,
        mimeType: 'text/html',
      };
    }
  }
}
