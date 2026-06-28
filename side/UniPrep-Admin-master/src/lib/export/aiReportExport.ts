/**
 * AI Management Report Export Utilities
 * Stage 5.5 - Phase 4 Enhancement
 * 
 * Provides PDF and CSV export functionality for AI management data
 */

import { createPDFReport, type PDFSection } from './pdfExport';

// ============================================
// Types
// ============================================

export interface AIUsageData {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
  success_rate: number;
  by_feature?: Array<{
    feature: string;
    requests: number;
    tokens: number;
    cost: number;
    avg_quality: number;
  }>;
  by_provider?: Array<{
    provider: string;
    requests: number;
    cost: number;
  }>;
}

export interface CostTrendData {
  period_date: string;
  requests: number;
  tokens: number;
  cost: number;
  avg_cost_per_request: number;
}

export interface QualityMetricsData {
  avg_quality_score: number;
  total_reviewed: number;
  approval_rate: number;
  flagged_count: number;
  common_issues?: Array<{ issue: string; count: number }>;
  trends?: Array<{ date: string; avg_score: number; count: number }>;
}

export interface BudgetData {
  budget_name: string;
  budget_amount: number;
  current_spend: number;
  remaining: number;
  percent_used: number;
  status: string;
}

// ============================================
// PDF Export Functions
// ============================================

/**
 * Export AI Usage Overview to PDF
 */
