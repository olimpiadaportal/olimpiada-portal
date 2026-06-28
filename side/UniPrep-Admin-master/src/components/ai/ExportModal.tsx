'use client';

import { useState } from 'react';
import { X, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { 
  exportAIUsagePDF, 
  exportAIUsageCSV,
  exportCostTrendsPDF,
  exportCostTrendsCSV,
  exportQualityMetricsPDF,
  exportQualityMetricsCSV
} from '@/lib/export/aiReportExport';

/**
 * Export Modal Component
 * Allows exporting AI analytics data to CSV or PDF
 * Stage 5.5 - Phase 2 & 4
 */

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataType: 'usage' | 'costs' | 'quality' | 'overview';
  data: any;
  dateRange?: { start: string; end: string };
}

export default function ExportModal({ isOpen, onClose, dataType, data, dateRange }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  // Default date range: last 30 days
  const defaultDateRange = dateRange || {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      if (dataType === 'usage') {
        exportAIUsageCSV(data);
      } else if (dataType === 'costs') {
        exportCostTrendsCSV(data);
      } else if (dataType === 'quality') {
        exportQualityMetricsCSV(data);
      } else if (dataType === 'overview') {
        // For overview, export usage data
        exportAIUsageCSV(data);
      }

      setTimeout(() => {
        setExporting(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      if (dataType === 'usage') {
        await exportAIUsagePDF(data, defaultDateRange);
      } else if (dataType === 'costs') {
        await exportCostTrendsPDF(data, defaultDateRange);
      } else if (dataType === 'quality') {
        await exportQualityMetricsPDF(data, defaultDateRange);
      } else if (dataType === 'overview') {
        // For overview, export usage data
        await exportAIUsagePDF(data, defaultDateRange);
      }

      setTimeout(() => {
        setExporting(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
      setExporting(false);
    }
  };

  const handleExport = () => {
    if (format === 'csv') {
      exportToCSV();
    } else {
      exportToPDF();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Export Data</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('csv')}
                className={`flex items-center justify-center gap-2 p-4 border-2 rounded-lg transition-all ${
                  format === 'csv'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span className="font-medium">CSV</span>
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={`flex items-center justify-center gap-2 p-4 border-2 rounded-lg transition-all ${
                  format === 'pdf'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span className="font-medium">PDF</span>
              </button>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              <strong>Data Type:</strong> {dataType.charAt(0).toUpperCase() + dataType.slice(1)}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Format:</strong> {format.toUpperCase()}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              <strong>Date Range:</strong> Last 30 days
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
