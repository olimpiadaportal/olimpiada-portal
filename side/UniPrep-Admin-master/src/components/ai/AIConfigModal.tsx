/**
 * AI Configuration Modal
 * Stage 5.5 - Phase 6: Configuration & Controls
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Settings } from 'lucide-react';
import {
  getGlobalSettings,
  getRateLimits,
  getFeatureFlags,
  getCostControls,
  updateGlobalSettings,
  updateRateLimits,
  updateFeatureFlags,
  updateCostControls,
  type GlobalSettings,
  type RateLimits,
  type FeatureFlags,
  type CostControls,
} from '@/services/aiConfigService';
import GlobalSettingsTab from './config/GlobalSettingsTab';
import FeaturesTab from './config/FeaturesTab';
import RateLimitsTab from './config/RateLimitsTab';
import CostControlsTab from './config/CostControlsTab';

interface AIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

type TabType = 'global' | 'features' | 'rate_limits' | 'cost';

export default function AIConfigModal({ isOpen, onClose, onSave }: AIConfigModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('global');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [rateLimits, setRateLimits] = useState<RateLimits | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);
  const [costControls, setCostControls] = useState<CostControls | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfigurations();
    }
  }, [isOpen]);

  async function loadConfigurations() {
    setLoading(true);
    setError(null);
    try {
      const [global, rates, features, costs] = await Promise.all([
        getGlobalSettings(),
        getRateLimits(),
        getFeatureFlags(),
        getCostControls(),
      ]);

      setGlobalSettings(global);
      setRateLimits(rates);
      setFeatureFlags(features);
      setCostControls(costs);
    } catch (err: any) {
      setError(err.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      switch (activeTab) {
        case 'global':
          if (globalSettings) await updateGlobalSettings(globalSettings);
          break;
        case 'features':
          if (featureFlags) await updateFeatureFlags(featureFlags);
          break;
        case 'rate_limits':
          if (rateLimits) await updateRateLimits(rateLimits);
          break;
        case 'cost':
          if (costControls) await updateCostControls(costControls);
          break;
      }

      setSuccess('Configuration saved successfully!');
      if (onSave) onSave();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const tabs = [
    { id: 'global' as TabType, label: 'Global Settings' },
    { id: 'features' as TabType, label: 'Features' },
    { id: 'rate_limits' as TabType, label: 'Rate Limits' },
    { id: 'cost' as TabType, label: 'Cost Controls' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">AI Configuration</h2>
              <p className="text-sm text-gray-600">System-wide AI settings and controls</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <Save className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {activeTab === 'global' && globalSettings && (
                <GlobalSettingsTab settings={globalSettings} onChange={setGlobalSettings} />
              )}
              {activeTab === 'features' && featureFlags && (
                <FeaturesTab flags={featureFlags} onChange={setFeatureFlags} />
              )}
              {activeTab === 'rate_limits' && rateLimits && (
                <RateLimitsTab limits={rateLimits} onChange={setRateLimits} />
              )}
              {activeTab === 'cost' && costControls && (
                <CostControlsTab controls={costControls} onChange={setCostControls} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
