'use client';

/**
 * Version History Modal
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * View and compare prompt versions with diff viewer
 */

import { useState, useEffect } from 'react';
import { X, History, CheckCircle, Clock, TrendingUp, GitCompare, RotateCcw } from 'lucide-react';
import {
  getPromptVersions,
  updatePrompt,
  type AIPrompt,
} from '@/services/promptService';

interface VersionHistoryModalProps {
  promptName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: () => void;
}

export default function VersionHistoryModal({
  promptName,
  isOpen,
  onClose,
  onRestore,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<AIPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<[AIPrompt | null, AIPrompt | null]>([
    null,
    null,
  ]);
  const [showComparison, setShowComparison] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (isOpen && promptName) {
      loadVersions();
    }
  }, [isOpen, promptName]);

  const loadVersions = async () => {
    if (!promptName) return;

    setLoading(true);
    try {
      const result = await getPromptVersions(promptName);
      if (result.success && result.data) {
        setVersions(result.data);
      }
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVersion = (version: AIPrompt, slot: 0 | 1) => {
    const newSelection: [AIPrompt | null, AIPrompt | null] = [...selectedVersions];
    newSelection[slot] = version;
    setSelectedVersions(newSelection);
  };

  const handleCompare = () => {
    if (selectedVersions[0] && selectedVersions[1]) {
      setShowComparison(true);
    }
  };

  const handleRestore = async (version: AIPrompt) => {
    if (!confirm(`Restore to version ${version.version}? This will create a new version with this configuration.`)) {
      return;
    }

    setRestoring(true);
    try {
      // Create new version with old configuration
      const result = await updatePrompt(version.id, {
        description: version.description || undefined,
        system_prompt: version.system_prompt || undefined,
        user_prompt_template: version.user_prompt_template,
        model: version.model,
        temperature: version.temperature,
        max_tokens: version.max_tokens,
        top_p: version.top_p,
        frequency_penalty: version.frequency_penalty,
        presence_penalty: version.presence_penalty,
        tags: version.tags || undefined,
        variables: version.variables || undefined,
        example_input: version.example_input || undefined,
        example_output: version.example_output || undefined,
      });

      if (result.success) {
        onRestore();
        onClose();
      }
    } catch (error) {
      console.error('Error restoring version:', error);
      alert('Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <History className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Version History</h2>
              <p className="text-sm text-gray-600 mt-1">{promptName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : showComparison && selectedVersions[0] && selectedVersions[1] ? (
            /* Comparison View */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Version Comparison</h3>
                <button
                  onClick={() => setShowComparison(false)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  ← Back to versions
                </button>
              </div>

              {/* Version Headers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900">
                    Version {selectedVersions[0].version}
                    {selectedVersions[0].is_active && (
                      <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded">
                        Active
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {new Date(selectedVersions[0].created_at).toLocaleString()}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900">
                    Version {selectedVersions[1].version}
                    {selectedVersions[1].is_active && (
                      <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded">
                        Active
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-purple-700 mt-1">
                    {new Date(selectedVersions[1].created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Configuration Comparison */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  {/* Model */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Model:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[0].model}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Model:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[1].model}
                    </span>
                  </div>

                  {/* Temperature */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Temperature:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[0].temperature}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Temperature:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[1].temperature}
                    </span>
                  </div>

                  {/* Max Tokens */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Max Tokens:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[0].max_tokens}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-sm text-gray-600">Max Tokens:</span>
                    <span className="ml-2 font-medium text-gray-900">
                      {selectedVersions[1].max_tokens}
                    </span>
                  </div>
                </div>
              </div>

              {/* Prompt Comparison */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">User Prompt Template</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <pre className="text-sm text-blue-900 whitespace-pre-wrap font-mono">
                      {selectedVersions[0].user_prompt_template}
                    </pre>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <pre className="text-sm text-purple-900 whitespace-pre-wrap font-mono">
                      {selectedVersions[1].user_prompt_template}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Performance Comparison */}
              {(selectedVersions[0].usage_count > 0 || selectedVersions[1].usage_count > 0) && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Performance Metrics</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-sm text-gray-600">Usage Count:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {selectedVersions[0].usage_count}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-sm text-gray-600">Avg Quality:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {selectedVersions[0].avg_quality_score?.toFixed(2) || 'N/A'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-sm text-gray-600">Usage Count:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {selectedVersions[1].usage_count}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-sm text-gray-600">Avg Quality:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {selectedVersions[1].avg_quality_score?.toFixed(2) || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Version List */
            <div className="space-y-4">
              {/* Comparison Controls */}
              {selectedVersions[0] || selectedVersions[1] ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-blue-900">
                        {selectedVersions[0] && selectedVersions[1]
                          ? 'Ready to compare'
                          : 'Select another version to compare'}
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        Selected: v{selectedVersions[0]?.version || '?'} vs v
                        {selectedVersions[1]?.version || '?'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedVersions([null, null])}
                        className="px-3 py-2 text-sm text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50"
                      >
                        Clear
                      </button>
                      {selectedVersions[0] && selectedVersions[1] && (
                        <button
                          onClick={handleCompare}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <GitCompare className="w-4 h-4" />
                          Compare
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Version Cards */}
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 ${
                      selectedVersions[0]?.id === version.id ||
                      selectedVersions[1]?.id === version.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-gray-900">
                            Version {version.version}
                          </h4>
                          {version.is_active && (
                            <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-1 rounded">
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </span>
                          )}
                          {index === 0 && !version.is_active && (
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                              Latest
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Clock className="w-4 h-4" />
                            {new Date(version.created_at).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="text-gray-600">Model:</span>
                            <span className="ml-1 font-medium text-gray-900">
                              {version.model}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Temp:</span>
                            <span className="ml-1 font-medium text-gray-900">
                              {version.temperature}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-gray-900">
                              {version.usage_count} uses
                            </span>
                          </div>
                        </div>

                        {version.description && (
                          <p className="text-sm text-gray-600 mb-2">{version.description}</p>
                        )}
                      </div>

                      <div className="flex gap-2 ml-4">
                        {!version.is_active && (
                          <button
                            onClick={() => handleRestore(version)}
                            disabled={restoring}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Restore this version"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (selectedVersions[0]?.id === version.id) {
                              handleSelectVersion(version, 0);
                            } else if (selectedVersions[1]?.id === version.id) {
                              setSelectedVersions([selectedVersions[0], null]);
                            } else if (!selectedVersions[0]) {
                              handleSelectVersion(version, 0);
                            } else if (!selectedVersions[1]) {
                              handleSelectVersion(version, 1);
                            } else {
                              handleSelectVersion(version, 0);
                            }
                          }}
                          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                            selectedVersions[0]?.id === version.id ||
                            selectedVersions[1]?.id === version.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {selectedVersions[0]?.id === version.id ||
                          selectedVersions[1]?.id === version.id
                            ? 'Selected'
                            : 'Select'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {versions.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">
                  No versions found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
