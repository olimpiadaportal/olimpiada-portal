// Excel Export Utility using exceljs library
// Install: npm install exceljs

import ExcelJS from 'exceljs';

export interface ExcelExportOptions {
  fileName?: string;
  sheetName?: string;
  includeHeaders?: boolean;
  columnWidths?: number[];
  freezeHeader?: boolean;
}

export interface ExcelSheet {
  name: string;
  data: Record<string, any>[];
  options?: ExcelExportOptions;
}

/**
 * Export single sheet to Excel
 */
export async function exportToExcel(
  data: Record<string, any>[],
  options: ExcelExportOptions = {}
): Promise<void> {
  const {
    fileName = 'export.xlsx',
    sheetName = 'Sheet1',
    includeHeaders = true,
  } = options;

  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length === 0) {
    await downloadWorkbook(workbook, fileName);
    return;
  }

  // Get headers from first row
  const headers = Object.keys(data[0]);

  // Add headers if requested
  if (includeHeaders) {
    worksheet.addRow(headers);
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  }

  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => row[header] ?? '');
    worksheet.addRow(values);
  });

  // Apply column widths
  if (options.columnWidths) {
    headers.forEach((_, index) => {
      worksheet.getColumn(index + 1).width = options.columnWidths![index] || 15;
    });
  } else {
    // Auto-size columns
    autoSizeColumns(worksheet, data, headers);
  }

  // Freeze header row
  if (options.freezeHeader && includeHeaders) {
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // Download file
  await downloadWorkbook(workbook, fileName);
}

/**
 * Export multiple sheets to Excel
 */
export async function exportMultipleSheets(
  sheets: ExcelSheet[],
  fileName: string = 'export.xlsx'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  sheets.forEach(sheet => {
    const worksheet = workbook.addWorksheet(sheet.name);
    const includeHeaders = sheet.options?.includeHeaders !== false;

    if (sheet.data.length === 0) return;

    const headers = Object.keys(sheet.data[0]);

    // Add headers
    if (includeHeaders) {
      worksheet.addRow(headers);
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }

    // Add data rows
    sheet.data.forEach(row => {
      const values = headers.map(header => row[header] ?? '');
      worksheet.addRow(values);
    });

    // Apply column widths
    if (sheet.options?.columnWidths) {
      headers.forEach((_, index) => {
        worksheet.getColumn(index + 1).width = sheet.options!.columnWidths![index] || 15;
      });
    } else {
      autoSizeColumns(worksheet, sheet.data, headers);
    }

    // Freeze header
    if (sheet.options?.freezeHeader && includeHeaders) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
  });

  await downloadWorkbook(workbook, fileName);
}

/**
 * Auto-size columns based on content
 */
function autoSizeColumns(
  worksheet: ExcelJS.Worksheet,
  data: Record<string, any>[],
  headers: string[]
): void {
  headers.forEach((header, index) => {
    const maxLength = Math.max(
      header.length,
      ...data.map(row => String(row[header] || '').length)
    );
    worksheet.getColumn(index + 1).width = Math.min(maxLength + 2, 50);
  });
}

/**
 * Download workbook as file
 */
async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format data for Excel export
 */
export function formatForExcel(data: Record<string, any>[]): Record<string, any>[] {
  return data.map(row => {
    const formatted: Record<string, any> = {};
    
    Object.keys(row).forEach(key => {
      const value = row[key];
      
      // Handle dates
      if (value instanceof Date) {
        formatted[key] = value.toISOString().split('T')[0];
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        formatted[key] = value.join(', ');
      }
      // Handle objects
      else if (value && typeof value === 'object') {
        formatted[key] = JSON.stringify(value);
      }
      // Handle null/undefined
      else if (value === null || value === undefined) {
        formatted[key] = '';
      }
      else {
        formatted[key] = value;
      }
    });

    return formatted;
  });
}

/**
 * Create Excel workbook from analytics data
 */
export async function createAnalyticsWorkbook(analyticsData: {
  students?: Record<string, any>[];
  exams?: Record<string, any>[];
  questions?: Record<string, any>[];
  engagement?: Record<string, any>[];
}): Promise<void> {
  const sheets: ExcelSheet[] = [];

  if (analyticsData.students) {
    sheets.push({
      name: 'Students',
      data: formatForExcel(analyticsData.students),
      options: { freezeHeader: true },
    });
  }

  if (analyticsData.exams) {
    sheets.push({
      name: 'Exams',
      data: formatForExcel(analyticsData.exams),
      options: { freezeHeader: true },
    });
  }

  if (analyticsData.questions) {
    sheets.push({
      name: 'Questions',
      data: formatForExcel(analyticsData.questions),
      options: { freezeHeader: true },
    });
  }

  if (analyticsData.engagement) {
    sheets.push({
      name: 'Engagement',
      data: formatForExcel(analyticsData.engagement),
      options: { freezeHeader: true },
    });
  }

  const fileName = `analytics_report_${new Date().toISOString().split('T')[0]}.xlsx`;
  await exportMultipleSheets(sheets, fileName);
}
