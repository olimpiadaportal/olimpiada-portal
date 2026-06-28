'use client';

import { useState } from 'react';
import SettingCard from './SettingCard';

interface SecuritySettingsTabProps {
  settings: Record<string, any>;
  onSave: (key: string, value: any, reason?: string) => Promise<boolean>;
  saving: boolean;
}

export default function SecuritySettingsTab({ settings, onSave, saving }: SecuritySettingsTabProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleToggle = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setLocalSettings({ ...localSettings, [key]: newValue });
    setSavingKey(key);
    await onSave(key, newValue);
    setSavingKey(null);
  };

  const handleNumberChange = (key: string, value: number) => {
    setLocalSettings({ ...localSettings, [key]: value });
  };

  const handleNumberSave = async (key: string) => {
    setSavingKey(key);
    await onSave(key, localSettings[key]);
    setSavingKey(null);
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Security Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Configure security policies and access control</p>
      </div>

      <SettingCard
        title="Password Policy"
        description="Configure password requirements for user signup and registration"
      >
        <div className="space-y-4">
          {/* Minimum Password Length */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Minimum Password Length
              </label>
              <button
                onClick={() => handleNumberSave('password_min_length')}
                disabled={savingKey === 'password_min_length'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'password_min_length' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.password_min_length || ''}
              onChange={(e) => handleNumberChange('password_min_length', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="8"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Minimum number of characters required (6-32)</p>
          </div>

          {/* Require Uppercase */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Require Uppercase Letter</label>
              <p className="text-sm text-gray-500 mt-1">Password must contain at least one uppercase letter (A-Z)</p>
            </div>
            <button
              onClick={() => handleToggle('password_require_uppercase', localSettings.password_require_uppercase || false)}
              disabled={savingKey === 'password_require_uppercase'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.password_require_uppercase ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.password_require_uppercase ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Require Lowercase */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Require Lowercase Letter</label>
              <p className="text-sm text-gray-500 mt-1">Password must contain at least one lowercase letter (a-z)</p>
            </div>
            <button
              onClick={() => handleToggle('password_require_lowercase', localSettings.password_require_lowercase || false)}
              disabled={savingKey === 'password_require_lowercase'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.password_require_lowercase ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.password_require_lowercase ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Require Number */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Require Number</label>
              <p className="text-sm text-gray-500 mt-1">Password must contain at least one number (0-9)</p>
            </div>
            <button
              onClick={() => handleToggle('password_require_number', localSettings.password_require_number || false)}
              disabled={savingKey === 'password_require_number'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.password_require_number ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.password_require_number ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Require Special Character */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Require Special Character</label>
              <p className="text-sm text-gray-500 mt-1">Password must contain at least one special character (!@#$%^&*)</p>
            </div>
            <button
              onClick={() => handleToggle('password_require_special', localSettings.password_require_special || false)}
              disabled={savingKey === 'password_require_special'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.password_require_special ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.password_require_special ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </SettingCard>

      <SettingCard
        title="Session Management"
        description="Configure session timeouts and limits"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Session Timeout (minutes)
              </label>
              <button
                onClick={() => handleNumberSave('session_timeout_minutes')}
                disabled={savingKey === 'session_timeout_minutes'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'session_timeout_minutes' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.session_timeout_minutes || ''}
              onChange={(e) => handleNumberChange('session_timeout_minutes', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="1440"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Auto-logout after inactivity (default: 1440 = 24 hours, max: 10080 = 7 days)</p>
          </div>
        </div>
      </SettingCard>

      <SettingCard
        title="Rate Limiting"
        description="Configure API rate limits (server-side enforcement)"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Requests Per Minute
              </label>
              <button
                onClick={() => handleNumberSave('api_rate_limit_per_minute')}
                disabled={savingKey === 'api_rate_limit_per_minute'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'api_rate_limit_per_minute' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.api_rate_limit_per_minute || ''}
              onChange={(e) => handleNumberChange('api_rate_limit_per_minute', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="60"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Maximum API requests per minute per user</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Requests Per Hour
              </label>
              <button
                onClick={() => handleNumberSave('api_rate_limit_per_hour')}
                disabled={savingKey === 'api_rate_limit_per_hour'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'api_rate_limit_per_hour' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.api_rate_limit_per_hour || ''}
              onChange={(e) => handleNumberChange('api_rate_limit_per_hour', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="1000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Maximum API requests per hour per user</p>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}
