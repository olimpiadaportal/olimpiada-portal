import { Power } from 'lucide-react';
import type { GlobalSettings } from '@/services/aiConfigService';

interface Props {
  settings: GlobalSettings;
  onChange: (settings: GlobalSettings) => void;
}

export default function GlobalSettingsTab({ settings, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
        <Power className={`w-5 h-5 ${settings.enabled ? 'text-green-600' : 'text-gray-400'}`} />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">System Status</h3>
          <p className="text-sm text-gray-600">Enable or disable AI system</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Provider</label>
          <select
            value={settings.default_provider}
            onChange={(e) => onChange({ ...settings, default_provider: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Model</label>
          <select
            value={settings.default_model}
            onChange={(e) => onChange({ ...settings, default_model: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {/* DeepSeek Models */}
            <optgroup label="DeepSeek">
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-coder">deepseek-coder</option>
            </optgroup>
            {/* OpenAI Models */}
            <optgroup label="OpenAI">
              <option value="gpt-4">gpt-4</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </optgroup>
            {/* Anthropic Models */}
            <optgroup label="Anthropic">
              <option value="claude-3-opus">claude-3-opus</option>
              <option value="claude-3-sonnet">claude-3-sonnet</option>
              <option value="claude-3-haiku">claude-3-haiku</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Temperature (0-2)</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={settings.default_temperature}
            onChange={(e) => onChange({ ...settings, default_temperature: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Tokens</label>
          <input
            type="number"
            min="1"
            value={settings.default_max_tokens}
            onChange={(e) => onChange({ ...settings, default_max_tokens: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-900">Fallback Configuration</h4>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.auto_fallback_enabled}
            onChange={(e) => onChange({ ...settings, auto_fallback_enabled: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Enable automatic fallback</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fallback Provider</label>
            <select
              value={settings.fallback_provider}
              onChange={(e) => onChange({ ...settings, fallback_provider: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fallback Model</label>
            <select
              value={settings.fallback_model}
              onChange={(e) => onChange({ ...settings, fallback_model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <optgroup label="DeepSeek">
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-coder">deepseek-coder</option>
              </optgroup>
              <optgroup label="OpenAI">
                <option value="gpt-4">gpt-4</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              </optgroup>
              <optgroup label="Anthropic">
                <option value="claude-3-opus">claude-3-opus</option>
                <option value="claude-3-sonnet">claude-3-sonnet</option>
                <option value="claude-3-haiku">claude-3-haiku</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-900">Quality & Logging</h4>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.log_all_requests}
            onChange={(e) => onChange({ ...settings, log_all_requests: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Log all AI requests</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quality Threshold (0-1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={settings.quality_threshold}
            onChange={(e) => onChange({ ...settings, quality_threshold: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Responses below this threshold will be flagged for review
          </p>
        </div>
      </div>
    </div>
  );
}
