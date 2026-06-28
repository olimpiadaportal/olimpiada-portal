'use client';

import { useState, useEffect } from 'react';
import { Flag, Plus, Edit2, Trash2, Download, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { auditLogService, AuditActionTypes } from '@/services/auditLogService';

interface FeatureFlag {
  id: string;
  flag_name: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  rollout_percentage: number;
  target_groups: string[];
}

export default function FeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [deletingFlag, setDeletingFlag] = useState<FeatureFlag | null>(null);

  useEffect(() => {
    loadFlags();
  }, []);

  async function loadFlags() {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .order('flag_name');

      if (error) throw error;
      setFlags(data || []);
    } catch (error) {
      console.error('Error loading feature flags:', error);
    } finally {
      setLoading(false);
    }
  }

  // Mutually exclusive flag pairs: when one is enabled, the other must be disabled
  const MUTUALLY_EXCLUSIVE_PAIRS: Record<string, string> = {
    'waitlist_enabled': 'webapp_auth_enabled',
    'webapp_auth_enabled': 'waitlist_enabled',
  };

  async function toggleFlag(id: string, currentState: boolean) {
    const flag = flags.find(f => f.id === id);
    if (!flag) return;

    const newState = !currentState;

    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: newState })
        .eq('id', id);

      if (error) throw error;

      // Log the toggle action
      await auditLogService.logAction({
        actionType: AuditActionTypes.FEATURE_FLAG_UPDATE,
        tableName: 'feature_flags',
        recordId: id,
        oldValues: { is_enabled: currentState },
        newValues: { is_enabled: newState },
        description: `${newState ? 'Enabled' : 'Disabled'} feature flag: ${flag.display_name}`,
        metadata: { flag_name: flag.flag_name }
      });

      // Handle mutually exclusive flags: if enabling this flag, disable its opposite
      if (newState && MUTUALLY_EXCLUSIVE_PAIRS[flag.flag_name]) {
        const oppositeFlagName = MUTUALLY_EXCLUSIVE_PAIRS[flag.flag_name];
        const oppositeFlag = flags.find(f => f.flag_name === oppositeFlagName);
        if (oppositeFlag && oppositeFlag.is_enabled) {
          const { error: oppositeError } = await supabase
            .from('feature_flags')
            .update({ is_enabled: false })
            .eq('id', oppositeFlag.id);

          if (!oppositeError) {
            await auditLogService.logAction({
              actionType: AuditActionTypes.FEATURE_FLAG_UPDATE,
              tableName: 'feature_flags',
              recordId: oppositeFlag.id,
              oldValues: { is_enabled: true },
              newValues: { is_enabled: false },
              description: `Auto-disabled "${oppositeFlag.display_name}" (mutually exclusive with "${flag.display_name}")`,
              metadata: { flag_name: oppositeFlag.flag_name, auto_toggled: true, reason: `mutually_exclusive_with_${flag.flag_name}` }
            });
          }
        }
      }

      await loadFlags();
    } catch (error) {
      console.error('Error toggling flag:', error);
    }
  }

  async function handleEditSave() {
    if (!editingFlag) return;
    
    const originalFlag = flags.find(f => f.id === editingFlag.id);

    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({
          display_name: editingFlag.display_name,
          description: editingFlag.description,
          rollout_percentage: editingFlag.rollout_percentage,
          target_groups: editingFlag.target_groups
        })
        .eq('id', editingFlag.id);

      if (error) throw error;
      
      // Log the edit action
      await auditLogService.logAction({
        actionType: AuditActionTypes.FEATURE_FLAG_UPDATE,
        tableName: 'feature_flags',
        recordId: editingFlag.id,
        oldValues: originalFlag ? {
          display_name: originalFlag.display_name,
          description: originalFlag.description,
          rollout_percentage: originalFlag.rollout_percentage,
          target_groups: originalFlag.target_groups
        } : undefined,
        newValues: {
          display_name: editingFlag.display_name,
          description: editingFlag.description,
          rollout_percentage: editingFlag.rollout_percentage,
          target_groups: editingFlag.target_groups
        },
        description: `Updated feature flag: ${editingFlag.display_name}`,
        metadata: { flag_name: editingFlag.flag_name }
      });
      
      await loadFlags();
      setEditingFlag(null);
    } catch (error) {
      console.error('Error updating flag:', error);
      alert('Failed to update feature flag');
    }
  }

  async function handleDelete() {
    if (!deletingFlag) return;

    try {
      const { error } = await supabase
        .from('feature_flags')
        .delete()
        .eq('id', deletingFlag.id);

      if (error) throw error;
      
      // Log the delete action
      await auditLogService.logAction({
        actionType: 'DELETE',
        tableName: 'feature_flags',
        recordId: deletingFlag.id,
        oldValues: {
          flag_name: deletingFlag.flag_name,
          display_name: deletingFlag.display_name,
          is_enabled: deletingFlag.is_enabled
        },
        description: `Deleted feature flag: ${deletingFlag.display_name}`,
        metadata: { flag_name: deletingFlag.flag_name }
      });
      
      await loadFlags();
      setDeletingFlag(null);
    } catch (error) {
      console.error('Error deleting flag:', error);
      alert('Failed to delete feature flag');
    }
  }

  function handleExport() {
    const exportData = flags.map(({ id, ...flag }) => flag);
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-flags-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        // 1. Validate file
        const { validateImportFile, safeJSONParse, validateImport } = await import('@/utils/importValidation');
        
        const fileValidation = validateImportFile(file);
        if (!fileValidation.valid) {
          throw new Error(fileValidation.error);
        }

        const text = await file.text();

        // 2. Safe JSON parse
        const parseResult = safeJSONParse(text);
        if (!parseResult.success) {
          throw new Error(parseResult.error);
        }

        const importedFlags = parseResult.data;

        // 3. Comprehensive validation
        const validation = validateImport(importedFlags, 'feature_flags');
        if (!validation.valid) {
          const errorList = validation.errors.join('\n• ');
          throw new Error(`Import validation failed:\n\n• ${errorList}`);
        }

        // 4. Confirm before import
        if (confirm(
          `Import ${importedFlags.length} feature flags?\n\n` +
          `⚠️ This will overwrite existing flags with the same name.\n\n` +
          `Continue?`
        )) {
          let successCount = 0;
          let errorCount = 0;

          for (const flag of importedFlags) {
            try {
              // Remove timestamps to avoid conflicts
              const { created_at, updated_at, ...flagData } = flag;
              
              await supabase
                .from('feature_flags')
                .upsert(flagData, { onConflict: 'flag_name' });
              successCount++;
            } catch (err) {
              console.error(`Failed to import flag ${flag.flag_name}:`, err);
              errorCount++;
            }
          }

          await loadFlags();

          if (errorCount === 0) {
            alert(`✅ Successfully imported ${successCount} feature flags!`);
          } else {
            alert(`⚠️ Imported ${successCount} flags with ${errorCount} errors. Check console for details.`);
          }
        }
      } catch (error: any) {
        console.error('Error importing flags:', error);
        alert(error.message || 'Failed to import feature flags. Please check the file format.');
      }
    };
    input.click();
  }

  if (loading) {
    return <div className="text-center py-8">Loading feature flags...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Feature Flags</h2>
          <p className="text-sm text-gray-600 mt-1">Manage feature flags and gradual rollouts</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button 
            onClick={handleImport}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {flags.map((flag) => (
          <div key={flag.id} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Flag className="w-5 h-5 text-gray-400" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{flag.display_name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{flag.flag_name}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3">{flag.description}</p>
                {MUTUALLY_EXCLUSIVE_PAIRS[flag.flag_name] && (
                  <p className="text-xs text-amber-600 mt-1">
                    Mutually exclusive with: <strong>{flags.find(f => f.flag_name === MUTUALLY_EXCLUSIVE_PAIRS[flag.flag_name])?.display_name || MUTUALLY_EXCLUSIVE_PAIRS[flag.flag_name]}</strong>
                    {flag.is_enabled && ' — enabling this will auto-disable the other'}
                  </p>
                )}
                
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Rollout:</span>
                    <span className="text-sm font-medium text-gray-900">{flag.rollout_percentage}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Target:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {flag.target_groups.join(', ')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFlag(flag.id, flag.is_enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    flag.is_enabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      flag.is_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button 
                  onClick={() => setEditingFlag(flag)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="Edit feature flag"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setDeletingFlag(flag)}
                  className="p-2 text-gray-400 hover:text-red-600"
                  title="Delete feature flag"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingFlag && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Feature Flag</h3>
              <button onClick={() => setEditingFlag(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flag Name (Read-only)</label>
                <input
                  type="text"
                  value={editingFlag.flag_name}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editingFlag.display_name}
                  onChange={(e) => setEditingFlag({ ...editingFlag, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editingFlag.description}
                  onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rollout Percentage</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editingFlag.rollout_percentage}
                    onChange={(e) => setEditingFlag({ ...editingFlag, rollout_percentage: parseInt(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-gray-900 w-12">{editingFlag.rollout_percentage}%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Groups</label>
                <div className="space-y-2">
                  {['all', 'students', 'teachers', 'admins'].map(group => (
                    <label key={group} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingFlag.target_groups.includes(group)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditingFlag({ 
                              ...editingFlag, 
                              target_groups: [...editingFlag.target_groups, group]
                            });
                          } else {
                            setEditingFlag({ 
                              ...editingFlag, 
                              target_groups: editingFlag.target_groups.filter(g => g !== group)
                            });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{group}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Select which user groups can access this feature</p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingFlag(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingFlag && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-600">Delete Feature Flag</h3>
              <button onClick={() => setDeletingFlag(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the feature flag <strong>{deletingFlag.display_name}</strong>? 
              This action cannot be undone and may affect the mobile app functionality.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setDeletingFlag(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
