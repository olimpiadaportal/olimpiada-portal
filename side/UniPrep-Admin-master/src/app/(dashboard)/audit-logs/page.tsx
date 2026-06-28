'use client';

import { useState, useEffect, useCallback } from 'react';
import RoleGuard from '@/components/auth/RoleGuard';
import { auditLogService, AuditLog, AuditLogDetail, AuditStats, FilterOptions, AuditLogFilters } from '@/services/auditLogService';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalLogs, setTotalLogs] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [searchInput, setSearchInput] = useState('');

  // Load initial data
  useEffect(() => {
    loadFilterOptions();
    loadStats();
  }, []);

  // Load logs when filters or page changes
  useEffect(() => {
    loadLogs();
  }, [filters, page]);

  const loadFilterOptions = async () => {
    try {
      const options = await auditLogService.getFilterOptions();
      setFilterOptions(options);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await auditLogService.getStats(30);
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { logs: data, total } = await auditLogService.getAuditLogs(filters, page, pageSize);
      setLogs(data);
      setTotalLogs(total);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search: searchInput || undefined }));
    setPage(1);
  };

  const handleFilterChange = (key: keyof AuditLogFilters, value: string | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setPage(1);
  };

  const handleViewDetail = async (logId: string) => {
    try {
      const detail = await auditLogService.getLogDetail(logId);
      setSelectedLog(detail);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error loading log detail:', error);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const content = format === 'csv' 
        ? await auditLogService.exportToCSV(filters)
        : await auditLogService.exportToJSON(filters);
      
      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      auditLogService.downloadFile(content, filename, format);
    } catch (error) {
      console.error('Error exporting:', error);
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setFilters({});
    setSearchInput('');
    setPage(1);
  };

  const totalPages = Math.ceil(totalLogs / pageSize);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getActionBadgeColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE':
      case 'INSERT':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      case 'LOGIN':
        return 'bg-purple-100 text-purple-800';
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-800';
      case 'SYSTEM_CONFIG':
        return 'bg-orange-100 text-orange-800';
      case 'SEND_NOTIFICATION':
        return 'bg-indigo-100 text-indigo-800';
      case 'RESET_LEADERBOARD':
        return 'bg-red-100 text-red-800';
      case 'ADJUST_SCORE':
        return 'bg-yellow-100 text-yellow-800';
      case 'EXPORT_DATA':
        return 'bg-cyan-100 text-cyan-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format action type to human-readable
  const formatActionType = (action: string) => {
    const actionMap: Record<string, string> = {
      'CREATE': 'Create',
      'UPDATE': 'Update',
      'DELETE': 'Delete',
      'LOGIN': 'Login',
      'LOGOUT': 'Logout',
      'SYSTEM_CONFIG': 'Settings Update',
      'SEND_NOTIFICATION': 'Send Notification',
      'RESET_LEADERBOARD': 'Reset Leaderboard',
      'ADJUST_SCORE': 'Adjust Score',
      'EXPORT_DATA': 'Export Data',
      'ARCHIVE_SEASON': 'Archive Season',
    };
    return actionMap[action.toUpperCase()] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Format table name to human-readable
  const formatTableName = (tableName: string | null) => {
    if (!tableName) return '-';
    const tableMap: Record<string, string> = {
      'system_settings': 'System Settings',
      'questions': 'Questions',
      'subjects': 'Subjects',
      'exams': 'Exams',
      'exam_groups': 'Exam Groups',
      'students': 'Students',
      'teachers': 'Teachers',
      'notifications': 'Notifications',
      'leaderboard_entries': 'Leaderboard',
      'leaderboard_seasons': 'Seasons',
      'feature_flags': 'Feature Flags',
      'app_versions': 'App Versions',
      'admin_users': 'Admin Users',
    };
    return tableMap[tableName] || tableName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Get record identifier (use setting_key from metadata for system_settings)
  const getRecordIdentifier = (log: AuditLog) => {
    // For system settings, show the setting key from metadata or old/new values
    if (log.table_name === 'system_settings') {
      // Try to get setting key from old_values or new_values
      const oldKeys = log.old_values ? Object.keys(log.old_values) : [];
      const newKeys = log.new_values ? Object.keys(log.new_values) : [];
      const settingKey = oldKeys[0] || newKeys[0];
      if (settingKey && settingKey !== 'description' && settingKey !== 'setting_key') {
        return settingKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
      // Check metadata for setting_key
      if (log.old_values && typeof log.old_values === 'object' && 'setting_key' in log.old_values) {
        const settingKeyValue = (log.old_values as Record<string, unknown>).setting_key;
        if (typeof settingKeyValue === 'string') {
          return settingKeyValue.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }
    // For other tables, show truncated UUID
    if (log.record_id) {
      return log.record_id.substring(0, 8) + '...';
    }
    return '-';
  };

  return (
    <RoleGuard allowedRoles={['super_admin']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Audit Logs</h1>
          <p className="text-gray-600">Track all admin actions and system changes</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : '📥 Export CSV'}
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : '📥 Export JSON'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border">
            <p className="text-sm text-gray-600">Total Logs</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_logs.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <p className="text-sm text-gray-600">Today</p>
            <p className="text-2xl font-bold text-blue-600">{stats.logs_today.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <p className="text-sm text-gray-600">This Week</p>
            <p className="text-2xl font-bold text-green-600">{stats.logs_this_week.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <p className="text-sm text-gray-600">This Month</p>
            <p className="text-2xl font-bold text-purple-600">{stats.logs_this_month.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search logs..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                🔍
              </button>
            </div>
          </div>

          {/* Admin Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin</label>
            <select
              value={filters.adminId || ''}
              onChange={(e) => handleFilterChange('adminId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Admins</option>
              {filterOptions?.admins?.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name || admin.email}
                </option>
              ))}
            </select>
          </div>

          {/* Action Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
            <select
              value={filters.actionType || ''}
              onChange={(e) => handleFilterChange('actionType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              {filterOptions?.action_types?.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Table Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
            <select
              value={filters.tableName || ''}
              onChange={(e) => handleFilterChange('tableName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Tables</option>
              {filterOptions?.table_names?.map((table) => (
                <option key={table} value={table}>{table}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Range & Clear */}
        <div className="mt-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate?.toISOString().split('T')[0] || ''}
              onChange={(e) => handleFilterChange('startDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate?.toISOString().split('T')[0] || ''}
              onChange={(e) => handleFilterChange('endDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Table
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Record ID
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(log.log_timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.admin_name || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {log.admin_email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(log.action_type)}`}>
                        {formatActionType(log.action_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTableName(log.table_name)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {getRecordIdentifier(log)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handleViewDetail(log.log_id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, totalLogs)} of {totalLogs} logs
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-gray-900">Audit Log Detail</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">ID</p>
                    <p className="font-mono text-sm">{selectedLog.log_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Timestamp</p>
                    <p className="font-medium">{formatTimestamp(selectedLog.log_timestamp)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Admin</p>
                    <p className="font-medium">{selectedLog.admin_name || selectedLog.admin_email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Action</p>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionBadgeColor(selectedLog.action_type)}`}>
                      {selectedLog.action_type}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Table</p>
                    <p className="font-medium">{selectedLog.table_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Record ID</p>
                    <p className="font-mono text-sm">{selectedLog.record_id || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IP Address</p>
                    <p className="font-mono text-sm">{selectedLog.ip_address || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">User Agent</p>
                    <p className="text-sm truncate" title={selectedLog.user_agent || ''}>
                      {selectedLog.user_agent || '-'}
                    </p>
                  </div>
                </div>

                {/* Changes */}
                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Changes</h3>
                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Old Value</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedLog.changes.map((change, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">{change.field}</td>
                              <td className="px-4 py-2 text-sm text-red-600 font-mono">
                                {JSON.stringify(change.old_value)}
                              </td>
                              <td className="px-4 py-2 text-sm text-green-600 font-mono">
                                {JSON.stringify(change.new_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Raw Values */}
                {(selectedLog.old_values || selectedLog.new_values) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Raw Data</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedLog.old_values && (
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Old Values</p>
                          <pre className="bg-red-50 p-3 rounded-lg text-xs overflow-x-auto max-h-40">
                            {JSON.stringify(selectedLog.old_values, null, 2)}
                          </pre>
                        </div>
                      )}
                      {selectedLog.new_values && (
                        <div>
                          <p className="text-sm text-gray-500 mb-1">New Values</p>
                          <pre className="bg-green-50 p-3 rounded-lg text-xs overflow-x-auto max-h-40">
                            {JSON.stringify(selectedLog.new_values, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </RoleGuard>
  );
}
