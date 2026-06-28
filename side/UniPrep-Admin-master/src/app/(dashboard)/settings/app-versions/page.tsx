'use client';

import { useState, useEffect } from 'react';
import { Plus, Smartphone, Apple, Edit2, Trash2, AlertCircle, ArrowLeft, HelpCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { appVersionService, type AppVersion } from '@/services/appVersionService';
import HelpManualModal from '@/components/common/HelpManualModal';

export default function AppVersionsPage() {
  const router = useRouter();
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'ios' | 'android'>('all');

  useEffect(() => {
    loadVersions();
  }, [selectedPlatform]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const data = selectedPlatform === 'all' 
        ? await appVersionService.getAllVersions()
        : await appVersionService.getVersionsByPlatform(selectedPlatform);
      setVersions(data);
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this version?')) return;
    
    try {
      await appVersionService.deleteVersion(id);
      await loadVersions();
    } catch (error) {
      console.error('Error deleting version:', error);
      alert('Failed to delete version');
    }
  };

  const handleEdit = (version: AppVersion) => {
    setEditingVersion(version);
    setShowModal(true);
  };

  const handleCreate = () => {
    setEditingVersion(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingVersion(null);
    loadVersions();
  };

  const helpSections = [
    {
      title: 'What is App Version Management?',
      content: 'This page manages mobile update metadata for iOS and Android after a release build is created. The installed app version itself comes from the mobile build; this page controls the update prompt, release messages, store links, and whether an update is required.'
    },
    {
      title: 'How to Create a New Version',
      content: [
        'First create or submit the mobile release build with the correct native app version',
        'Click the "Add New Version" button',
        'Select the platform (iOS or Android)',
        'Enter the matching version number (e.g., 1.0.2) and native build number',
        'Toggle "Force Update" if users must update before using the app',
        'Add update messages in English, Azerbaijani, and Russian',
        'Optionally add the App Store or Play Store URL',
        'Click "Create Version" to save'
      ]
    },
    {
      title: 'Force Update vs Optional Update',
      content: [
        '**Optional Update**: Users can choose to update later and continue using the app',
        '**Force Update**: Users must update before they can use the app (use for critical security fixes or breaking changes)'
      ]
    },
    {
      title: 'Best Practices',
      content: [
        'Always test updates on a staging environment first',
        'Use force update only for critical security fixes or breaking changes',
        'Provide clear, helpful update messages in all languages',
        'Keep app.config.js, package metadata, store submission, and App Versions entries consistent',
        'Add store URLs so users can easily find the update'
      ]
    },
    {
      title: 'How Updates Work',
      content: 'When users launch the app, it fetches the latest version for their platform and compares it with their installed native version and build number. If a newer version is found, they see an update modal with your custom message. Clicking "Update Now" opens the App Store or Play Store.'
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
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
        <h1 className="text-2xl font-bold text-gray-900">App Version Management</h1>
        <p className="text-gray-600 mt-1">
          Manage mobile update prompts for iOS and Android after a release build is created.
        </p>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">How it works</p>
          <p className="text-sm text-blue-700 mt-1">
            The native app version is set during the mobile build. After a build is submitted, add the matching
            version and build number here so installed apps can detect optional or required updates. Enable
            "Force Update" only when older builds should be blocked until users update.
          </p>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedPlatform === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Platforms
          </button>
          <button
            onClick={() => setSelectedPlatform('ios')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              selectedPlatform === 'ios'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Apple className="w-4 h-4" />
            iOS
          </button>
          <button
            onClick={() => setSelectedPlatform('android')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              selectedPlatform === 'android'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Android
          </button>
        </div>

        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add New Version
        </button>
      </div>

      {/* Versions Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading versions...</p>
        </div>
      ) : versions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Smartphone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No versions found</p>
          <p className="text-gray-500 text-sm mt-1">Create your first app version to get started</p>
          <button
            onClick={handleCreate}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add New Version
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platform
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Version
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Build
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Force Update
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Update Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {versions.map((version) => (
                <tr key={version.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {version.platform === 'ios' ? (
                        <Apple className="w-5 h-5 text-gray-600" />
                      ) : (
                        <Smartphone className="w-5 h-5 text-gray-600" />
                      )}
                      <span className="text-sm font-medium text-gray-900 capitalize">
                        {version.platform}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-semibold text-gray-900">{version.version}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{version.build_number}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {version.force_update ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Optional
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 line-clamp-2 max-w-md">
                      {version.update_message}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">
                      {new Date(version.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(version)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(version.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <VersionModal
          version={editingVersion}
          onClose={handleModalClose}
        />
      )}

      {/* Help Manual Modal */}
      <HelpManualModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="App Version Management Guide"
        sections={helpSections}
      />
    </div>
  );
}

// Version Modal Component
function VersionModal({ version, onClose }: { version: AppVersion | null; onClose: () => void }) {
  const [formData, setFormData] = useState({
    version: version?.version || '',
    build_number: version?.build_number || 1,
    platform: version?.platform || 'android' as 'ios' | 'android',
    force_update: version?.force_update || false,
    update_message: version?.update_message || '',
    update_message_az: version?.update_message_az || '',
    update_message_ru: version?.update_message_ru || '',
    ios_url: version?.ios_url || '',
    android_url: version?.android_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (version) {
        // Update existing
        await appVersionService.updateVersion(version.id, formData);
      } else {
        // Create new
        await appVersionService.createVersion(formData);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save version');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {version ? 'Edit Version' : 'Add New Version'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="platform"
                  value="android"
                  checked={formData.platform === 'android'}
                  onChange={(e) => setFormData({ ...formData, platform: e.target.value as 'android' })}
                  className="w-4 h-4 text-blue-600"
                />
                <Smartphone className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-900">Android</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="platform"
                  value="ios"
                  checked={formData.platform === 'ios'}
                  onChange={(e) => setFormData({ ...formData, platform: e.target.value as 'ios' })}
                  className="w-4 h-4 text-blue-600"
                />
                <Apple className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-900">iOS</span>
              </label>
            </div>
          </div>

          {/* Version & Build */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version * (e.g., 1.0.0)
              </label>
              <input
                type="text"
                required
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="1.0.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Build Number *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.build_number}
                onChange={(e) => setFormData({ ...formData, build_number: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Force Update */}
          <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              id="force_update"
              checked={formData.force_update}
              onChange={(e) => setFormData({ ...formData, force_update: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="force_update" className="flex-1 cursor-pointer">
              <span className="text-sm font-medium text-gray-900">Force Update</span>
              <p className="text-xs text-gray-600 mt-1">
                Users must update to this version before using the app
              </p>
            </label>
          </div>

          {/* Update Messages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Update Message (English) *
            </label>
            <textarea
              required
              rows={3}
              value={formData.update_message}
              onChange={(e) => setFormData({ ...formData, update_message: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="New features and improvements!"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Update Message (Azerbaijani)
            </label>
            <textarea
              rows={3}
              value={formData.update_message_az}
              onChange={(e) => setFormData({ ...formData, update_message_az: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Yeni funksiyalar və təkmilləşdirmələr!"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Update Message (Russian)
            </label>
            <textarea
              rows={3}
              value={formData.update_message_ru}
              onChange={(e) => setFormData({ ...formData, update_message_ru: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Новые функции и улучшения!"
            />
          </div>

          {/* Store URLs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {formData.platform === 'ios' ? 'App Store URL' : 'Play Store URL'}
            </label>
            <input
              type="url"
              value={formData.platform === 'ios' ? formData.ios_url : formData.android_url}
              onChange={(e) => setFormData({ 
                ...formData, 
                [formData.platform === 'ios' ? 'ios_url' : 'android_url']: e.target.value 
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={formData.platform === 'ios' 
                ? 'https://apps.apple.com/app/elmly/id123456789'
                : 'https://play.google.com/store/apps/details?id=com.elmly.app'
              }
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : version ? 'Update Version' : 'Create Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
