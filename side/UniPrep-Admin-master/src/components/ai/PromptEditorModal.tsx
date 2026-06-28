'use client';

/**
 * Prompt Editor Modal
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Modal for creating and editing AI prompts with full configuration
 */

import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Info } from 'lucide-react';
import {
  createPrompt,
  updatePrompt,
  createPromptVersion,
  type AIPrompt,
  type CreatePromptInput,
  type UpdatePromptInput,
} from '@/services/promptService';

interface PromptEditorModalProps {
  prompt?: AIPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function PromptEditorModal({
  prompt,
  isOpen,
  onClose,
  onSave,
}: PromptEditorModalProps) {
  const [formData, setFormData] = useState<CreatePromptInput>({
    name: '',
    description: '',
    category: 'question_generation',
    system_prompt: '',
    user_prompt_template: '',
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    tags: [],
    variables: {},
    example_input: {},
    example_output: '',
  });

  const [tagInput, setTagInput] = useState('');
  const [variableKey, setVariableKey] = useState('');
  const [variableValue, setVariableValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createNewVersion, setCreateNewVersion] = useState(false);

  // Initialize form with prompt data
  useEffect(() => {
    if (prompt) {
      setFormData({
        name: prompt.name,
        description: prompt.description || '',
        category: prompt.category,
        system_prompt: prompt.system_prompt || '',
        user_prompt_template: prompt.user_prompt_template,
        model: prompt.model,
        temperature: prompt.temperature,
        max_tokens: prompt.max_tokens,
        top_p: prompt.top_p,
        frequency_penalty: prompt.frequency_penalty,
        presence_penalty: prompt.presence_penalty,
        tags: prompt.tags || [],
        variables: prompt.variables || {},
        example_input: prompt.example_input || {},
        example_output: prompt.example_output || '',
      });
    }
  }, [prompt]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);

    try {
      let result;

      if (prompt?.id && !createNewVersion) {
        // Update existing prompt
        const updateData: UpdatePromptInput = {
          description: formData.description,
          system_prompt: formData.system_prompt,
          user_prompt_template: formData.user_prompt_template,
          model: formData.model,
          temperature: formData.temperature,
          max_tokens: formData.max_tokens,
          top_p: formData.top_p,
          frequency_penalty: formData.frequency_penalty,
          presence_penalty: formData.presence_penalty,
          tags: formData.tags,
          variables: formData.variables,
          example_input: formData.example_input,
          example_output: formData.example_output,
        };
        result = await updatePrompt(prompt.id, updateData);
      } else if (prompt?.id && createNewVersion) {
        // Create new version
        const updateData: UpdatePromptInput = {
          description: formData.description,
          system_prompt: formData.system_prompt,
          user_prompt_template: formData.user_prompt_template,
          model: formData.model,
          temperature: formData.temperature,
          max_tokens: formData.max_tokens,
          top_p: formData.top_p,
          frequency_penalty: formData.frequency_penalty,
          presence_penalty: formData.presence_penalty,
          tags: formData.tags,
          variables: formData.variables,
          example_input: formData.example_input,
          example_output: formData.example_output,
        };
        result = await createPromptVersion(prompt.id, updateData);
      } else {
        // Create new prompt
        result = await createPrompt(formData);
      }

      if (result.success) {
        onSave();
        onClose();
      } else {
        setError(result.error || 'Failed to save prompt');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag) || [],
    });
  };

  const addVariable = () => {
    if (variableKey.trim() && variableValue.trim()) {
      setFormData({
        ...formData,
        variables: {
          ...formData.variables,
          [variableKey.trim()]: variableValue.trim(),
        },
      });
      setVariableKey('');
      setVariableValue('');
    }
  };

  const removeVariable = (key: string) => {
    const newVariables = { ...formData.variables };
    delete newVariables[key];
    setFormData({
      ...formData,
      variables: newVariables,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {prompt?.id
                ? createNewVersion
                  ? 'Create New Version'
                  : 'Edit Prompt'
                : 'Create New Prompt'}
            </h2>
            {prompt?.id && (
              <p className="text-sm text-gray-600 mt-1">
                Current version: v{prompt.version}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Version Option */}
          {prompt?.id && (
            <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <input
                type="checkbox"
                id="createVersion"
                checked={createNewVersion}
                onChange={(e) => setCreateNewVersion(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="createVersion" className="text-sm text-blue-900">
                Create new version (recommended for active prompts)
              </label>
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!!prompt?.id && !createNewVersion}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="e.g., question_generation_v2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Brief description of this prompt's purpose"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="question_generation">Question Generation</option>
                  <option value="answer_explanation">Answer Explanation</option>
                  <option value="hint_generation">Hint Generation</option>
                  <option value="content_analysis">Content Analysis</option>
                  <option value="feedback_generation">Feedback Generation</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model *
                </label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="deepseek-chat">DeepSeek Chat</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-3-opus">Claude 3 Opus</option>
                  <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                </select>
              </div>
            </div>
          </div>

          {/* Prompts */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Prompt Content</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                System Prompt
              </label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) =>
                  setFormData({ ...formData, system_prompt: e.target.value })
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="System instructions for the AI..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Prompt Template *
              </label>
              <textarea
                value={formData.user_prompt_template}
                onChange={(e) =>
                  setFormData({ ...formData, user_prompt_template: e.target.value })
                }
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="User prompt with {{variables}} for dynamic content..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Use {'{{'} and {'}}' } for variables (e.g., {'{{topic}}'})
              </p>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Model Configuration</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature (0-2)
                </label>
                <input
                  type="number"
                  value={formData.temperature}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={formData.max_tokens}
                  onChange={(e) =>
                    setFormData({ ...formData, max_tokens: parseInt(e.target.value) })
                  }
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Top P (0-1)
                </label>
                <input
                  type="number"
                  value={formData.top_p}
                  onChange={(e) =>
                    setFormData({ ...formData, top_p: parseFloat(e.target.value) })
                  }
                  min="0"
                  max="1"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency Penalty (-2 to 2)
                </label>
                <input
                  type="number"
                  value={formData.frequency_penalty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      frequency_penalty: parseFloat(e.target.value),
                    })
                  }
                  min="-2"
                  max="2"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Tags</h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add tag..."
              />
              <button
                onClick={addTag}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>

            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Variables */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Template Variables</h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={variableKey}
                onChange={(e) => setVariableKey(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Variable name (e.g., topic)"
              />
              <input
                type="text"
                value={variableValue}
                onChange={(e) => setVariableValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addVariable()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Description"
              />
              <button
                onClick={addVariable}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add
              </button>
            </div>

            {formData.variables && Object.keys(formData.variables).length > 0 && (
              <div className="space-y-2">
                {Object.entries(formData.variables).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="font-mono text-sm text-blue-600">
                        {'{{' + key + '}}'}
                      </span>
                      <span className="text-sm text-gray-600 ml-2">- {value}</span>
                    </div>
                    <button
                      onClick={() => removeVariable(key)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.name || !formData.user_prompt_template}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}