export function exportAIUsagePDF(
  data: AIUsageData,
  dateRange: { start: string; end: string }
): void {
  const sections: PDFSection[] = [
    {
      type: 'title',
      content: 'AI Usage Report',
    },
    {
      type: 'text',
      content: `Report Period: ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(
        dateRange.end
      ).toLocaleDateString()}`,
    },
    {
      type: 'metric',
      content: {
        'Total Requests': data.total_requests.toLocaleString(),
        'Total Tokens': data.total_tokens.toLocaleString(),
        'Total Cost': `$${data.total_cost.toFixed(2)}`,
        'Average Latency': `${data.avg_latency_ms.toFixed(0)}ms`,
        'Success Rate': `${data.success_rate.toFixed(1)}%`,
      },
    },
  ];

  // Add feature breakdown if available
  if (data.by_feature && data.by_feature.length > 0) {
    sections.push({
      type: 'title',
      content: 'Usage by Feature',
    });
    sections.push({
      type: 'table',
      content: {
        headers: ['Feature', 'Requests', 'Tokens', 'Cost', 'Avg Quality'],
        rows: data.by_feature.map((f) => [
          f.feature,
          f.requests.toLocaleString(),
          f.tokens.toLocaleString(),
          `$${f.cost.toFixed(2)}`,
          `${(f.avg_quality * 100).toFixed(0)}%`,
        ]),
      },
    });
  }

  // Add provider breakdown if available
  if (data.by_provider && data.by_provider.length > 0) {
    sections.push({
      type: 'title',
      content: 'Usage by Provider',
    });
    sections.push({
      type: 'table',
      content: {
        headers: ['Provider', 'Requests', 'Cost'],
        rows: data.by_provider.map((p) => [
          p.provider,
          p.requests.toLocaleString(),
          `$${p.cost.toFixed(2)}`,
        ]),
      },
    });
  }

  const doc = createPDFReport(sections, {
    title: 'AI Usage Report',
  });

  doc.save(`AI_Usage_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export Cost Trends to PDF
 */
export function exportCostTrendsPDF(
  data: CostTrendData[],
  dateRange: { start: string; end: string }
): void {
  const sections: PDFSection[] = [
    {
      type: 'title',
      content: 'AI Cost Trends Report',
    },
    {
      type: 'text',
      content: `Report Period: ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(
        dateRange.end
      ).toLocaleDateString()}`,
    },
    {
      type: 'table',
      content: {
        headers: ['Date', 'Requests', 'Tokens', 'Cost', 'Avg Cost/Request'],
        rows: data.map((item) => [
          new Date(item.period_date).toLocaleDateString(),
          item.requests.toLocaleString(),
          item.tokens.toLocaleString(),
          `$${item.cost.toFixed(2)}`,
          `$${item.avg_cost_per_request.toFixed(4)}`,
        ]),
      },
    },
  ];

  // Calculate totals
  const totals = data.reduce(
    (acc, item) => ({
      requests: acc.requests + item.requests,
      tokens: acc.tokens + item.tokens,
      cost: acc.cost + item.cost,
    }),
    { requests: 0, tokens: 0, cost: 0 }
  );

  sections.push({
    type: 'metric',
    content: {
      'Total Requests': totals.requests.toLocaleString(),
      'Total Tokens': totals.tokens.toLocaleString(),
      'Total Cost': `$${totals.cost.toFixed(2)}`,
      'Average Cost per Request': `$${(totals.cost / totals.requests).toFixed(4)}`,
    },
  });

  const doc = createPDFReport(sections, {
    title: 'AI Cost Trends Report',
  });

  doc.save(`AI_Cost_Trends_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export Quality Metrics to PDF
 */
export function exportQualityMetricsPDF(
  data: QualityMetricsData,
  dateRange: { start: string; end: string }
): void {
  const sections: PDFSection[] = [
    {
      type: 'title',
      content: 'AI Quality Metrics Report',
    },
    {
      type: 'text',
      content: `Report Period: ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(
        dateRange.end
      ).toLocaleDateString()}`,
    },
    {
      type: 'metric',
      content: {
        'Average Quality Score': `${(data.avg_quality_score * 100).toFixed(1)}%`,
        'Total Reviewed': data.total_reviewed.toLocaleString(),
        'Approval Rate': `${data.approval_rate.toFixed(1)}%`,
        'Flagged for Review': data.flagged_count.toLocaleString(),
      },
    },
  ];

  // Add common issues if available
  if (data.common_issues && data.common_issues.length > 0) {
    sections.push({
      type: 'title',
      content: 'Common Issues',
    });
    sections.push({
      type: 'table',
      content: {
        headers: ['Issue', 'Occurrences'],
        rows: data.common_issues.map((issue) => [issue.issue, issue.count.toString()]),
      },
    });
  }

  // Add quality trends if available
  if (data.trends && data.trends.length > 0) {
    sections.push({
      type: 'title',
      content: 'Quality Trends',
    });
    sections.push({
      type: 'table',
      content: {
        headers: ['Date', 'Avg Score', 'Count'],
        rows: data.trends.map((trend) => [
          new Date(trend.date).toLocaleDateString(),
          `${(trend.avg_score * 100).toFixed(1)}%`,
          trend.count.toString(),
        ]),
      },
    });
  }

  const doc = createPDFReport(sections, {
    title: 'AI Quality Metrics Report',
  });

  doc.save(`AI_Quality_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export Budget Status to PDF
 */
export function exportBudgetStatusPDF(budgets: BudgetData[]): void {
  const sections: PDFSection[] = [
    {
      type: 'title',
      content: 'AI Budget Status Report',
    },
    {
      type: 'text',
      content: `Generated: ${new Date().toLocaleString()}`,
    },
    {
      type: 'table',
      content: {
        headers: ['Budget', 'Limit', 'Spent', 'Remaining', 'Used %', 'Status'],
        rows: budgets.map((budget) => [
          budget.budget_name,
          `$${budget.budget_amount.toFixed(2)}`,
          `$${budget.current_spend.toFixed(2)}`,
          `$${budget.remaining.toFixed(2)}`,
          `${budget.percent_used.toFixed(1)}%`,
          budget.status,
        ]),
      },
    },
  ];

  // Calculate totals
  const totals = budgets.reduce(
    (acc, budget) => ({
      limit: acc.limit + budget.budget_amount,
      spent: acc.spent + budget.current_spend,
      remaining: acc.remaining + budget.remaining,
    }),
    { limit: 0, spent: 0, remaining: 0 }
  );

  sections.push({
    type: 'metric',
    content: {
      'Total Budget Limit': `$${totals.limit.toFixed(2)}`,
      'Total Spent': `$${totals.spent.toFixed(2)}`,
      'Total Remaining': `$${totals.remaining.toFixed(2)}`,
      'Overall Usage': `${((totals.spent / totals.limit) * 100).toFixed(1)}%`,
    },
  });

  const doc = createPDFReport(sections, {
    title: 'AI Budget Status Report',
  });

  doc.save(`AI_Budget_Status_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ============================================
// CSV Export Functions
// ============================================

/**
 * Export AI Usage to CSV
 */
export function exportAIUsageCSV(data: AIUsageData): void {
  let csv = 'AI Usage Report\n\n';
  csv += 'Metric,Value\n';
  csv += `Total Requests,${data.total_requests}\n`;
  csv += `Total Tokens,${data.total_tokens}\n`;
  csv += `Total Cost,$${data.total_cost.toFixed(2)}\n`;
  csv += `Average Latency,${data.avg_latency_ms.toFixed(0)}ms\n`;
  csv += `Success Rate,${data.success_rate.toFixed(1)}%\n\n`;

  if (data.by_feature && data.by_feature.length > 0) {
    csv += '\nUsage by Feature\n';
    csv += 'Feature,Requests,Tokens,Cost,Avg Quality\n';
    data.by_feature.forEach((f) => {
      csv += `${f.feature},${f.requests},${f.tokens},$${f.cost.toFixed(2)},${(
        f.avg_quality * 100
      ).toFixed(0)}%\n`;
    });
  }

  downloadCSV(csv, `AI_Usage_${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export Cost Trends to CSV
 */
export function exportCostTrendsCSV(data: CostTrendData[]): void {
  let csv = 'AI Cost Trends Report\n\n';
  csv += 'Date,Requests,Tokens,Cost,Avg Cost per Request\n';

  data.forEach((item) => {
    csv += `${new Date(item.period_date).toLocaleDateString()},${item.requests},${
      item.tokens
    },$${item.cost.toFixed(2)},$${item.avg_cost_per_request.toFixed(4)}\n`;
  });

  downloadCSV(csv, `AI_Cost_Trends_${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export Quality Metrics to CSV
 */
export function exportQualityMetricsCSV(data: QualityMetricsData): void {
  let csv = 'AI Quality Metrics Report\n\n';
  csv += 'Metric,Value\n';
  csv += `Average Quality Score,${(data.avg_quality_score * 100).toFixed(1)}%\n`;
  csv += `Total Reviewed,${data.total_reviewed}\n`;
  csv += `Approval Rate,${data.approval_rate.toFixed(1)}%\n`;
  csv += `Flagged Count,${data.flagged_count}\n\n`;

  if (data.common_issues && data.common_issues.length > 0) {
    csv += '\nCommon Issues\n';
    csv += 'Issue,Count\n';
    data.common_issues.forEach((issue) => {
      csv += `${issue.issue},${issue.count}\n`;
    });
  }

  downloadCSV(csv, `AI_Quality_${new Date().toISOString().split('T')[0]}.csv`);
}

/**
 * Export Budget Status to CSV
 */
export function exportBudgetStatusCSV(budgets: BudgetData[]): void {
  let csv = 'AI Budget Status Report\n\n';
  csv += 'Budget,Limit,Spent,Remaining,Used %,Status\n';

  budgets.forEach((budget) => {
    csv += `${budget.budget_name},$${budget.budget_amount.toFixed(2)},$${budget.current_spend.toFixed(
      2
    )},$${budget.remaining.toFixed(2)},${budget.percent_used.toFixed(1)}%,${budget.status}\n`;
  });

  downloadCSV(csv, `AI_Budget_Status_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Download CSV file
 */
function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
