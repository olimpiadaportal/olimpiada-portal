'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import { auditLogService, ValidDbActionTypes } from '@/services/auditLogService';
import type { ResetType } from '@/types/leaderboard';

interface ResetLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUserAdminId?: string;
}

export default function ResetLeaderboardModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserAdminId,
}: ResetLeaderboardModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [resetType, setResetType] = useState<ResetType>('soft');
  const [percentage, setPercentage] = useState(20);
  const [seasonName, setSeasonName] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    setLoading(true);

    try {
      let result;

      if (resetType === 'soft') {
        const { data, error } = await supabase.rpc('reset_leaderboard_soft', {
          p_percentage: percentage,
          p_season_name: seasonName || null,
          p_created_by: currentUserAdminId || null,
        });

        if (error) {
          console.error('Error resetting leaderboard:', error);
          toast.error(error.message || 'Failed to reset leaderboard');
          return;
        }

        result = data;
      } else {
        const { data, error } = await supabase.rpc('reset_leaderboard_hard', {
          p_season_name: seasonName || null,
          p_created_by: currentUserAdminId || null,
        });

        if (error) {
          console.error('Error resetting leaderboard:', error);
          toast.error(error.message || 'Failed to reset leaderboard');
          return;
        }

        result = data;
      }

      if (result && !result.success) {
        toast.error(result.error || 'Failed to reset leaderboard');
        return;
      }

      // Log the reset action
      await auditLogService.logAction({
        actionType: ValidDbActionTypes.RESET_LEADERBOARD,
        tableName: 'leaderboard_entries',
        description: `Reset leaderboard (${resetType} reset)`,
        metadata: {
          reset_type: resetType,
          percentage: resetType === 'soft' ? percentage : null,
          season_name: seasonName || null,
          affected_students: result.data.affected_students
        }
      });
      
      toast.success(`Leaderboard reset successfully (${result.data.affected_students} students affected)`);
      onSuccess();
      onClose();
      setShowConfirm(false);
    } catch (err) {
      console.error('Exception resetting leaderboard:', err);
      toast.error('An error occurred while resetting the leaderboard');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Reset Leaderboard</h2>
        
        {!showConfirm ? (
          <div className="space-y-4">
            {/* Reset Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reset Type
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value="soft"
                    checked={resetType === 'soft'}
                    onChange={(e) => setResetType(e.target.value as ResetType)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Soft Reset</div>
                    <div className="text-sm text-gray-600">Decay ELO by percentage towards base</div>
                  </div>
                </label>
                
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value="hard"
                    checked={resetType === 'hard'}
                    onChange={(e) => setResetType(e.target.value as ResetType)}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Hard Reset</div>
                    <div className="text-sm text-gray-600">Reset all ELO to base value (1200)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Percentage (for soft reset) */}
            {resetType === 'soft' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Decay Percentage: {percentage}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="5"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>10%</span>
                  <span>50%</span>
                </div>
              </div>
            )}

            {/* Season Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Season Name (Optional)
              </label>
              <input
                type="text"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., Spring 2025"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to reset without creating a new season
              </p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> This action will affect all students' ELO ratings and cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Confirmation */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-bold text-red-900 mb-2">⚠️ Confirm Reset</h3>
              <p className="text-sm text-red-800 mb-3">
                You are about to perform a <strong>{resetType} reset</strong> of the leaderboard.
                {resetType === 'soft' && ` All ELO ratings will decay by ${percentage}% towards the base value.`}
                {resetType === 'hard' && ' All ELO ratings will be reset to 1200.'}
              </p>
              <p className="text-sm text-red-800 font-medium">
                This action cannot be undone. Are you absolutely sure?
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={loading}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Resetting...' : 'Yes, Reset Leaderboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
