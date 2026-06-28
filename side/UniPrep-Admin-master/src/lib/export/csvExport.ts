// CSV Export Utility

export interface CSVExportOptions {
  fileName?: string;
  headers?: string[];
  delimiter?: string;
  includeHeaders?: boolean;
}

/**
 * Convert array of objects to CSV string
 */
export function convertToCSV(
  data: Record<string, any>[],
  options: CSVExportOptions = {}
): string {
  if (!data || data.length === 0) {
    return '';
  }

  const {
    headers = Object.keys(data[0]),
    delimiter = ',',
    includeHeaders = true,
  } = options;

  const rows: string[] = [];

  // Add headers
  if (includeHeaders) {
    rows.push(headers.map(h => escapeCSVValue(h)).join(delimiter));
  }

  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      return escapeCSVValue(value);
    });
    rows.push(values.join(delimiter));
  });

  return rows.join('\n');
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Download CSV file
 */
export function downloadCSV(
  data: Record<string, any>[],
  fileName: string = 'export.csv',
  options: CSVExportOptions = {}
): void {
  const csv = convertToCSV(data, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export multiple sheets as separate CSV files (zipped)
 */
export function exportMultipleCSV(
  sheets: { name: string; data: Record<string, any>[] }[],
  baseFileName: string = 'export'
): void {
  sheets.forEach((sheet, index) => {
    const fileName = `${baseFileName}_${sheet.name}.csv`;
    downloadCSV(sheet.data, fileName);
  });
}

/**
 * Format data for CSV export (flatten nested objects)
 */
export function flattenForCSV(data: Record<string, any>[]): Record<string, any>[] {
  return data.map(row => flattenObject(row));
}

function flattenObject(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      flattened[newKey] = value.join('; ');
    } else {
      flattened[newKey] = value;
    }
  });

  return flattened;
}
