'use client';

import { useState } from 'react';
import { Save, FileText, ExternalLink } from 'lucide-react';
import SettingCard from './SettingCard';
import SettingInput from './SettingInput';

interface LegalSettingsTabProps {
  settings: Record<string, any>;
  onSave: (key: string, value: any, reason?: string) => Promise<boolean>;
  saving: boolean;
}

const DEFAULT_WEBAPP_URL = 'https://www.elmly.app';

export default function LegalSettingsTab({ settings, onSave, saving }: LegalSettingsTabProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Get webapp URL from settings or use default
  const webappUrl = localSettings.webapp_url || settings.webapp_url || DEFAULT_WEBAPP_URL;

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
          <h2 className="text-xl font-semibold text-gray-900">Legal Documents</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage Terms of Service and Privacy Policy content
          </p>
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

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              Legal Documents Management
            </p>
            <p className="text-sm text-blue-700 mt-1">
              These documents are displayed in the mobile app (About screen, Registration) and webapp 
              (Terms and Privacy pages). Leave empty to use default templates.
            </p>
            <div className="flex gap-4 mt-3">
              <a 
                href={`${webappUrl}/terms`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                View Terms Page
              </a>
              <a 
                href={`${webappUrl}/privacy`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                View Privacy Page
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Terms of Service */}
      <SettingCard
        title="Terms of Service"
        description="Define the terms and conditions for using the application"
      >
        <div className="space-y-4">
          <SettingInput
            label="Terms of Service Content"
            value={localSettings.terms_of_service || ''}
            onChange={(value) => handleChange('terms_of_service', value)}
            onSave={() => handleSave('terms_of_service')}
            type="textarea"
            description="Full terms of service text. Supports plain text. Leave empty to use default template."
            saving={saving}
            rows={12}
          />
          
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">Default template includes:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Acceptance of Terms</li>
              <li>Use License</li>
              <li>User Account responsibilities</li>
              <li>Prohibited Uses</li>
              <li>Content Ownership</li>
              <li>AI Features disclaimer</li>
              <li>Limitation of Liability</li>
              <li>Governing Law (Azerbaijan)</li>
            </ul>
          </div>
        </div>
      </SettingCard>

      {/* Privacy Policy */}
      <SettingCard
        title="Privacy Policy"
        description="Define how user data is collected, used, and protected"
      >
        <div className="space-y-4">
          <SettingInput
            label="Privacy Policy Content"
            value={localSettings.privacy_policy || ''}
            onChange={(value) => handleChange('privacy_policy', value)}
            onSave={() => handleSave('privacy_policy')}
            type="textarea"
            description="Full privacy policy text. Supports plain text. Leave empty to use default template."
            saving={saving}
            rows={12}
          />
          
          <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">Default template includes:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Information We Collect</li>
              <li>How We Use Your Information</li>
              <li>Data Storage and Security</li>
              <li>AI and Data Processing</li>
              <li>Data Sharing policies</li>
              <li>User Rights (Access, Correction, Deletion)</li>
              <li>Cookies and Tracking</li>
              <li>Children's Privacy</li>
            </ul>
          </div>
        </div>
      </SettingCard>

      {/* Webapp URL Configuration */}
      <SettingCard
        title="Webapp URL"
        description="Configure the webapp URL for legal document links"
      >
        <div className="space-y-4">
          <SettingInput
            label="Webapp Base URL"
            value={localSettings.webapp_url || 'https://elmly.app'}
            onChange={(value) => handleChange('webapp_url', value)}
            onSave={() => handleSave('webapp_url')}
            type="text"
            description="Base URL of the webapp (used for Terms and Privacy links in mobile app)"
            saving={saving}
          />
        </div>
      </SettingCard>
    </div>
  );
}
