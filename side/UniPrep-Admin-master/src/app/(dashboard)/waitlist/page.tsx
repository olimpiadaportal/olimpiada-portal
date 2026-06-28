'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import { format } from 'date-fns';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';

interface WaitlistSubscriber {
  id: string;
  email: string;
  name: string | null;
  source: string;
  status: string;
  locale: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  invited_at: string | null;
  registered_at: string | null;
}

interface WaitlistStats {
  total: number;
  pending: number;
  invited: number;
  registered: number;
  unsubscribed: number;
  today: number;
  this_week: number;
  this_month: number;
  by_source: Record<string, number>;
  by_locale: Record<string, number>;
}

export default function WaitlistPage() {
  const [subscribers, setSubscribers] = useState<WaitlistSubscriber[]>([]);
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  const toast = useToast();

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_waitlist_stats');
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error('Error fetching waitlist stats:', error);
      toast.error('Failed to load waitlist statistics');
    }
  }, [toast]);

  const fetchSubscribers = useCallback(async (newPage?: number) => {
    try {
      setLoading(true);
      const currentPage = newPage !== undefined ? newPage : page;
      const offset = currentPage * pageSize;
      
      const { data, error } = await supabase.rpc('get_waitlist_subscribers', {
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_search: searchQuery || null,
        p_limit: pageSize,
        p_offset: offset,
        p_order_by: 'created_at',
        p_order_dir: 'DESC'
      });

      if (error) throw error;

      setSubscribers(data || []);
      if (newPage !== undefined) {
        setPage(newPage);
      }
      setHasMore((data || []).length === pageSize);
    } catch (error) {
      console.error('Error fetching subscribers:', error);
      toast.error('Failed to load waitlist subscribers');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, page, toast]);

  useEffect(() => {
    fetchStats();
    fetchSubscribers(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSubscribers(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchQuery]);

  // Update total count from stats
  useEffect(() => {
    if (stats) {
      setTotalCount(stats.total);
    }
  }, [stats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchSubscribers(0)]);
      toast.success('Data refreshed');
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const updateStatus = async (subscriberId: string, newStatus: string) => {
    try {
      // Find the subscriber for logging
      const subscriber = subscribers.find(s => s.id === subscriberId);
      const oldStatus = subscriber?.status;

      const { data, error } = await supabase.rpc('update_waitlist_status', {
        p_subscriber_id: subscriberId,
        p_status: newStatus
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Unknown error');

      // Log the action
      await auditLogService.logAction({
        actionType: AuditActionTypes.USER_UPDATE,
        tableName: 'waitlist_subscribers',
        recordId: subscriberId,
        oldValues: { status: oldStatus },
        newValues: { status: newStatus },
        description: `Updated waitlist subscriber ${subscriber?.email || subscriberId} status from ${oldStatus} to ${newStatus}`,
      });

      toast.success(`Status updated to ${newStatus}`);
      fetchSubscribers();
      fetchStats();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const bulkUpdateStatus = async (newStatus: string, sendEmail: boolean = false) => {
    if (selectedIds.size === 0) {
      toast.warning('No subscribers selected');
      return;
    }

    setBulkActionLoading(true);
    try {
      const subscriberIds = Array.from(selectedIds);
      
      // Try bulk function first, fallback to individual updates
      const { data, error } = await supabase.rpc('bulk_update_waitlist_status', {
        p_subscriber_ids: subscriberIds,
        p_status: newStatus,
        p_send_email: sendEmail
      });

      if (error) {
        // Fallback to individual updates if bulk function doesn't exist
        for (const id of selectedIds) {
          await supabase.rpc('update_waitlist_status', {
            p_subscriber_id: id,
            p_status: newStatus
          });
        }
      }

      // Log the bulk action
      await auditLogService.logAction({
        actionType: AuditActionTypes.USER_UPDATE,
        tableName: 'waitlist_subscribers',
        newValues: { status: newStatus, send_email: sendEmail },
        description: `Bulk updated ${subscriberIds.length} waitlist subscribers to status: ${newStatus}${sendEmail ? ' (with email)' : ''}`,
        metadata: { subscriber_count: subscriberIds.length, subscriber_ids: subscriberIds.slice(0, 10) },
      });

      toast.success(`Updated ${selectedIds.size} subscribers to ${newStatus}`);
      setSelectedIds(new Set());
      fetchSubscribers();
      fetchStats();
    } catch (error) {
      console.error('Error bulk updating status:', error);
      toast.error('Failed to update subscribers');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === subscribers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(subscribers.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const exportEmails = async (status: string = 'pending') => {
    try {
      const { data, error } = await supabase.rpc('export_waitlist_emails', {
        p_status: status
      });

      if (error) throw error;

      const csvContent = [
        ['Email', 'Name', 'Locale'].join(','),
        ...(data || []).map((row: { email: string; name: string | null; locale: string | null }) => 
          [row.email, row.name || '', row.locale || ''].join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waitlist-${status}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${(data || []).length} emails`);
      setExportMenuOpen(false);
    } catch (error) {
      console.error('Error exporting emails:', error);
      toast.error('Failed to export emails');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      invited: 'bg-blue-100 text-blue-800',
      registered: 'bg-green-100 text-green-800',
      unsubscribed: 'bg-gray-100 text-gray-800'
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getSourceBadge = (source: string) => {
    const styles: Record<string, string> = {
      hero: 'bg-purple-100 text-purple-800',
      showcase: 'bg-indigo-100 text-indigo-800',
      landing_page: 'bg-blue-100 text-blue-800',
      referral: 'bg-green-100 text-green-800',
      social: 'bg-pink-100 text-pink-800'
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[source] || 'bg-gray-100 text-gray-800'}`}>
        {source}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Waitlist</h1>
          <p className="text-gray-600 mt-1">Manage pre-launch waitlist subscribers</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/notifications/templates"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            ✉️ Email Templates
          </Link>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              📥 Export
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-10">
                <button
                  onClick={() => exportEmails('pending')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 rounded-t-lg"
                >
                  Export Pending Emails
                </button>
                <button
                  onClick={() => exportEmails('invited')}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 rounded-b-lg"
                >
                  Export Invited Emails
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">Total Subscribers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-gray-500">
                {stats.pending} pending, {stats.invited} invited
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-gray-500">new signups today</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.this_week}</div>
              <p className="text-xs text-gray-500">signups this week</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">Conversion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.total > 0 ? Math.round((stats.registered / stats.total) * 100) : 0}%
              </div>
              <p className="text-xs text-gray-500">
                {stats.registered} registered users
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Source & Locale Breakdown */}
      {stats && (stats.by_source || stats.by_locale) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.by_source && Object.keys(stats.by_source).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.by_source).map(([source, count]) => (
                    <span key={source} className="px-2 py-1 bg-gray-100 rounded text-sm">
                      {source}: {count}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {stats.by_locale && Object.keys(stats.by_locale).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">🌐 By Language</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.by_locale).map(([locale, count]) => (
                    <span key={locale} className="px-2 py-1 bg-gray-100 rounded text-sm">
                      {locale.toUpperCase()}: {count}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Subscribers Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Subscribers</h2>
              <p className="text-sm text-gray-600">View and manage waitlist subscribers</p>
            </div>
            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
                <span className="text-sm font-medium text-blue-700">
                  {selectedIds.size} selected
                </span>
                <div className="h-4 w-px bg-blue-200" />
                <button
                  onClick={() => bulkUpdateStatus('invited', true)}
                  disabled={bulkActionLoading}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  ✉️ Send Invite
                </button>
                <button
                  onClick={() => bulkUpdateStatus('registered')}
                  disabled={bulkActionLoading}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                >
                  ✅ Mark Registered
                </button>
                <button
                  onClick={() => bulkUpdateStatus('unsubscribed')}
                  disabled={bulkActionLoading}
                  className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1"
                >
                  ❌ Unsubscribe
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
              <option value="registered">Registered</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={subscribers.length > 0 && selectedIds.size === subscribers.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Locale</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {loading ? 'Loading...' : 'No subscribers found'}
                    </td>
                  </tr>
                ) : (
                  subscribers.map((subscriber) => (
                    <tr key={subscriber.id} className={`hover:bg-gray-50 ${selectedIds.has(subscriber.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(subscriber.id)}
                          onChange={() => toggleSelect(subscriber.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{subscriber.email}</td>
                      <td className="px-4 py-3 text-gray-600">{subscriber.name || '-'}</td>
                      <td className="px-4 py-3">{getSourceBadge(subscriber.source)}</td>
                      <td className="px-4 py-3">{getStatusBadge(subscriber.status)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {subscriber.locale?.toUpperCase() || '?'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {format(new Date(subscriber.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {subscriber.status === 'pending' && (
                            <button
                              onClick={() => updateStatus(subscriber.id, 'invited')}
                              title="Send Invite"
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              ✉️
                            </button>
                          )}
                          {(subscriber.status === 'pending' || subscriber.status === 'invited') && (
                            <button
                              onClick={() => updateStatus(subscriber.id, 'registered')}
                              title="Mark as Registered"
                              className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                            >
                              ✅
                            </button>
                          )}
                          {subscriber.status !== 'unsubscribed' && (
                            <button
                              onClick={() => updateStatus(subscriber.id, 'unsubscribed')}
                              title="Unsubscribe"
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              ❌
                            </button>
                          )}
                          {subscriber.status === 'unsubscribed' && (
                            <button
                              onClick={() => updateStatus(subscriber.id, 'pending')}
                              title="Re-activate"
                              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              🔄
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t mt-4 rounded-b-lg">
              <div className="text-sm text-gray-700">
                Showing {(page * pageSize) + 1} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} subscribers
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchSubscribers(Math.max(0, page - 1))}
                  disabled={page === 0 || loading}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-gray-700">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => fetchSubscribers(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1 || loading}
                  className="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Waitlist Workflow Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">📋 Waitlist Workflow</h3>
        <div className="text-sm text-blue-800 space-y-1">
          <p><strong>1. Pending:</strong> User signed up for waitlist (default state)</p>
          <p><strong>2. Invited:</strong> You sent them an invite email to register (click ✉️ or use bulk action)</p>
          <p><strong>3. Registered:</strong> User completed registration (mark manually or auto-detect)</p>
          <p><strong>4. Unsubscribed:</strong> User opted out or was removed</p>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-200 text-sm text-blue-700">
          <strong>💡 Tip:</strong> Select multiple subscribers using checkboxes, then use bulk actions to send invites or update status for all at once.
        </div>
      </div>
    </div>
  );
}
