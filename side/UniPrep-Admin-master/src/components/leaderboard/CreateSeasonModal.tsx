'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import { auditLogService, ValidDbActionTypes } from '@/services/auditLogService';

interface CreateSeasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserAdminId?: string;
}

export default function CreateSeasonModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserAdminId,
}: CreateSeasonModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Season name is required');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('create_season', {
        p_name: formData.name,
        p_start_date: formData.start_date,
        p_description: formData.description || null,
        p_end_date: formData.end_date || null,
        p_created_by: currentUserAdminId || null,
      });

      if (error) {
        console.error('Error creating season:', error);
        toast.error(error.message || 'Failed to create season');
        return;
      }

      if (data && !data.success) {
        toast.error(data.error || 'Failed to create season');
        return;
      }

      // Log the season creation
      await auditLogService.logAction({
        actionType: ValidDbActionTypes.CREATE,
        tableName: 'leaderboard_seasons',
        recordId: data?.data?.season_id,
        newValues: {
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date || null
        },
        description: `Created new leaderboard season: ${formData.name}`,
        metadata: { description: formData.description }
      });
      
      toast.success('Season created successfully');
      onSuccess();
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
      });
    } catch (err) {
      console.error('Exception creating season:', err);
      toast.error('An error occurred while creating the season');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Season</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Season Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Season Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., Spring 2025"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Optional description"
                rows={3}
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                min={formData.start_date}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Season'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
