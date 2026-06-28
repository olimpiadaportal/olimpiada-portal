'use client';

import { useState, useEffect } from 'react';
import { History, Download, Filter, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AuditLogEntry {
  id: string;
  admin_name: string;
  action: string;
  category: string;
  setting_key: string;
  setting_name?: string; // Formatted name from SQL function
  old_value: any;
  new_value: any;
  status: string;
  created_at: string;
}

interface Filters {
  action: string;
  category: string;
  status: string;
}

export default function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30); // days
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    action: '',
    category: '',
    status: ''
  });

  // Get unique values from logs for filter dropdowns
  const uniqueActions = [...new Set(logs.map(log => log.action).filter(Boolean))];
  const uniqueCategories = [...new Set(logs.map(log => log.category).filter(Boolean))];
  const uniqueStatuses = [...new Set(logs.map(log => log.status).filter(Boolean))];

  useEffect(() => {
    loadLogs();
  }, [dateRange]);

  async function loadLogs() {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);

      const { data, error } = await supabase.rpc('get_settings_audit_log', {
        p_admin_id: null, // NULL to see all admin logs
        p_start_date: startDate.toISOString(),
        p_end_date: new Date().toISOString(),
        p_limit: 100
      });

      if (error) throw error;
      setLogs(data || []);
      setFilteredLogs(data || []);
    } catch (error) {
      console.error('Error loading audit log:', error);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...logs];

    if (filters.action) {
      filtered = filtered.filter(log => 
        log.action?.toLowerCase() === filters.action.toLowerCase()
      );
    }

    if (filters.category) {
      filtered = filtered.filter(log => 
        log.category?.toLowerCase() === filters.category.toLowerCase()
      );
    }

    if (filters.status) {
      filtered = filtered.filter(log => 
        log.status?.toLowerCase() === filters.status.toLowerCase()
      );
    }

    setFilteredLogs(filtered);
    setShowFilterModal(false);
  }

  function clearFilters() {
    setFilters({ action: '', category: '', status: '' });
    setFilteredLogs(logs);
    setShowFilterModal(false);
  }

  function handleExport() {
    const csv = [
      ['Date', 'Admin', 'Action', 'Category', 'Setting', 'Old Value', 'New Value', 'Status'],
      ...filteredLogs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.admin_name,
        log.action,
        log.category,
        log.setting_name || log.setting_key,
        JSON.stringify(log.old_value),
        JSON.stringify(log.new_value),
        log.status
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatValue = (value: any, category?: string) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
    if (typeof value === 'string') return value.replace(/"/g, '');
    if (typeof value === 'number') return value.toString();
    
    // Special handling for feature flags - show just ON/OFF
    if (typeof value === 'object' && category === 'feature_flags') {
      if ('is_enabled' in value) {
        return value.is_enabled ? 'ON' : 'OFF';
      }
    }
    
    // For other objects, show a cleaner format
    if (typeof value === 'object') {
      // If it's a simple value wrapper, extract it
      if (Object.keys(value).length === 1) {
        const key = Object.keys(value)[0];
        const val = value[key];
        if (typeof val === 'boolean') return val ? 'ON' : 'OFF';
        return String(val);
      }
      return JSON.stringify(value).replace(/"/g, '');
    }
    return String(value);
  };

  const formatCategory = (category: string) => {
    const categoryMap: Record<string, string> = {
      'feature_flags': 'Feature Flags',
      'general': 'General',
      'notification': 'Notification',
      'security': 'Security',
      'payment': 'Payment',
      'feature': 'Feature'
    };
    return categoryMap[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      case 'reverted':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading audit log...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-600 mt-1">View all settings changes and modifications</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button 
            onClick={() => setShowFilterModal(true)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            Filter
            {(filters.action || filters.category || filters.status) && (
              <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                Active
              </span>
            )}
          </button>
          <button 
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date & Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Setting
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                To
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  {logs.length === 0 ? 'No audit log entries found' : 'No entries match the current filters'}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.admin_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.action}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100">
                      {formatCategory(log.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.setting_name || log.setting_key}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={formatValue(log.old_value, log.category)}>
                    {formatValue(log.old_value, log.category)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium max-w-xs truncate" title={formatValue(log.new_value, log.category)}>
                    {formatValue(log.new_value, log.category)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Filter Audit Log</h3>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Action Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Actions</option>
                  {uniqueActions.map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {uniqueCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  {uniqueStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={clearFilters}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear Filters
              </button>
              <button
                onClick={applyFilters}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
