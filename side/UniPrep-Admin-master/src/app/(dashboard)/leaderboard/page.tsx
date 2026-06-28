'use client';

import { useState, useEffect } from 'react';
import { leaderboardService } from '@/services/leaderboardService';
import { authService } from '@/services/authService';
import { useToast } from '@/contexts/ToastContext';
import type { LeaderboardSeason, ScoringConfig, LeaderboardStats } from '@/types/leaderboard';
import { SkeletonStats } from '@/components/ui/SkeletonLoader';
import { ErrorDisplay } from '@/components/ErrorBoundary';
import CreateSeasonModal from '@/components/leaderboard/CreateSeasonModal';
import ResetLeaderboardModal from '@/components/leaderboard/ResetLeaderboardModal';
import AdjustScoreModal from '@/components/leaderboard/AdjustScoreModal';

export default function LeaderboardPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<LeaderboardSeason | null>(null);
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig | null>(null);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [currentUserAdminId, setCurrentUserAdminId] = useState<string | null>(null);
  
  // Modal states
  const [showCreateSeason, setShowCreateSeason] = useState(false);
  const [showResetLeaderboard, setShowResetLeaderboard] = useState(false);
  const [showAdjustScore, setShowAdjustScore] = useState(false);

  useEffect(() => {
    fetchData();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const user = await authService.getCurrentUser();
    if (user) {
      setCurrentUserAdminId(user.id);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [seasonResult, configResult, statsResult] = await Promise.all([
        leaderboardService.getActiveSeason(),
        leaderboardService.getScoringConfig(),
        leaderboardService.getLeaderboardStats(),
      ]);

      if (!seasonResult.success) {
        setError(seasonResult.error || 'Failed to load season');
        return;
      }

      if (!configResult.success) {
        setError(configResult.error || 'Failed to load config');
        return;
      }

      if (!statsResult.success) {
        setError(statsResult.error || 'Failed to load stats');
        return;
      }

      setActiveSeason(seasonResult.data);
      setScoringConfig(configResult.data);
      setStats(statsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard Management</h1>
        <SkeletonStats />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard Management</h1>
        <ErrorDisplay
          title="Failed to load leaderboard data"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard Management</h1>
        <p className="text-gray-600 mt-1">
          Manage ELO scores, seasons, and leaderboard configuration
        </p>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button 
            onClick={() => setShowResetLeaderboard(true)}
            className="px-4 py-3 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium"
          >
            Reset Leaderboard
          </button>
          <button 
            onClick={() => window.location.href = '/leaderboard/seasons'}
            className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Manage Seasons
          </button>
          <button 
            onClick={() => setShowAdjustScore(true)}
            className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Adjust Scores
          </button>
          <button 
            onClick={() => window.location.href = '/leaderboard/analytics'}
            className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            View Analytics
          </button>
        </div>
      </div>

      {/* Active Season */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Season</h2>
        {activeSeason ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{activeSeason.name}</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </div>
                {activeSeason.description && (
                  <p className="text-sm text-gray-600">{activeSeason.description}</p>
                )}
              </div>
              <button
                onClick={() => window.location.href = '/leaderboard/seasons'}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Manage
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Start Date</p>
                <p className="font-medium text-gray-900">
                  {new Date(activeSeason.start_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">End Date</p>
                <p className="font-medium text-gray-900">
                  {activeSeason.end_date
                    ? new Date(activeSeason.end_date).toLocaleDateString()
                    : 'Ongoing'}
                </p>
              </div>
              {activeSeason.reset_type && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Reset Type</p>
                  <p className="font-medium text-gray-900 capitalize">
                    {activeSeason.reset_type}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-600 mb-1">Created</p>
                <p className="font-medium text-gray-900">
                  {new Date(activeSeason.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No active season</p>
            <button 
              onClick={() => setShowCreateSeason(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Create Season
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-1">Total Students</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total_students}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-1">Average ELO</p>
            <p className="text-3xl font-bold text-gray-900">{Math.round(stats.avg_elo)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-1">Highest ELO</p>
            <p className="text-3xl font-bold text-green-600">{Math.round(stats.highest_elo)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-600 mb-1">Lowest ELO</p>
            <p className="text-3xl font-bold text-red-600">{Math.round(stats.lowest_elo)}</p>
          </div>
        </div>
      )}

      {/* Scoring Configuration */}
      {scoringConfig && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scoring Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Base ELO</p>
              <p className="font-medium text-gray-900">{scoringConfig.elo_base.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Min ELO</p>
              <p className="font-medium text-gray-900">{scoringConfig.elo_min.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Max ELO</p>
              <p className="font-medium text-gray-900">{scoringConfig.elo_max.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">K-Factor (New)</p>
              <p className="font-medium text-gray-900">{scoringConfig.k_factor_new.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">K-Factor (Regular)</p>
              <p className="font-medium text-gray-900">{scoringConfig.k_factor_regular.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">K-Factor (Experienced)</p>
              <p className="font-medium text-gray-900">{scoringConfig.k_factor_experienced.value}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Decay Enabled</p>
              <p className="font-medium text-gray-900">
                {scoringConfig.decay_enabled.value ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Decay Percentage</p>
              <p className="font-medium text-gray-900">{scoringConfig.decay_percentage.value}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Streak Multiplier</p>
              <p className="font-medium text-gray-900">{scoringConfig.streak_multiplier.value}x</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateSeasonModal
        isOpen={showCreateSeason}
        onClose={() => setShowCreateSeason(false)}
        onSuccess={fetchData}
        currentUserAdminId={currentUserAdminId || undefined}
      />
      
      <ResetLeaderboardModal
        isOpen={showResetLeaderboard}
        onClose={() => setShowResetLeaderboard(false)}
        onSuccess={fetchData}
        currentUserAdminId={currentUserAdminId || undefined}
      />
      
      <AdjustScoreModal
        isOpen={showAdjustScore}
        onClose={() => setShowAdjustScore(false)}
        onSuccess={fetchData}
        currentUserAdminId={currentUserAdminId || undefined}
      />
    </div>
  );
}
