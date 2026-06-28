// Report Service - Handles report generation and export

import { supabase } from '@/lib/supabase';
import { analyticsService, DateRange } from './analyticsService';
import { 
  ReportTemplate, 
  ReportData, 
  ReportFormat, 
  ScheduledReport,
  REPORT_TEMPLATES 
} from '@/types/reports';
import { downloadCSV, flattenForCSV } from '@/lib/export/csvExport';
import { exportToExcel, exportMultipleSheets, formatForExcel, ExcelSheet } from '@/lib/export/excelExport';
import { exportPDF, convertAnalyticsToPDF } from '@/lib/export/pdfExport';

class ReportService {
  /**
   * Get all report templates
   */
  async getTemplates(): Promise<ReportTemplate[]> {
    // For now, return predefined templates
    // In production, these would be stored in database
    return REPORT_TEMPLATES.map((template, index) => ({
      ...template,
      id: `template_${index + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Generate report data based on template
   */
  async generateReport(
    templateId: string,
    dateRange: DateRange,
    userId: string
  ): Promise<ReportData> {
    const startTime = Date.now();
    const templates = await this.getTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      throw new Error('Template not found');
    }

    const reportData: Record<string, any> = {};
    let totalRecords = 0;

    // Fetch data for each section
    for (const section of template.sections) {
      try {
        const data = await this.fetchSectionData(section.dataSource, dateRange, section.config);
        reportData[section.id] = data;
        
        if (Array.isArray(data)) {
          totalRecords += data.length;
        }
      } catch (error) {
        console.error(`Error fetching data for section ${section.id}:`, error);
        reportData[section.id] = null;
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      id: `report_${Date.now()}`,
      templateId,
      generatedAt: new Date().toISOString(),
      dateRange,
      format: template.defaultFormat,
      data: reportData,
      metadata: {
        generatedBy: userId,
        totalRecords,
        executionTime,
      },
    };
  }

  /**
   * Fetch data for a specific section
   */
  private async fetchSectionData(
    dataSource: string,
    dateRange: DateRange,
    config: Record<string, any>
  ): Promise<any> {
    // Map data sources to analytics service methods
    switch (dataSource) {
      case 'admin_get_engagement_metrics':
        const engagement = await analyticsService.getEngagementMetrics(dateRange);
        return engagement.data;

      case 'admin_get_performance_metrics':
        const performance = await analyticsService.getPerformanceMetrics(dateRange);
        return performance.data;

      case 'admin_get_student_segments':
        const segments = await analyticsService.getStudentSegments();
        return segments.data;

      case 'admin_get_exam_analytics':
        const exams = await analyticsService.getExamAnalytics(undefined, dateRange);
        return exams.data;

      case 'admin_get_question_performance':
        const questions = await analyticsService.getQuestionPerformance(config);
        return questions.data;

      case 'admin_get_content_quality_issues':
        const quality = await analyticsService.getContentQualityIssues();
        return quality.data;

      case 'admin_get_system_metrics':
        const system = await analyticsService.getSystemMetrics(dateRange);
        return system.data;

      case 'admin_get_database_stats':
        // TODO: Implement getDatabaseStats method
        return { message: 'Database stats not yet implemented' };

      case 'admin_get_feature_usage':
        // TODO: Implement getFeatureUsage method
        return { message: 'Feature usage not yet implemented' };

      case 'students':
        return await this.fetchStudents(config.limit || 100);

      case 'mock_exam_attempts':
        return await this.fetchExamAttempts(dateRange, config.limit || 100);

      default:
        throw new Error(`Unknown data source: ${dataSource}`);
    }
  }

  /**
   * Fetch students data with human-readable formatting
   */
  private async fetchStudents(limit: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('students')
      .select(`
        id,
        user_id,
        city,
        target_group,
        current_streak,
        last_active_date,
        profiles!inner(full_name, user_type)
      `)
      .eq('profiles.user_type', 'student')
      .limit(limit);

    if (error) throw error;

    // Get emails for students
    if (data && data.length > 0) {
      const userIds = data.map(s => s.user_id);
      const { data: emailData } = await supabase.rpc('admin_get_user_emails', {
        user_ids: userIds
      });
      const emailMap = emailData || {};

      // Format data for human readability
      return data.map((student: any) => ({
        name: student.profiles?.full_name || 'Unknown',
        email: emailMap[student.user_id] || 'N/A',
        city: student.city || 'N/A',
        target_group: student.target_group || 'N/A',
        current_streak: student.current_streak || 0,
        last_active: student.last_active_date 
          ? new Date(student.last_active_date).toLocaleDateString()
          : 'Never',
      }));
    }

    return [];
  }

  /**
   * Fetch exam attempts data with human-readable formatting
   */
  private async fetchExamAttempts(dateRange: DateRange, limit: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('mock_exam_attempts')
      .select(`
        id,
        user_id,
        mock_exam_id,
        started_at,
        completed_at,
        status,
        total_score,
        percentage,
        mock_exams(title, exam_type, target_group)
      `)
      .gte('started_at', dateRange.startDate)
      .lte('started_at', dateRange.endDate)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Format data for human readability
    if (data && data.length > 0) {
      return data.map((attempt: any) => ({
        exam_name: attempt.mock_exams?.title || 'Unknown Exam',
        exam_type: attempt.mock_exams?.exam_type || 'N/A',
        target_group: attempt.mock_exams?.target_group || 'N/A',
        status: attempt.status === 'completed' ? 'Completed' : 'In Progress',
        score: attempt.total_score?.toFixed(1) || '0',
        percentage: attempt.percentage?.toFixed(1) + '%' || '0%',
        started_at: new Date(attempt.started_at).toLocaleString(),
        completed_at: attempt.completed_at 
          ? new Date(attempt.completed_at).toLocaleString()
          : 'Not completed',
      }));
    }

    return [];
  }

  /**
   * Export report in specified format
   */
  async exportReport(
    reportData: ReportData,
    format: ReportFormat,
    fileName?: string
  ): Promise<void> {
    const baseFileName = fileName || `report_${new Date().toISOString().split('T')[0]}`;

    switch (format) {
      case 'csv':
        await this.exportAsCSV(reportData, baseFileName);
        break;
      case 'excel':
        await this.exportAsExcel(reportData, baseFileName);
        break;
      case 'pdf':
        await this.exportAsPDF(reportData, baseFileName);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Export as CSV
   */
  private async exportAsCSV(reportData: ReportData, baseFileName: string): Promise<void> {
    // Export each section as separate CSV
    Object.entries(reportData.data).forEach(([sectionId, data]) => {
      if (Array.isArray(data) && data.length > 0) {
        const flatData = flattenForCSV(data);
        downloadCSV(flatData, `${baseFileName}_${sectionId}.csv`);
      }
    });
  }

  /**
   * Export as Excel
   */
  private async exportAsExcel(reportData: ReportData, baseFileName: string): Promise<void> {
    const sheets: ExcelSheet[] = [];

    Object.entries(reportData.data).forEach(([sectionId, data]) => {
      if (Array.isArray(data) && data.length > 0) {
        sheets.push({
          name: sectionId.replace(/_/g, ' ').substring(0, 31), // Excel sheet name limit
          data: formatForExcel(data),
          options: { freezeHeader: true },
        });
      }
    });

    if (sheets.length > 0) {
      exportMultipleSheets(sheets, `${baseFileName}.xlsx`);
    }
  }

  /**
   * Export as PDF
   */
  private async exportAsPDF(reportData: ReportData, baseFileName: string): Promise<void> {
    const sections = convertAnalyticsToPDF({
      engagement: reportData.data.engagement,
      performance: reportData.data.performance,
      students: reportData.data.active_students,
      exams: reportData.data.exam_results,
    });

    exportPDF(sections, {
      fileName: `${baseFileName}.pdf`,
      title: 'Analytics Report',
      includeDate: true,
      includePageNumbers: true,
    });
  }

  /**
   * Get scheduled reports
   */
  async getScheduledReports(): Promise<ScheduledReport[]> {
    // In production, fetch from database
    // For now, return empty array
    return [];
  }

  /**
   * Create scheduled report
   */
  async createScheduledReport(report: Omit<ScheduledReport, 'id'>): Promise<ScheduledReport> {
    // In production, save to database
    const newReport: ScheduledReport = {
      ...report,
      id: `scheduled_${Date.now()}`,
    };
    return newReport;
  }

  /**
   * Update scheduled report
   */
  async updateScheduledReport(id: string, updates: Partial<ScheduledReport>): Promise<void> {
    // In production, update in database
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(id: string): Promise<void> {
    // In production, delete from database
  }

  /**
   * Send report via email
   */
  async sendReportEmail(
    reportData: ReportData,
    recipients: string[],
    format: ReportFormat
  ): Promise<void> {
    // In production, integrate with email service (Brevo SMTP via nodemailer)
    
    // TODO: Implement email sending
    // 1. Generate report file
    // 2. Upload to storage (optional)
    // 3. Send email with attachment or link
    throw new Error('Email delivery not yet implemented. Please configure email service.');
  }
}

export const reportService = new ReportService();
