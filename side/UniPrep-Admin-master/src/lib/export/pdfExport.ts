// PDF Export Utility using jsPDF
// Install: npm install jspdf jspdf-autotable

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PDFExportOptions {
  fileName?: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  pageSize?: 'a4' | 'letter';
  includeDate?: boolean;
  includePageNumbers?: boolean;
  headerColor?: string;
  fontSize?: number;
}

export interface PDFSection {
  type: 'title' | 'text' | 'table' | 'metric' | 'spacer';
  content: any;
  options?: any;
}

/**
 * Create PDF report with multiple sections
 */
export function createPDFReport(
  sections: PDFSection[],
  options: PDFExportOptions = {}
): jsPDF {
  const {
    orientation = 'portrait',
    pageSize = 'a4',
    title = 'Analytics Report',
    includeDate = true,
    includePageNumbers = true,
    fontSize = 10,
  } = options;

  // Create PDF document
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: pageSize,
  });

  doc.setFontSize(fontSize);

  let yPosition = 20;

  // Add title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 15, yPosition);
  yPosition += 10;

  // Add date
  if (includeDate) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 15, yPosition);
    yPosition += 10;
  }

  // Add sections
  sections.forEach(section => {
    // Check if we need a new page
    if (yPosition > 270) {
      doc.addPage();
      yPosition = 20;
    }

    switch (section.type) {
      case 'title':
        yPosition = addTitle(doc, section.content, yPosition);
        break;
      case 'text':
        yPosition = addText(doc, section.content, yPosition);
        break;
      case 'table':
        yPosition = addTable(doc, section.content, yPosition, section.options);
        break;
      case 'metric':
        yPosition = addMetrics(doc, section.content, yPosition);
        break;
      case 'spacer':
        yPosition += section.content || 10;
        break;
    }
  });

  // Add page numbers
  if (includePageNumbers) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Page ${i} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  }

  return doc;
}

/**
 * Add title section
 */
function addTitle(doc: jsPDF, text: string, yPosition: number): number {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 15, yPosition);
  return yPosition + 10;
}

/**
 * Add text section
 */
function addText(doc: jsPDF, text: string, yPosition: number): number {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, 180);
  doc.text(lines, 15, yPosition);
  return yPosition + (lines.length * 5) + 5;
}

/**
 * Add table section
 */
function addTable(
  doc: jsPDF,
  data: { headers: string[]; rows: any[][] },
  yPosition: number,
  options: any = {}
): number {
  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246], // Blue
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    ...options,
  });

  return ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 10) + 10;
}

/**
 * Add metrics section (key-value pairs)
 */
function addMetrics(
  doc: jsPDF,
  metrics: Record<string, any>,
  yPosition: number
): number {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  
  Object.entries(metrics).forEach(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').trim();
    const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`${formattedLabel}:`, 15, yPosition);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value), 80, yPosition);
    yPosition += 7;
  });

  return yPosition + 5;
}

/**
 * Export PDF to file
 */
export function exportPDF(
  sections: PDFSection[],
  options: PDFExportOptions = {}
): void {
  const doc = createPDFReport(sections, options);
  const fileName = options.fileName || `report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Convert analytics data to PDF sections
 */
export function convertAnalyticsToPDF(analyticsData: {
  engagement?: any;
  performance?: any;
  students?: any[];
  exams?: any[];
}): PDFSection[] {
  const sections: PDFSection[] = [];

  // Engagement metrics
  if (analyticsData.engagement) {
    sections.push({
      type: 'title',
      content: 'Engagement Metrics',
    });
    sections.push({
      type: 'metric',
      content: {
        'Daily Active Users': analyticsData.engagement.dau,
        'Weekly Active Users': analyticsData.engagement.wau,
        'Monthly Active Users': analyticsData.engagement.mau,
        'Avg Session Duration': `${analyticsData.engagement.avgSessionDuration} min`,
        'Total Sessions': analyticsData.engagement.totalSessions,
      },
    });
    sections.push({ type: 'spacer', content: 10 });
  }

  // Performance metrics
  if (analyticsData.performance) {
    sections.push({
      type: 'title',
      content: 'Performance Metrics',
    });
    sections.push({
      type: 'metric',
      content: {
        'Average Accuracy': `${analyticsData.performance.avgAccuracy}%`,
        'Average Score': analyticsData.performance.avgScore,
        'Total Questions': analyticsData.performance.totalQuestionsAttempted,
        'Total Study Time': `${analyticsData.performance.totalStudyTime} min`,
      },
    });
    sections.push({ type: 'spacer', content: 10 });
  }

  // Students table
  if (analyticsData.students && analyticsData.students.length > 0) {
    const headers = Object.keys(analyticsData.students[0]);
    const rows = analyticsData.students.map(student => 
      headers.map(h => student[h])
    );
    
    sections.push({
      type: 'title',
      content: 'Student List',
    });
    sections.push({
      type: 'table',
      content: { headers, rows },
    });
    sections.push({ type: 'spacer', content: 10 });
  }

  // Exams table
  if (analyticsData.exams && analyticsData.exams.length > 0) {
    const headers = Object.keys(analyticsData.exams[0]);
    const rows = analyticsData.exams.map(exam => 
      headers.map(h => exam[h])
    );
    
    sections.push({
      type: 'title',
      content: 'Exam Results',
    });
    sections.push({
      type: 'table',
      content: { headers, rows },
    });
  }

  return sections;
}
