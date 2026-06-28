// Report Types and Interfaces for Phase 5

export type ReportType = 
  | 'student_performance'
  | 'content_analytics'
  | 'system_health'
  | 'engagement_summary'
  | 'exam_results'
  | 'custom';

export type ReportFormat = 'pdf' | 'csv' | 'excel';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: ReportType;
  sections: ReportSection[];
  defaultFormat: ReportFormat;
  frequency?: ReportFrequency;
  recipients?: string[]; // Email addresses
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'chart' | 'table' | 'metric' | 'text';
  dataSource: string; // Function name or API endpoint
  config: Record<string, any>;
  order: number;
}

export interface ReportData {
  id: string;
  templateId: string;
  generatedAt: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  format: ReportFormat;
  data: Record<string, any>;
  metadata: {
    generatedBy: string;
    totalRecords: number;
    executionTime: number; // milliseconds
  };
}

export interface ExportOptions {
  format: ReportFormat;
  includeCharts: boolean;
  includeRawData: boolean;
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'A4' | 'Letter';
}

export interface ScheduledReport {
  id: string;
  templateId: string;
  frequency: ReportFrequency;
  recipients: string[];
  format: ReportFormat;
  nextRunAt: string;
  lastRunAt?: string;
  isActive: boolean;
  config: {
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    time: string; // HH:mm format
  };
}

// Pre-defined report templates
export const REPORT_TEMPLATES: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Daily Student Activity',
    description: 'Daily summary of student engagement and performance',
    type: 'engagement_summary',
    defaultFormat: 'pdf',
    frequency: 'daily',
    isActive: true,
    sections: [
      {
        id: 'engagement',
        title: 'Engagement Metrics',
        type: 'metric',
        dataSource: 'admin_get_engagement_metrics',
        config: {},
        order: 1,
      },
      {
        id: 'active_students',
        title: 'Active Students',
        type: 'table',
        dataSource: 'students',
        config: { limit: 50 },
        order: 2,
      },
    ],
  },
  {
    name: 'Weekly Performance Report',
    description: 'Weekly analysis of student performance and content effectiveness',
    type: 'student_performance',
    defaultFormat: 'pdf',
    frequency: 'weekly',
    isActive: true,
    sections: [
      {
        id: 'performance',
        title: 'Performance Metrics',
        type: 'metric',
        dataSource: 'admin_get_performance_metrics',
        config: {},
        order: 1,
      },
      {
        id: 'exam_results',
        title: 'Exam Results',
        type: 'table',
        dataSource: 'admin_get_exam_analytics',
        config: {},
        order: 2,
      },
      {
        id: 'top_questions',
        title: 'Question Performance',
        type: 'table',
        dataSource: 'admin_get_question_performance',
        config: { limit: 20 },
        order: 3,
      },
    ],
  },
  {
    name: 'Monthly Analytics Summary',
    description: 'Comprehensive monthly report with all key metrics',
    type: 'engagement_summary',
    defaultFormat: 'pdf',
    frequency: 'monthly',
    isActive: true,
    sections: [
      {
        id: 'engagement',
        title: 'Engagement Overview',
        type: 'metric',
        dataSource: 'admin_get_engagement_metrics',
        config: {},
        order: 1,
      },
      {
        id: 'performance',
        title: 'Performance Overview',
        type: 'metric',
        dataSource: 'admin_get_performance_metrics',
        config: {},
        order: 2,
      },
      {
        id: 'segments',
        title: 'Student Segments',
        type: 'chart',
        dataSource: 'admin_get_student_segments',
        config: {},
        order: 3,
      },
      {
        id: 'content_quality',
        title: 'Content Quality Issues',
        type: 'table',
        dataSource: 'admin_get_content_quality_issues',
        config: {},
        order: 4,
      },
    ],
  },
  {
    name: 'Exam Results Report',
    description: 'Detailed exam performance and completion rates',
    type: 'exam_results',
    defaultFormat: 'excel',
    isActive: true,
    sections: [
      {
        id: 'exam_analytics',
        title: 'Exam Analytics',
        type: 'table',
        dataSource: 'admin_get_exam_analytics',
        config: {},
        order: 1,
      },
      {
        id: 'student_attempts',
        title: 'Student Attempts',
        type: 'table',
        dataSource: 'mock_exam_attempts',
        config: {},
        order: 2,
      },
    ],
  },
  {
    name: 'System Health Report',
    description: 'System performance, errors, and usage patterns',
    type: 'system_health',
    defaultFormat: 'pdf',
    frequency: 'daily',
    isActive: true,
    sections: [
      {
        id: 'system_metrics',
        title: 'System Metrics',
        type: 'metric',
        dataSource: 'admin_get_system_metrics',
        config: {},
        order: 1,
      },
      {
        id: 'database_stats',
        title: 'Database Statistics',
        type: 'metric',
        dataSource: 'admin_get_database_stats',
        config: {},
        order: 2,
      },
      {
        id: 'feature_usage',
        title: 'Feature Usage',
        type: 'chart',
        dataSource: 'admin_get_feature_usage',
        config: {},
        order: 3,
      },
    ],
  },
];
