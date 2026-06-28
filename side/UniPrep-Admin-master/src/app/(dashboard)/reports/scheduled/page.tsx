'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ScheduledReport, ReportFrequency, ReportFormat, REPORT_TEMPLATES } from '@/types/reports';
import { useToast } from '@/contexts/ToastContext';

interface ScheduledReportDB {
  id: string;
  template_id: string;
  template_name: string;
  frequency: ReportFrequency;
  recipients: string[];
  format: ReportFormat;
  next_run_at: string;
  last_run_at: string | null;
  is_active: boolean;
  config: {
    day_of_week?: number;
    day_of_month?: number;
    time: string;
  };
  created_at: string;
  created_by: string;
}

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<ScheduledReportDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<ScheduledReportDB | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Form state
  const [formData, setFormData] = useState({
    template_id: '',
    template_name: '',
    frequency: 'weekly' as ReportFrequency,
    recipients: '',
    format: 'pdf' as ReportFormat,
    time: '09:00',
    day_of_week: 1,
    day_of_month: 1,
  });

  useEffect(() => {
    loadScheduledReports();
    checkEmailConfiguration();
  }, []);

  const loadScheduledReports = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .order('next_run_at', { ascending: true });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Load scheduled reports error:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkEmailConfiguration = async () => {
    try {
      const res = await fetch('/api/email/check-config');
      if (res.ok) {
        const data = await res.json();
        setEmailConfigured(data.configured ?? false);
      } else {
        setEmailConfigured(false);
      }
    } catch (error) {
      console.warn('Email config check failed:', error);
      setEmailConfigured(false);
    }
  };

  const calculateNextRunAt = (frequency: ReportFrequency, time: string, dayOfWeek?: number, dayOfMonth?: number): string => {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    switch (frequency) {
      case 'daily':
        break;
      case 'weekly':
        const currentDay = next.getDay();
        const targetDay = dayOfWeek || 1;
        const daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0 && next <= now) {
          next.setDate(next.getDate() + 7);
        } else {
          next.setDate(next.getDate() + daysUntilTarget);
        }
        break;
      case 'monthly':
        const targetDate = dayOfMonth || 1;
        next.setDate(targetDate);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;
    }

    return next.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const recipientList = formData.recipients.split(',').map(r => r.trim()).filter(r => r);
    if (recipientList.length === 0) {
      toast.error('Please enter at least one recipient email');
      return;
    }

    // Validate emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipientList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email(s): ${invalidEmails.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const nextRunAt = calculateNextRunAt(
        formData.frequency,
        formData.time,
        formData.day_of_week,
        formData.day_of_month
      );

      const reportData = {
        template_id: formData.template_id,
        template_name: formData.template_name,
        frequency: formData.frequency,
        recipients: recipientList,
        format: formData.format,
        next_run_at: nextRunAt,
        is_active: true,
        config: {
          time: formData.time,
          day_of_week: formData.frequency === 'weekly' ? formData.day_of_week : undefined,
          day_of_month: formData.frequency === 'monthly' ? formData.day_of_month : undefined,
        },
        created_by: user.id,
      };

      if (editingReport) {
        const { error } = await supabase
          .from('scheduled_reports')
          .update(reportData)
          .eq('id', editingReport.id);
        if (error) throw error;
        toast.success('Scheduled report updated');
      } else {
        const { error } = await supabase
          .from('scheduled_reports')
          .insert(reportData);
        if (error) throw error;
        toast.success('Scheduled report created');
      }

      setShowCreateModal(false);
      setEditingReport(null);
      resetForm();
      await loadScheduledReports();
    } catch (error: any) {
      console.error('Save report error:', error);
      toast.error(error.message || 'Failed to save scheduled report');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      template_id: '',
      template_name: '',
      frequency: 'weekly',
      recipients: '',
      format: 'pdf',
      time: '09:00',
      day_of_week: 1,
      day_of_month: 1,
    });
  };

  const handleEdit = (report: ScheduledReportDB) => {
    setEditingReport(report);
    setFormData({
      template_id: report.template_id,
      template_name: report.template_name,
      frequency: report.frequency,
      recipients: report.recipients.join(', '),
      format: report.format,
      time: report.config.time || '09:00',
      day_of_week: report.config.day_of_week || 1,
      day_of_month: report.config.day_of_month || 1,
    });
    setShowCreateModal(true);
  };

  const handleToggleActive = async (reportId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: !currentStatus })
        .eq('id', reportId);

      if (error) throw error;
      toast.success(`Report ${currentStatus ? 'paused' : 'activated'}`);
      await loadScheduledReports();
    } catch (error) {
      console.error('Toggle report error:', error);
      toast.error('Failed to update report status');
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this scheduled report?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;
      toast.success('Scheduled report deleted');
      await loadScheduledReports();
    } catch (error) {
      console.error('Delete report error:', error);
      toast.error('Failed to delete report');
    }
  };

  const handleRunNow = async (report: ScheduledReportDB) => {
    try {
      toast.info('Triggering report generation...');
      const response = await fetch('/api/reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to run report');
      }

      toast.success('Report generated and sent to recipients');
      await loadScheduledReports();
    } catch (error: any) {
      console.error('Run report error:', error);
      toast.error(error.message || 'Failed to run report');
    }
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading scheduled reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Scheduled Reports</h1>
          <p className="text-gray-600 mt-1">Automate report generation and email delivery</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingReport(null);
            setShowCreateModal(true);
          }}
          disabled={!emailConfigured}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule New Report
        </button>
      </div>

      {/* Email Configuration Warning */}
      {!emailConfigured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-yellow-600 text-xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1">Email Service Not Configured</h3>
              <p className="text-sm text-yellow-800">
                To use scheduled reports, configure SMTP in your environment variables:
                <code className="bg-yellow-100 px-1 mx-1 rounded">SMTP_HOST</code>,
                <code className="bg-yellow-100 px-1 mx-1 rounded">SMTP_USER</code>,
                <code className="bg-yellow-100 px-1 mx-1 rounded">SMTP_PASS</code>,
                <code className="bg-yellow-100 px-1 mx-1 rounded">SMTP_FROM_EMAIL</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Configured Success */}
      {emailConfigured && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-green-600 text-xl">✅</span>
            <p className="text-sm text-green-800">
              <strong>Email service configured.</strong> Reports will be sent via Brevo SMTP.
            </p>
          </div>
        </div>
      )}

      {/* Scheduled Reports List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {reports.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-6xl mb-4 block">📊</span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Scheduled Reports</h3>
            <p className="text-gray-600 mb-4">Create your first scheduled report to automate report delivery</p>
            {emailConfigured && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Scheduled Report
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Report</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Frequency</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Recipients</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Next Run</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Last Run</th>
                <th className="text-left text-xs font-medium text-gray-600 uppercase py-3 px-6">Status</th>
                <th className="text-right text-xs font-medium text-gray-600 uppercase py-3 px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="py-4 px-6">
                    <div className="font-medium text-gray-900">{report.template_name}</div>
                    <div className="text-sm text-gray-500">{report.format.toUpperCase()} format</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm capitalize">
                      {report.frequency}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      at {report.config.time}
                      {report.frequency === 'weekly' && ` on ${dayNames[report.config.day_of_week || 0]}`}
                      {report.frequency === 'monthly' && ` on day ${report.config.day_of_month}`}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">{report.recipients.length} recipient(s)</div>
                    <div className="text-xs text-gray-500 truncate max-w-[150px]" title={report.recipients.join(', ')}>
                      {report.recipients[0]}
                      {report.recipients.length > 1 && ` +${report.recipients.length - 1} more`}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-900">
                      {new Date(report.next_run_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(report.next_run_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    {report.last_run_at ? (
                      <>
                        <div className="text-sm text-gray-900">
                          {new Date(report.last_run_at).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(report.last_run_at).toLocaleTimeString()}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    <button
                      onClick={() => handleToggleActive(report.id, report.is_active)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        report.is_active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {report.is_active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRunNow(report)}
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded"
                        title="Run Now"
                      >
                        ▶️
                      </button>
                      <button
                        onClick={() => handleEdit(report)}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(report.id)}
                        className="p-1.5 text-red-600 hover:bg-red-100 rounded"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-blue-600 text-xl">ℹ️</span>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">How Scheduled Reports Work</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Reports are generated automatically at the scheduled time</li>
              <li>• Recipients receive the report via email as an attachment</li>
              <li>• You can pause, edit, or delete scheduled reports at any time</li>
              <li>• Use "Run Now" to manually trigger a report immediately</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingReport ? 'Edit Scheduled Report' : 'Create Scheduled Report'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingReport(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Report Template */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Report Template *
                  </label>
                  <select
                    value={formData.template_id}
                    onChange={(e) => {
                      const template = REPORT_TEMPLATES.find((_, i) => `template_${i + 1}` === e.target.value);
                      setFormData({
                        ...formData,
                        template_id: e.target.value,
                        template_name: template?.name || '',
                      });
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a report template</option>
                    {REPORT_TEMPLATES.map((template, index) => (
                      <option key={index} value={`template_${index + 1}`}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {formData.template_id && (
                    <p className="text-xs text-gray-500 mt-1">
                      {REPORT_TEMPLATES.find((_, i) => `template_${i + 1}` === formData.template_id)?.description}
                    </p>
                  )}
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Frequency *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as ReportFrequency })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {/* Day of Week (for weekly) */}
                {formData.frequency === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Day of Week
                    </label>
                    <select
                      value={formData.day_of_week}
                      onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {dayNames.map((day, index) => (
                        <option key={index} value={index}>{day}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Day of Month (for monthly) */}
                {formData.frequency === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Day of Month
                    </label>
                    <select
                      value={formData.day_of_month}
                      onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Days 29-31 may be skipped in shorter months
                    </p>
                  </div>
                )}

                {/* Time */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time (UTC) *
                  </label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Report Format *
                  </label>
                  <select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as ReportFormat })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                  </select>
                </div>

                {/* Recipients */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipients (comma-separated emails) *
                  </label>
                  <textarea
                    value={formData.recipients}
                    onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
                    placeholder="admin@example.com, manager@example.com"
                    required
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingReport(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingReport ? 'Update Report' : 'Create Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
