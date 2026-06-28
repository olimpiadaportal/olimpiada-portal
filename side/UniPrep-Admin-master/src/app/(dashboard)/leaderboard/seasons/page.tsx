'use client';

import { useState, useEffect } from 'react';
import { leaderboardService } from '@/services/leaderboardService';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import type { LeaderboardSeason } from '@/types/leaderboard';
import { SkeletonStats } from '@/components/ui/SkeletonLoader';
import { ErrorDisplay } from '@/components/ErrorBoundary';
import CreateSeasonModal from '@/components/leaderboard/CreateSeasonModal';

export default function ManageSeasonsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<LeaderboardSeason[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentUserAdminId, setCurrentUserAdminId] = useState<string | null>(null);

  useEffect(() => {
    fetchSeasons();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: admin } = await supabase
        .from('admins')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (admin) {
        setCurrentUserAdminId(admin.id);
      }
    }
  };

  const fetchSeasons = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await leaderboardService.getAllSeasons();

      if (!result.success) {
        setError(result.error || 'Failed to load seasons');
        return;
      }

      setSeasons(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (seasonId: string) => {
    if (!confirm('Are you sure you want to archive this season?')) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('archive_season', {
        p_season_id: seasonId,
      });

      if (error) {
        toast.error(error.message || 'Failed to archive season');
        return;
      }

      if (data && !data.success) {
        toast.error(data.error || 'Failed to archive season');
        return;
      }

      toast.success('Season archived successfully');
      fetchSeasons();
    } catch (err) {
      console.error('Exception archiving season:', err);
      toast.error('An error occurred while archiving the season');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Manage Seasons</h1>
        <SkeletonStats />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Manage Seasons</h1>
        <ErrorDisplay
          title="Failed to load seasons"
          message={error}
          onRetry={fetchSeasons}
        />
      </div>
    );
  }

  const activeSeasons = seasons.filter(s => s.is_active);
  const archivedSeasons = seasons.filter(s => !s.is_active);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Seasons</h1>
          <p className="text-gray-600 mt-1">
            Create, view, and archive leaderboard seasons
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Create Season
        </button>
      </div>

      {/* Active Seasons */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Active Seasons ({activeSeasons.length})
        </h2>
        {activeSeasons.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">No active seasons</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create First Season
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSeasons.map(season => (
              <div
                key={season.id}
                className="bg-white rounded-lg border-2 border-green-500 p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{season.name}</h3>
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                    Active
                  </span>
                </div>
                
                {season.description && (
                  <p className="text-sm text-gray-600 mb-4">{season.description}</p>
                )}
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Start Date:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(season.start_date).toLocaleDateString()}
                    </span>
                  </div>
                  {season.end_date && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(season.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {season.reset_type && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Reset Type:</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {season.reset_type}
                      </span>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => handleArchive(season.id)}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Archive Season
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archived Seasons */}
      {archivedSeasons.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Archived Seasons ({archivedSeasons.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedSeasons.map(season => (
              <div
                key={season.id}
                className="bg-white rounded-lg border border-gray-200 p-6 opacity-75"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{season.name}</h3>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                    Archived
                  </span>
                </div>
                
                {season.description && (
                  <p className="text-sm text-gray-600 mb-4">{season.description}</p>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Start Date:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(season.start_date).toLocaleDateString()}
                    </span>
                  </div>
                  {season.end_date && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">End Date:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(season.end_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {season.archived_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Archived:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(season.archived_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Season Modal */}
      <CreateSeasonModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchSeasons}
        currentUserAdminId={currentUserAdminId || undefined}
      />
    </div>
  );
}
