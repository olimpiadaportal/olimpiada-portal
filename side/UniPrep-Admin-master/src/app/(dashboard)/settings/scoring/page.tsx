'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import RoleGuard from '@/components/auth/RoleGuard';
import { leaderboardService } from '@/services/leaderboardService';
import { authService } from '@/services/authService';
import { useToast } from '@/contexts/ToastContext';
import type { ScoringConfig } from '@/types/leaderboard';
import { SkeletonStats } from '@/components/ui/SkeletonLoader';
import { ErrorDisplay } from '@/components/ErrorBoundary';
import HelpManualModal from '@/components/common/HelpManualModal';

interface ConfigItem {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
}

const configItems: ConfigItem[] = [
  {
    key: 'elo_base',
    label: 'Base ELO',
    description: 'Starting ELO for new students',
    type: 'number',
    min: 1000,
    max: 1500,
    step: 50,
  },
  {
    key: 'elo_min',
    label: 'Minimum ELO',
    description: 'Lowest possible ELO rating',
    type: 'number',
    min: 500,
    max: 1200,
    step: 50,
  },
  {
    key: 'elo_max',
    label: 'Maximum ELO',
    description: 'Highest possible ELO rating',
    type: 'number',
    min: 1800,
    max: 3000,
    step: 100,
  },
  {
    key: 'k_factor_new',
    label: 'K-Factor (New Players)',
    description: 'Rating change sensitivity for players with <30 games',
    type: 'number',
    min: 20,
    max: 60,
    step: 5,
  },
  {
    key: 'k_factor_regular',
    label: 'K-Factor (Regular Players)',
    description: 'Rating change sensitivity for regular players',
    type: 'number',
    min: 10,
    max: 40,
    step: 5,
  },
  {
    key: 'k_factor_experienced',
    label: 'K-Factor (Experienced Players)',
    description: 'Rating change sensitivity for players with >100 games',
    type: 'number',
    min: 5,
    max: 20,
    step: 5,
  },
  {
    key: 'decay_enabled',
    label: 'Enable Monthly Decay',
    description: 'Automatically decay ELO for inactive students',
    type: 'boolean',
  },
  {
    key: 'decay_percentage',
    label: 'Decay Percentage',
    description: 'Monthly ELO decay percentage for inactive students',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'streak_multiplier',
    label: 'Streak Multiplier',
    description: 'Score multiplier for winning streaks',
    type: 'number',
    min: 1,
    max: 2,
    step: 0.1,
  },
  {
    key: 'achievement_bonus',
    label: 'Achievement Bonus',
    description: 'Bonus points for completing achievements',
    type: 'number',
    min: 0,
    max: 100,
    step: 10,
  },
  {
    key: 'consistency_bonus',
    label: 'Consistency Bonus',
    description: 'Bonus points for consistent daily performance',
    type: 'number',
    min: 0,
    max: 50,
    step: 5,
  },
];

