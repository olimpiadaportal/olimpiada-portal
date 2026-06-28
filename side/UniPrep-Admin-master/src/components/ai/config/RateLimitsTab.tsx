import type { RateLimits } from '@/services/aiConfigService';

interface Props {
  limits: RateLimits;
  onChange: (limits: RateLimits) => void;
}

export default function RateLimitsTab({ limits, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">Rate Limiting</h3>
          <p className="text-sm text-gray-600">Control API request rates</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={limits.enabled}
            onChange={(e) => onChange({ ...limits, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Global Limits</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Minute</label>
            <input
              type="number"
              value={limits.global.requests_per_minute}
              onChange={(e) => onChange({
                ...limits,
                global: { ...limits.global, requests_per_minute: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Hour</label>
            <input
              type="number"
              value={limits.global.requests_per_hour}
              onChange={(e) => onChange({
                ...limits,
                global: { ...limits.global, requests_per_hour: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Day</label>
            <input
              type="number"
              value={limits.global.requests_per_day}
              onChange={(e) => onChange({
                ...limits,
                global: { ...limits.global, requests_per_day: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-900">Per User Limits</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Minute</label>
            <input
              type="number"
              value={limits.per_user.requests_per_minute}
              onChange={(e) => onChange({
                ...limits,
                per_user: { ...limits.per_user, requests_per_minute: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Hour</label>
            <input
              type="number"
              value={limits.per_user.requests_per_hour}
              onChange={(e) => onChange({
                ...limits,
                per_user: { ...limits.per_user, requests_per_hour: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Per Day</label>
            <input
              type="number"
              value={limits.per_user.requests_per_day}
              onChange={(e) => onChange({
                ...limits,
                per_user: { ...limits.per_user, requests_per_day: parseInt(e.target.value) }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-4 border-t border-gray-200">
        <h4 className="font-medium text-gray-900">Behavior</h4>
        
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={limits.block_on_limit}
            onChange={(e) => onChange({ ...limits, block_on_limit: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Block requests when limit reached</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={limits.notify_on_limit}
            onChange={(e) => onChange({ ...limits, notify_on_limit: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Notify admins when limit reached</span>
        </label>
      </div>
    </div>
  );
}
