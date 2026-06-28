import type { CostControls } from '@/services/aiConfigService';

interface Props {
  controls: CostControls;
  onChange: (controls: CostControls) => void;
}

export default function CostControlsTab({ controls, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Daily Budget (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={controls.daily_budget_usd}
            onChange={(e) => onChange({ ...controls, daily_budget_usd: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Budget (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={controls.monthly_budget_usd}
            onChange={(e) => onChange({ ...controls, monthly_budget_usd: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Alert at % of Budget</label>
          <input
            type="number"
            min="0"
            max="100"
            value={controls.alert_at_percentage}
            onChange={(e) => onChange({ ...controls, alert_at_percentage: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Cost per Request (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={controls.max_cost_per_request}
            onChange={(e) => onChange({ ...controls, max_cost_per_request: parseFloat(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-900">Optimization</h4>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={controls.auto_disable_on_budget}
            onChange={(e) => onChange({ ...controls, auto_disable_on_budget: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Automatically disable AI when budget exceeded</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={controls.prefer_cheaper_models}
            onChange={(e) => onChange({ ...controls, prefer_cheaper_models: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Prefer cheaper models when possible</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={controls.track_per_feature}
            onChange={(e) => onChange({ ...controls, track_per_feature: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Track costs per feature</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={controls.optimize_token_usage}
            onChange={(e) => onChange({ ...controls, optimize_token_usage: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Optimize token usage</span>
        </label>
      </div>
    </div>
  );
}