export default function ScoringConfigPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [editedConfig, setEditedConfig] = useState<Record<string, number | boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const user = await authService.getCurrentUser();
    if (user) {
      setCurrentUserRole(user.role);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await leaderboardService.getScoringConfig();

      if (!result.success) {
        setError(result.error || 'Failed to load configuration');
        return;
      }

      setConfig(result.data);
      
      // Initialize edited config
      const initialConfig: Record<string, number | boolean> = {};
      Object.entries(result.data || {}).forEach(([key, val]) => {
        initialConfig[key] = val.value;
      });
      setEditedConfig(initialConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: number | boolean) => {
    setEditedConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (currentUserRole !== 'super_admin') {
      toast.error('Only super admins can update scoring configuration');
      return;
    }

    setSaving(true);

    try {
      // Update each changed config
      const updates = Object.entries(editedConfig).map(([key, value]) => {
        if (config && config[key as keyof ScoringConfig]?.value !== value) {
          return leaderboardService.updateScoringConfig(key, value);
        }
        return null;
      }).filter(Boolean);

      const results = await Promise.all(updates);
      
      const failed = results.filter(r => r && !r.success);
      if (failed.length > 0) {
        toast.error('Some updates failed');
        return;
      }

      toast.success('Configuration updated successfully');
      setHasChanges(false);
      await fetchData();
    } catch (err) {
      console.error('Exception saving config:', err);
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      const initialConfig: Record<string, number | boolean> = {};
      Object.entries(config).forEach(([key, val]) => {
        initialConfig[key] = val.value;
      });
      setEditedConfig(initialConfig);
      setHasChanges(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Scoring Configuration</h1>
        <SkeletonStats />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Scoring Configuration</h1>
        <ErrorDisplay
          title="Failed to load configuration"
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

  const isSuperAdmin = currentUserRole === 'super_admin';

  const helpSections = [
    {
      title: 'What is Scoring Configuration?',
      content: 'This page controls the ELO rating system and competitive scoring for students. ELO ratings measure student performance and are used in leaderboards and competitive mode.'
    },
    {
      title: 'ELO Settings',
      content: [
        'Base ELO: Starting rating for new students (default: 1200)',
        'Minimum ELO: Lowest possible rating (prevents going too low)',
        'Maximum ELO: Highest possible rating (ceiling for top performers)',
        'These values determine the rating range for all students'
      ]
    },
    {
      title: 'K-Factor Settings',
      content: [
        'K-Factor controls how much ratings change after each exam',
        'New Students: Higher K-factor (more volatile, faster adjustment)',
        'Established Students: Lower K-factor (more stable ratings)',
        'High Performers: Lowest K-factor (ratings change slowly)',
        'Higher K-factor = bigger rating swings, Lower K-factor = smaller changes'
      ]
    },
    {
      title: 'Bonus Points',
      content: [
        'Streak Bonus: Extra points for consecutive correct answers',
        'Speed Bonus: Reward for answering quickly',
        'Accuracy Bonus: Reward for high accuracy percentage',
        'Consistency Bonus: Reward for consistent daily performance',
        'These bonuses encourage good study habits and engagement'
      ]
    },
    {
      title: 'Best Practices',
      content: [
        'Start with default values and adjust gradually based on data',
        'Higher K-factors for new users help them find their level quickly',
        'Lower K-factors for experienced users prevent rating manipulation',
        'Test changes on a small group before applying to all users',
        'Monitor leaderboards after changes to ensure fairness'
      ]
    }
  ];

  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/settings')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Settings</span>
          </button>
          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
            <span>Help & Guide</span>
          </button>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Scoring Configuration</h1>
        <p className="text-gray-600 mt-1">
          Configure ELO ratings, K-factors, and bonus settings
        </p>
      </div>

      {/* Permission Warning */}
      {!isSuperAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Only super admins can modify scoring configuration.
          </p>
        </div>
      )}

      {/* Configuration Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="space-y-6">
          {/* ELO Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">ELO Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {configItems.filter(item => item.key.startsWith('elo_')).map(item => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={editedConfig[item.key] as number}
                    onChange={(e) => handleChange(item.key, Number(e.target.value))}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    disabled={!isSuperAdmin}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* K-Factors */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">K-Factors</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {configItems.filter(item => item.key.startsWith('k_factor')).map(item => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={editedConfig[item.key] as number}
                    onChange={(e) => handleChange(item.key, Number(e.target.value))}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    disabled={!isSuperAdmin}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Decay Settings */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Decay Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={editedConfig.decay_enabled as boolean}
                    onChange={(e) => handleChange('decay_enabled', e.target.checked)}
                    disabled={!isSuperAdmin}
                    className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable Monthly Decay</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Automatically decay ELO for inactive students
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Decay Percentage
                </label>
                <input
                  type="number"
                  value={editedConfig.decay_percentage as number}
                  onChange={(e) => handleChange('decay_percentage', Number(e.target.value))}
                  min={1}
                  max={10}
                  step={1}
                  disabled={!isSuperAdmin || !editedConfig.decay_enabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Monthly ELO decay percentage for inactive students
                </p>
              </div>
            </div>
          </div>

          {/* Bonus Settings */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Bonus Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {configItems.filter(item => 
                item.key === 'streak_multiplier' || 
                item.key === 'achievement_bonus' || 
                item.key === 'consistency_bonus'
              ).map(item => (
                <div key={item.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {item.label}
                  </label>
                  <input
                    type="number"
                    value={editedConfig[item.key] as number}
                    onChange={(e) => handleChange(item.key, Number(e.target.value))}
                    min={item.min}
                    max={item.max}
                    step={item.step}
                    disabled={!isSuperAdmin}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        {isSuperAdmin && (
          <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset Changes
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}
      </div>

      {/* Help Manual Modal */}
      <HelpManualModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="Scoring Configuration Guide"
        sections={helpSections}
      />
    </div>
    </RoleGuard>
  );
}
