'use client';

import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw, Download, Upload, History, ArrowLeft, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import RoleGuard from '@/components/auth/RoleGuard';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';
import GeneralSettingsTab from '@/components/settings/GeneralSettingsTab';
import NotificationSettingsTab from '@/components/settings/NotificationSettingsTab';
import SecuritySettingsTab from '@/components/settings/SecuritySettingsTab';
import PaymentSettingsTab from '@/components/settings/PaymentSettingsTab';
import FeatureFlagsTab from '@/components/settings/FeatureFlagsTab';
import LegalSettingsTab from '@/components/settings/LegalSettingsTab';
import AuditLogTab from '@/components/settings/AuditLogTab';
import HelpManualModal from '@/components/common/HelpManualModal';

/**
 * System Settings Management Page
 * Stage 6 - Phase 2
 * 
 * Provides comprehensive system-wide settings management including:
 * - General application settings
 * - Notification configuration
 * - Security policies
 * - Payment settings
 * - Feature flags
 * - Audit log viewer
 */

type TabType = 'general' | 'notifications' | 'security' | 'payment' | 'features' | 'legal' | 'audit';

interface SystemSettings {
  [key: string]: any;
}

export default function SystemSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [settings, setSettings] = useState<SystemSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      
      // Load all system settings
      const { data, error } = await supabase.rpc('get_system_settings', {
        p_category: null,
        p_include_sensitive: true
      });

      if (error) throw error;

      // Convert array to object for easier access
      // Supabase automatically parses JSONB values to JavaScript types
      const settingsObj: SystemSettings = {};
      data?.forEach((setting: any) => {
        settingsObj[setting.key] = setting.value;
      });

      setSettings(settingsObj);
    } catch (error) {
      console.error('Error loading settings:', error);
      showMessage('error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(key: string, value: any, reason?: string) {
    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // The RPC function expects p_value as JSONB (text parameter that will be cast to JSONB)
      // We need to send it as a JSON string
      // Supabase client will handle the conversion properly
      const { data, error } = await supabase.rpc('update_system_setting', {
        p_admin_id: user.id,
        p_key: key,
        p_value: value, // Pass value directly, Supabase will convert to JSONB
        p_reason: reason || 'Updated from admin panel'
      });

      if (error) throw error;

      // Log the settings update (recordId must be UUID, so use metadata for setting key)
      await auditLogService.logAction({
        actionType: AuditActionTypes.SETTINGS_UPDATE,
        tableName: 'system_settings',
        oldValues: { [key]: settings[key] },
        newValues: { [key]: value },
        description: `Updated system setting: ${key}`,
        metadata: { setting_key: key, reason: reason || 'Updated from admin panel' }
      });

      // Update local state
      setSettings(prev => ({ ...prev, [key]: value }));
      showMessage('success', 'Setting updated successfully');

      return true;
    } catch (error: any) {
      console.error('Error saving setting:', error);
      showMessage('error', error.message || 'Failed to save setting');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleExport() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get all system settings
      const { data: settingsData, error: settingsError } = await supabase.rpc('get_system_settings', {
        p_category: null,
        p_include_sensitive: true
      });

      if (settingsError) throw settingsError;

      // Get all feature flags
      const { data: flagsData, error: flagsError } = await supabase
        .from('feature_flags')
        .select('*');

      if (flagsError) throw flagsError;

      // Create export data
      const exportData = {
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        exported_by: user.email,
        settings: settingsData,
        feature_flags: flagsData
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showMessage('success', 'Settings exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      showMessage('error', 'Failed to export settings');
    }
  }

  // Security validation helper
  function validateImportData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Check basic structure
    if (!data || typeof data !== 'object') {
      errors.push('Invalid JSON structure');
      return { valid: false, errors };
    }

    // 2. Validate required fields
    if (!data.settings || !Array.isArray(data.settings)) {
      errors.push('Missing or invalid "settings" array');
    }
    if (!data.feature_flags || !Array.isArray(data.feature_flags)) {
      errors.push('Missing or invalid "feature_flags" array');
    }

    // 3. Validate metadata
    if (!data.exported_at || !data.exported_by) {
      errors.push('Missing export metadata (exported_at, exported_by)');
    }

    // 4. Check file size limits (prevent DoS)
    if (data.settings && data.settings.length > 1000) {
      errors.push('Too many settings (max 1000)');
    }
    if (data.feature_flags && data.feature_flags.length > 500) {
      errors.push('Too many feature flags (max 500)');
    }

    // 5. Validate settings structure
    const validCategories = ['general', 'notification', 'security', 'payment'];
    const validDataTypes = ['string', 'number', 'boolean', 'json'];
    
    data.settings?.forEach((setting: any, index: number) => {
      if (!setting.key || typeof setting.key !== 'string') {
        errors.push(`Setting ${index}: missing or invalid "key"`);
      }
      if (!setting.category || !validCategories.includes(setting.category)) {
        errors.push(`Setting ${index}: invalid category "${setting.category}"`);
      }
      if (!setting.data_type || !validDataTypes.includes(setting.data_type)) {
        errors.push(`Setting ${index}: invalid data_type "${setting.data_type}"`);
      }
      if (setting.value === undefined) {
        errors.push(`Setting ${index}: missing "value"`);
      }
      // Prevent SQL injection in keys
      if (setting.key && !/^[a-z_]+$/.test(setting.key)) {
        errors.push(`Setting ${index}: invalid key format (only lowercase and underscores allowed)`);
      }
    });

    // 6. Validate feature flags structure
    const validFlagTypes = ['boolean', 'percentage', 'user_list', 'group_list'];
    
    data.feature_flags?.forEach((flag: any, index: number) => {
      if (!flag.flag_name || typeof flag.flag_name !== 'string') {
        errors.push(`Flag ${index}: missing or invalid "flag_name"`);
      }
      if (!flag.flag_type || !validFlagTypes.includes(flag.flag_type)) {
        errors.push(`Flag ${index}: invalid flag_type "${flag.flag_type}"`);
      }
      if (typeof flag.is_enabled !== 'boolean') {
        errors.push(`Flag ${index}: invalid "is_enabled" (must be boolean)`);
      }
      // Validate percentage range
      if (flag.flag_type === 'percentage' && (flag.rollout_percentage < 0 || flag.rollout_percentage > 100)) {
        errors.push(`Flag ${index}: rollout_percentage must be between 0 and 100`);
      }
      // Prevent SQL injection in flag names
      if (flag.flag_name && !/^[a-z_]+$/.test(flag.flag_name)) {
        errors.push(`Flag ${index}: invalid flag_name format (only lowercase and underscores allowed)`);
      }
    });

    // 7. Check for suspicious patterns (XSS, code injection)
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /onerror=/i,
      /onclick=/i,
      /__proto__/,
      /constructor/,
      /eval\(/,
      /Function\(/
    ];

    const jsonString = JSON.stringify(data);
    suspiciousPatterns.forEach(pattern => {
      if (pattern.test(jsonString)) {
        errors.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    });

    return { valid: errors.length === 0, errors };
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // 1. File size check (max 5MB)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
          throw new Error('File too large (max 5MB)');
        }

        // 2. File type check
        if (!file.name.endsWith('.json')) {
          throw new Error('Only JSON files are allowed');
        }

        const text = await file.text();

        // 3. Parse JSON safely
        let importData;
        try {
          importData = JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON format');
        }

        // 4. Comprehensive security validation
        const validation = validateImportData(importData);
        if (!validation.valid) {
          const errorList = validation.errors.join('\n• ');
          throw new Error(`Import validation failed:\n\n• ${errorList}`);
        }

        // 5. Confirm before import
        if (!confirm(
          `Import ${importData.settings.length} settings and ${importData.feature_flags.length} feature flags?\n\n` +
          `Exported: ${new Date(importData.exported_at).toLocaleString()}\n` +
          `By: ${importData.exported_by}\n\n` +
          `⚠️ This will overwrite existing values. Continue?`
        )) return;

        let successCount = 0;
        let errorCount = 0;

        // 6. Import settings with additional validation
        for (const setting of importData.settings) {
          try {
            // Double-check key format before sending to database
            if (!/^[a-z_]+$/.test(setting.key)) {
              throw new Error('Invalid key format');
            }

            await supabase.rpc('update_system_setting', {
              p_admin_id: user.id,
              p_key: setting.key,
              p_value: setting.value,
              p_reason: `Imported from ${file.name} (validated)`
            });
            successCount++;
          } catch (err) {
            console.error(`Failed to import setting ${setting.key}:`, err);
            errorCount++;
          }
        }

        // 7. Import feature flags with additional validation
        for (const flag of importData.feature_flags) {
          try {
            // Double-check flag name format
            if (!/^[a-z_]+$/.test(flag.flag_name)) {
              throw new Error('Invalid flag name format');
            }

            const { id, created_at, updated_at, ...flagData } = flag;
            await supabase
              .from('feature_flags')
              .upsert(flagData, { onConflict: 'flag_name' });
            successCount++;
          } catch (err) {
            console.error(`Failed to import flag ${flag.flag_name}:`, err);
            errorCount++;
          }
        }

        if (errorCount === 0) {
          showMessage('success', `✅ Successfully imported ${successCount} items`);
        } else {
          showMessage('error', `⚠️ Imported ${successCount} items with ${errorCount} errors`);
        }

        await loadSettings();
      } catch (error: any) {
        console.error('Import error:', error);
        showMessage('error', error.message || 'Failed to import settings. Please check the file format.');
      }
    };
    input.click();
  }

  const tabs = [
    { id: 'general' as TabType, label: 'General', icon: Settings },
    { id: 'notifications' as TabType, label: 'Notifications', icon: RefreshCw },
    { id: 'security' as TabType, label: 'Security', icon: Settings },
    { id: 'payment' as TabType, label: 'Payment', icon: Settings },
    { id: 'features' as TabType, label: 'Feature Flags', icon: Settings },
    { id: 'legal' as TabType, label: 'Legal', icon: Settings },
    { id: 'audit' as TabType, label: 'Audit Log', icon: History },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const helpSections = [
    {
      title: 'What are System Settings?',
      content: 'System Settings control application-wide behavior including app information, maintenance mode, notifications, security policies, payment configuration, legal documents, and feature flags. Changes here affect both the admin panel and mobile app.'
    },
    {
      title: 'General Settings',
      content: [
        'App Name: Display name shown to users',
        'Mobile Versions: Store/runtime versions, build numbers, update prompts, and force-update rules are managed in App Version Management',
        'Maintenance Mode: Block all users from accessing the app',
        'Support Email/Phone: Contact information for users'
      ]
    },
    {
      title: 'Notification Settings',
      content: [
        'Enable or disable notification channels (Email, Push, SMS, In-App)',
        'Configure SMTP settings for email delivery via Brevo',
        'Set default notification preferences for new users',
        'When a channel is disabled, no notifications will be sent through it'
      ]
    },
    {
      title: 'Security Settings',
      content: [
        'Password Requirements: Minimum length, uppercase, lowercase, numbers, special characters',
        'Session Timeout: How long users stay logged in',
        'Two-Factor Authentication: Require 2FA for admin accounts',
        'Rate Limiting: Protect against brute force attacks'
      ]
    },
    {
      title: 'Payment Settings',
      content: [
        'Stripe Integration: Configure API keys for payment processing',
        'Subscription Plans: Manage pricing tiers and features',
        'Payment Methods: Enable/disable payment options'
      ]
    },
    {
      title: 'Feature Flags',
      content: [
        'Enable or disable features without deploying new code',
        'Useful for A/B testing and gradual rollouts',
        'Emergency feature toggles for quick response',
        'Changes take effect immediately for all users',
        'Key flags: webapp_auth_enabled, waitlist_enabled, competitive_mode'
      ]
    },
    {
      title: 'Legal Settings',
      content: [
        'Terms of Service: Manage terms and conditions',
        'Privacy Policy: Configure privacy policy content',
        'Cookie Policy: Set cookie consent requirements',
        'Version tracking for legal document updates'
      ]
    },
    {
      title: 'Audit Log (Settings)',
      content: [
        'View history of all system settings changes',
        'Track who made changes and when',
        'See old and new values for each change',
        'Filter by date range, admin, or setting type',
        'Note: Full audit logs available at /audit-logs (Super Admin only)'
      ]
    },
    {
      title: 'Import/Export',
      content: [
        'Export All: Download all settings as JSON backup',
        'Import: Restore settings from JSON file (validates before importing)',
        'Use for backups, migration, or configuration management',
        'Includes both system settings and feature flags'
      ]
    }
  ];

  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      <div className="p-6 space-y-6">
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
            <p className="text-gray-600 mt-1">Manage system-wide configuration and settings</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={loadSettings}
              disabled={loading}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button 
              onClick={handleExport}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export All
            </button>
            <button 
              onClick={handleImport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'general' && (
            <GeneralSettingsTab 
              settings={settings} 
              onSave={handleSave}
              saving={saving}
            />
          )}
          {activeTab === 'notifications' && (
            <NotificationSettingsTab 
              settings={settings} 
              onSave={handleSave}
              saving={saving}
            />
          )}
          {activeTab === 'security' && (
            <SecuritySettingsTab 
              settings={settings} 
              onSave={handleSave}
              saving={saving}
            />
          )}
          {activeTab === 'payment' && (
            <PaymentSettingsTab 
              settings={settings} 
              onSave={handleSave}
              saving={saving}
            />
          )}
          {activeTab === 'features' && (
            <FeatureFlagsTab />
          )}
          {activeTab === 'legal' && (
            <LegalSettingsTab 
              settings={settings} 
              onSave={handleSave}
              saving={saving}
            />
          )}
          {activeTab === 'audit' && (
            <AuditLogTab />
          )}
        </div>
      </div>

      {/* Help Manual Modal */}
      <HelpManualModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="System Settings Guide"
        sections={helpSections}
      />
    </div>
    </RoleGuard>
  );
}
