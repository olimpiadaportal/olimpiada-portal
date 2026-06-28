'use client';

import { useState, useEffect } from 'react';
import { studyTipsService, StudyTip, StudyTipInput, StudyTipsStats } from '@/services/studyTipsService';
import { usePermissions } from '@/hooks/usePermissions';

const CATEGORIES = [
  { value: 'motivation', label: 'Motivation', icon: '💪', color: 'bg-purple-100 text-purple-700' },
  { value: 'technique', label: 'Technique', icon: '🧠', color: 'bg-blue-100 text-blue-700' },
  { value: 'health', label: 'Health', icon: '🧘', color: 'bg-green-100 text-green-700' },
  { value: 'time-management', label: 'Time Management', icon: '⏰', color: 'bg-orange-100 text-orange-700' },
];

const EMOJI_OPTIONS = ['💪', '🎯', '🌟', '✨', '🔥', '💡', '🧠', '📚', '📝', '🎓', '🏆', '⭐', '🚀', '💎', '🧘', '💧', '😴', '🍎', '🏃', '🧩', '📅', '⏰', '📊', '✅', '🌈'];

export default function StudyTipsPage() {
  const { canEditUsers, canDeleteUsers, isModerator } = usePermissions();
  const [tips, setTips] = useState<StudyTip[]>([]);
  const [stats, setStats] = useState<StudyTipsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTip, setEditingTip] = useState<StudyTip | null>(null);
  const [selectedTips, setSelectedTips] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    category: '',
    isActive: undefined as boolean | undefined,
    search: '',
  });
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [showError, setShowError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<StudyTipInput>({
    category: 'motivation',
    tip_text: '',
    icon: '💡',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tipsData, statsData] = await Promise.all([
        studyTipsService.getStudyTips({
          category: filters.category || undefined,
          isActive: filters.isActive,
          search: filters.search || undefined,
        }),
        studyTipsService.getStats(),
      ]);
      setTips(tipsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      setShowError('Failed to load study tips');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTip) {
        await studyTipsService.updateStudyTip(editingTip.id, formData);
        setShowSuccess('Study tip updated successfully!');
      } else {
        await studyTipsService.createStudyTip(formData);
        setShowSuccess('Study tip created successfully!');
      }
      setShowModal(false);
      setEditingTip(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving study tip:', error);
      setShowError('Failed to save study tip');
    }
  };

  const handleEdit = (tip: StudyTip) => {
    setEditingTip(tip);
    setFormData({
      category: tip.category,
      tip_text: tip.tip_text,
      icon: tip.icon,
      is_active: tip.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this study tip?')) return;
    try {
      await studyTipsService.deleteStudyTip(id);
      setShowSuccess('Study tip deleted successfully!');
      loadData();
    } catch (error) {
      console.error('Error deleting study tip:', error);
      setShowError('Failed to delete study tip');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await studyTipsService.toggleStudyTipStatus(id, !currentStatus);
      loadData();
    } catch (error) {
      console.error('Error toggling status:', error);
      setShowError('Failed to update status');
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedTips.length === 0) return;
    
    const confirmMessage = action === 'delete' 
      ? `Are you sure you want to delete ${selectedTips.length} study tip(s)?`
      : `Are you sure you want to ${action} ${selectedTips.length} study tip(s)?`;
    
    if (!confirm(confirmMessage)) return;

    try {
      if (action === 'delete') {
        await studyTipsService.bulkDelete(selectedTips);
        setShowSuccess(`${selectedTips.length} study tip(s) deleted successfully!`);
      } else {
        await studyTipsService.bulkToggleStatus(selectedTips, action === 'activate');
        setShowSuccess(`${selectedTips.length} study tip(s) ${action}d successfully!`);
      }
      setSelectedTips([]);
      loadData();
    } catch (error) {
      console.error('Error performing bulk action:', error);
      setShowError('Failed to perform bulk action');
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'motivation',
      tip_text: '',
      icon: '💡',
      is_active: true,
    });
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find(c => c.value === category) || CATEGORIES[0];
  };

  // Auto-hide messages
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💡 Study Tips & Motivation</h1>
          <p className="text-gray-600 mt-1">Manage motivational messages shown to students (rotates every hour)</p>
        </div>
        {canEditUsers && (
          <button
            onClick={() => {
              resetForm();
              setEditingTip(null);
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>➕</span>
            Add New Tip
          </button>
        )}
      </div>

      {/* Moderator Notice */}
      {isModerator && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            ℹ️ <strong>View-only access:</strong> As a moderator, you can view study tips but cannot create, edit, or delete them.
          </p>
        </div>
      )}

      {/* Success/Error Messages */}
      {showSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
          <span className="text-xl">✅</span>
          <span>{showSuccess}</span>
        </div>
      )}
      {showError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
          <span className="text-xl">❌</span>
          <span>{showError}</span>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Tips</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                <p className="text-sm text-gray-500">Active</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">💪</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.byCategory.motivation}</p>
                <p className="text-sm text-gray-500">Motivation</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">🧠</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.byCategory.technique}</p>
                <p className="text-sm text-gray-500">Technique</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">🧘</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.byCategory.health}</p>
                <p className="text-sm text-gray-500">Health</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <span className="text-xl">⏰</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.byCategory['time-management']}</p>
                <p className="text-sm text-gray-500">Time Mgmt</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search tips..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={filters.category}
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
            ))}
          </select>
          <select
            value={filters.isActive === undefined ? '' : filters.isActive.toString()}
            onChange={(e) => setFilters(prev => ({ 
              ...prev, 
              isActive: e.target.value === '' ? undefined : e.target.value === 'true' 
            }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedTips.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-blue-700">{selectedTips.length} tip(s) selected</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction('activate')}
              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkAction('deactivate')}
              className="px-3 py-1 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
            >
              Deactivate
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Delete
            </button>
            <button
              onClick={() => setSelectedTips([])}
              className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Tips Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            Loading study tips...
          </div>
        ) : tips.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <span className="text-4xl mb-4 block">📝</span>
            No study tips found. Create your first one!
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedTips.length === tips.length && tips.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTips(tips.map(t => t.id));
                      } else {
                        setSelectedTips([]);
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Icon</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tip Text</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tips.map((tip) => {
                const categoryInfo = getCategoryInfo(tip.category);
                return (
                  <tr key={tip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedTips.includes(tip.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTips(prev => [...prev, tip.id]);
                          } else {
                            setSelectedTips(prev => prev.filter(id => id !== tip.id));
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-2xl">{tip.icon}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900 max-w-md">{tip.tip_text}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryInfo.color}`}>
                        {categoryInfo.icon} {categoryInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleStatus(tip.id, tip.is_active)}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          tip.is_active 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {tip.is_active ? '✅ Active' : '⏸️ Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(tip)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(tip.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingTip ? '✏️ Edit Study Tip' : '➕ Add New Study Tip'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, category: cat.value as 'motivation' | 'technique' | 'health' | 'time-management' }))}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        formData.category === cat.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{cat.icon}</span>
                      <span className="block text-sm mt-1">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon: emoji }))}
                      className={`w-10 h-10 rounded-lg border-2 text-xl transition-colors ${
                        formData.icon === emoji
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tip Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tip Text</label>
                <textarea
                  value={formData.tip_text}
                  onChange={(e) => setFormData(prev => ({ ...prev, tip_text: e.target.value }))}
                  placeholder="Enter your motivational tip..."
                  rows={3}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  Active (visible to students)
                </label>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500 mb-2">Preview:</p>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{formData.icon}</span>
                  <p className="text-gray-900">{formData.tip_text || 'Your tip will appear here...'}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingTip(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingTip ? 'Update Tip' : 'Create Tip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
