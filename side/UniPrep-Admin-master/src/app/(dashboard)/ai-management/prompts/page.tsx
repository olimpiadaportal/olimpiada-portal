'use client';

/**
 * Prompt Library Page
 * Stage 5.5 - Phase 5: Prompt Management
 * 
 * Centralized prompt management with CRUD operations and versioning
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Copy, 
  Trash2, 
  History,
  Play,
  TrendingUp,
  Tag,
  FileText,
  Settings,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { 
  getPrompts, 
  getPromptStats,
  deletePrompt,
  type AIPrompt,
  type PromptStats,
  type PromptFilters
} from '@/services/promptService';
import PromptEditorModal from '@/components/ai/PromptEditorModal';
import PromptTesterModal from '@/components/ai/PromptTesterModal';
import VersionHistoryModal from '@/components/ai/VersionHistoryModal';

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [stats, setStats] = useState<PromptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<AIPrompt | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, [selectedCategory, showActiveOnly, searchTerm]);

  const loadData = async () => {
    setLoading(true);

    const filters: PromptFilters = {
      is_active: showActiveOnly ? true : undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      search: searchTerm || undefined,
    };

    const [promptsResult, statsResult] = await Promise.all([
      getPrompts(filters),
      getPromptStats(),
    ]);

    if (promptsResult.success) {
      setPrompts(promptsResult.data || []);
    }

    if (statsResult.success) {
      setStats(statsResult.data || null);
    }

    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this prompt?')) return;

    const result = await deletePrompt(id);
    if (result.success) {
      loadData();
    } else {
      alert('Error deleting prompt: ' + result.error);
    }
  };

  const handleDuplicate = (prompt: AIPrompt) => {
    setSelectedPrompt({ ...prompt, id: '', name: `${prompt.name}_copy` });
    setShowEditor(true);
  };

  const categories = stats?.by_category.map((c) => c.category) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <Link
        href="/ai-management"
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to AI Management</span>
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Prompt Library</h1>
          <p className="text-gray-600 mt-1">
            Manage AI prompts with versioning and testing
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedPrompt(null);
            setShowEditor(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Prompt
        </button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Prompts</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.total_prompts}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Prompts</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {stats.active_prompts}
                </p>
              </div>
              <Settings className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Usage</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  {stats.total_usage.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Quality</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  {stats.avg_quality > 0 ? (stats.avg_quality * 100).toFixed(0) + '%' : 'N/A'}
                </p>
              </div>
              <Tag className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>

          {/* Active Filter */}
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(e) => setShowActiveOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Active Only</span>
          </label>
        </div>
      </div>

      {/* Prompts List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading prompts...</div>
        ) : prompts.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No prompts found</p>
            <p className="text-sm text-gray-500 mt-1">
              Try adjusting your filters or create a new prompt
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {prompt.name}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        v{prompt.version}
                      </span>
                      {prompt.is_active ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {prompt.description && (
                      <p className="text-sm text-gray-600 mb-3">
                        {prompt.description}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Tag className="w-4 h-4" />
                        {prompt.category.replace(/_/g, ' ')}
                      </span>
                      <span>Model: {prompt.model}</span>
                      <span>Temp: {prompt.temperature}</span>
                      <span>Max Tokens: {prompt.max_tokens}</span>
                      {prompt.usage_count > 0 && (
                        <span className="text-blue-600 font-medium">
                          Used {prompt.usage_count} times
                        </span>
                      )}
                      {prompt.avg_quality_score && (
                        <span className="text-green-600 font-medium">
                          Quality: {(prompt.avg_quality_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {prompt.tags && prompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {prompt.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedPrompt(prompt);
                        setShowTester(true);
                      }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Test Prompt"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPrompt(prompt);
                        setShowVersionHistory(true);
                      }}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="Version History"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPrompt(prompt);
                        setShowEditor(true);
                      }}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit Prompt"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDuplicate(prompt)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Duplicate Prompt"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(prompt.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Deactivate Prompt"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt Editor Modal */}
      <PromptEditorModal
        prompt={selectedPrompt}
        isOpen={showEditor}
        onClose={() => {
          setShowEditor(false);
          setSelectedPrompt(null);
        }}
        onSave={() => {
          loadData();
        }}
      />

      {/* Prompt Tester Modal */}
      <PromptTesterModal
        prompt={selectedPrompt}
        isOpen={showTester}
        onClose={() => {
          setShowTester(false);
          setSelectedPrompt(null);
        }}
        onTestComplete={() => {
          loadData(); // Refresh data after test completes
        }}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        promptName={selectedPrompt?.name || null}
        isOpen={showVersionHistory}
        onClose={() => {
          setShowVersionHistory(false);
          setSelectedPrompt(null);
        }}
        onRestore={() => {
          loadData();
        }}
      />
    </div>
  );
}
