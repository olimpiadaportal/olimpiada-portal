'use client';

import { useState } from 'react';
import SettingCard from './SettingCard';

interface NotificationSettingsTabProps {
  settings: Record<string, any>;
  onSave: (key: string, value: any, reason?: string) => Promise<boolean>;
  saving: boolean;
}

export default function NotificationSettingsTab({ settings, onSave, saving }: NotificationSettingsTabProps) {
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
        <h2 className="text-xl font-semibold text-gray-900">Notification Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Configure notification channels and preferences</p>
      </div>

      <SettingCard
        title="Notification Channels"
        description="Enable or disable notification channels"
      >
        <div className="space-y-4">
          {/* Email Notifications */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Email Notifications</label>
              <p className="text-sm text-gray-500 mt-1">Send notifications via email</p>
            </div>
            <button
              onClick={() => handleToggle('email_enabled', localSettings.email_enabled || false)}
              disabled={savingKey === 'email_enabled'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.email_enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.email_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Push Notifications */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Push Notifications</label>
              <p className="text-sm text-gray-500 mt-1">Send push notifications to mobile app</p>
            </div>
            <button
              onClick={() => handleToggle('push_enabled', localSettings.push_enabled || false)}
              disabled={savingKey === 'push_enabled'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.push_enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.push_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* SMS Notifications */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">SMS Notifications</label>
              <p className="text-sm text-gray-500 mt-1">Send notifications via SMS</p>
            </div>
            <button
              onClick={() => handleToggle('sms_enabled', localSettings.sms_enabled || false)}
              disabled={savingKey === 'sms_enabled'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.sms_enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.sms_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* In-App Notifications */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">In-App Notifications</label>
              <p className="text-sm text-gray-500 mt-1">Show notifications within the mobile app</p>
            </div>
            <button
              onClick={() => handleToggle('in_app_enabled', localSettings.in_app_enabled || false)}
              disabled={savingKey === 'in_app_enabled'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                localSettings.in_app_enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.in_app_enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </SettingCard>

      <SettingCard
        title="Notification Retention"
        description="Configure how long notifications are kept"
      >
        <div className="space-y-4">
          {/* Retention Days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Retention Days
              </label>
              <button
                onClick={() => handleNumberSave('notification_retention_days')}
                disabled={savingKey === 'notification_retention_days'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'notification_retention_days' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.notification_retention_days || ''}
              onChange={(e) => handleNumberChange('notification_retention_days', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="90"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Number of days to keep notifications in the system</p>
          </div>

          {/* Max Notifications Per User */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Max Active Notifications Per User
              </label>
              <button
                onClick={() => handleNumberSave('max_notifications_per_user')}
                disabled={savingKey === 'max_notifications_per_user'}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingKey === 'max_notifications_per_user' ? 'Saving...' : 'Save'}
              </button>
            </div>
            <input
              type="number"
              value={localSettings.max_notifications_per_user || ''}
              onChange={(e) => handleNumberChange('max_notifications_per_user', e.target.value ? parseInt(e.target.value) : 0)}
              placeholder="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500">Maximum unread notifications a user can have at once. Older notifications are auto-deleted when limit is reached.</p>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}
