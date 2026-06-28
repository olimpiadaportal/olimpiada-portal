'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Save, AlertCircle, Info, Smartphone, ArrowRight } from 'lucide-react';
import SettingCard from './SettingCard';
import SettingInput from './SettingInput';

interface GeneralSettingsTabProps {
  settings: Record<string, any>;
  onSave: (key: string, value: any, reason?: string) => Promise<boolean>;
  saving: boolean;
}

export default function GeneralSettingsTab({ settings, onSave, saving }: GeneralSettingsTabProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [pendingMaintenanceValue, setPendingMaintenanceValue] = useState(false);

  const handleChange = (key: string, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async (key: string) => {
    const value = localSettings[key];
    const success = await onSave(key, value);
    if (success) {
      setHasChanges(false);
    }
  };

  const handleSaveAll = async () => {
    const changedKeys = Object.keys(localSettings).filter(
      key => localSettings[key] !== settings[key]
    );

    for (const key of changedKeys) {
      await onSave(key, localSettings[key]);
    }
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">General Settings</h2>
          <p className="text-sm text-gray-600 mt-1">Configure basic application settings</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save All Changes
          </button>
        )}
      </div>

      {/* Application Info */}
      <SettingCard
        title="Application Information"
        description="Basic application identity"
      >
        <div className="space-y-4">
          <SettingInput
            label="App Name"
            value={localSettings.app_name || ''}
            onChange={(value) => handleChange('app_name', value)}
            onSave={() => handleSave('app_name')}
            type="text"
            description="The name of the application displayed to users"
            saving={saving}
          />

          <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-950">
                Mobile release versions are managed separately
              </p>
              <p className="mt-1 text-sm text-blue-800">
                The installed app version shown in mobile Profile/About screens comes from the mobile build metadata.
                Update prompts, build numbers, force-update rules, and localized release messages are managed in App Version Management.
              </p>
              <Link
                href="/settings/app-versions"
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Open App Version Management
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* Maintenance Mode */}
      <SettingCard
        title="Maintenance Mode"
        description="Control system-wide maintenance mode"
        variant="warning"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900">
                Warning: Maintenance Mode
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Enabling maintenance mode will prevent all users from accessing the application.
                Only use this for critical updates or maintenance.
              </p>
            </div>
          </div>

          {/* Maintenance Mode Toggle */}
          <div className="flex items-center justify-between p-4 border border-yellow-200 rounded-lg bg-yellow-50 hover:border-yellow-300 transition-colors">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-900">Enable Maintenance Mode</label>
              <p className="text-sm text-gray-500 mt-1">Prevent all users from accessing the application</p>
            </div>
            <button
              onClick={() => {
                const newValue = !localSettings.maintenance_mode;
                setPendingMaintenanceValue(newValue);
                setShowMaintenanceModal(true);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 ${
                localSettings.maintenance_mode ? 'bg-yellow-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localSettings.maintenance_mode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <SettingInput
            label="Maintenance Message (Azerbaijani)"
            value={localSettings.maintenance_message_az || ''}
            onChange={(value) => handleChange('maintenance_message_az', value)}
            onSave={() => handleSave('maintenance_message_az')}
            type="textarea"
            description="Message shown to users in Azerbaijani"
            saving={saving}
          />

          <SettingInput
            label="Maintenance Message (English)"
            value={localSettings.maintenance_message_en || ''}
            onChange={(value) => handleChange('maintenance_message_en', value)}
            onSave={() => handleSave('maintenance_message_en')}
            type="textarea"
            description="Message shown to users in English"
            saving={saving}
          />

          <SettingInput
            label="Maintenance Message (Russian)"
            value={localSettings.maintenance_message_ru || ''}
            onChange={(value) => handleChange('maintenance_message_ru', value)}
            onSave={() => handleSave('maintenance_message_ru')}
            type="textarea"
            description="Message shown to users in Russian"
            saving={saving}
          />
        </div>
      </SettingCard>

      {/* Support Information */}
      <SettingCard
        title="Support Information"
        description="Contact information for user support"
      >
        <div className="space-y-4">
          <SettingInput
            label="Support Email"
            value={localSettings.support_email || ''}
            onChange={(value) => handleChange('support_email', value)}
            onSave={() => handleSave('support_email')}
            type="email"
            description="Email address for user support"
            saving={saving}
          />

          <SettingInput
            label="Support Phone"
            value={localSettings.support_phone || ''}
            onChange={(value) => handleChange('support_phone', value)}
            onSave={() => handleSave('support_phone')}
            type="tel"
            description="Phone number for user support"
            saving={saving}
          />

          <SettingInput
            label="Website URL"
            value={localSettings.website_url || ''}
            onChange={(value) => handleChange('website_url', value)}
            onSave={() => handleSave('website_url')}
            type="text"
            description="Official website URL displayed in mobile app and web app"
            saving={saving}
          />
        </div>
      </SettingCard>

      {/* Social Media Links */}
      <SettingCard
        title="Social Media Links"
        description="Social media links displayed in the landing page footer. Leave a field empty to hide that social link."
      >
        <div className="space-y-4">
          <SettingInput
            label="Facebook"
            value={localSettings.social_facebook || ''}
            onChange={(value) => handleChange('social_facebook', value)}
            onSave={() => handleSave('social_facebook')}
            type="text"
            placeholder="https://facebook.com/yourpage"
            description="Facebook page URL"
            saving={saving}
          />

          <SettingInput
            label="Instagram"
            value={localSettings.social_instagram || ''}
            onChange={(value) => handleChange('social_instagram', value)}
            onSave={() => handleSave('social_instagram')}
            type="text"
            placeholder="https://instagram.com/yourprofile"
            description="Instagram profile URL"
            saving={saving}
          />

          <SettingInput
            label="Twitter / X"
            value={localSettings.social_twitter || ''}
            onChange={(value) => handleChange('social_twitter', value)}
            onSave={() => handleSave('social_twitter')}
            type="text"
            placeholder="https://x.com/yourprofile"
            description="Twitter/X profile URL"
            saving={saving}
          />

          <SettingInput
            label="LinkedIn"
            value={localSettings.social_linkedin || ''}
            onChange={(value) => handleChange('social_linkedin', value)}
            onSave={() => handleSave('social_linkedin')}
            type="text"
            placeholder="https://linkedin.com/company/yourcompany"
            description="LinkedIn page URL"
            saving={saving}
          />

          <SettingInput
            label="TikTok"
            value={localSettings.social_tiktok || ''}
            onChange={(value) => handleChange('social_tiktok', value)}
            onSave={() => handleSave('social_tiktok')}
            type="text"
            placeholder="https://tiktok.com/@yourprofile"
            description="TikTok profile URL"
            saving={saving}
          />
        </div>
      </SettingCard>

      {/* App Features */}
      <SettingCard
        title="App Features"
        description="Control app-wide features and onboarding"
      >
        <div className="space-y-4">
          <SettingInput
            label="Enable App Walkthrough"
            value={localSettings.walkthrough_enabled ?? true}
            onChange={(value) => handleChange('walkthrough_enabled', value)}
            onSave={() => handleSave('walkthrough_enabled')}
            type="boolean"
            description="Show interactive walkthrough for new users. When disabled, the walkthrough and 'Reset App Tour' option will be hidden from all users."
            saving={saving}
          />
        </div>
      </SettingCard>

      {/* API Configuration */}
      <SettingCard
        title="API Configuration"
        description="API endpoint configuration (Advanced)"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                Advanced Setting
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Changing the API base URL may break mobile app functionality. Only modify if you know what you're doing.
              </p>
            </div>
          </div>

          <SettingInput
            label="API Base URL"
            value={localSettings.api_base_url || ''}
            onChange={(value) => handleChange('api_base_url', value)}
            onSave={() => handleSave('api_base_url')}
            type="text"
            description="Base URL for API endpoints"
            saving={saving}
          />
        </div>
      </SettingCard>

      {/* Maintenance Mode Confirmation Modal */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertCircle className="w-12 h-12 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {pendingMaintenanceValue ? 'Enable Maintenance Mode?' : 'Disable Maintenance Mode?'}
                </h3>
                {pendingMaintenanceValue ? (
                  <div className="space-y-2 text-sm text-gray-600">
                    <p className="font-medium text-yellow-900">⚠️ Warning: This will immediately:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Block ALL users from accessing the mobile app</li>
                      <li>Show maintenance screen to active users</li>
                      <li>Prevent new logins and registrations</li>
                    </ul>
                    <p className="mt-3 font-medium">Only enable this for critical updates or maintenance.</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    This will allow users to access the application normally again.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowMaintenanceModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  // Update local state first
                  setLocalSettings(prev => ({ ...prev, maintenance_mode: pendingMaintenanceValue }));
                  // Save directly with the new value (don't rely on state update)
                  await onSave('maintenance_mode', pendingMaintenanceValue);
                  setShowMaintenanceModal(false);
                  setHasChanges(false);
                }}
                className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors ${
                  pendingMaintenanceValue
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {pendingMaintenanceValue ? 'Enable Maintenance Mode' : 'Disable Maintenance Mode'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
