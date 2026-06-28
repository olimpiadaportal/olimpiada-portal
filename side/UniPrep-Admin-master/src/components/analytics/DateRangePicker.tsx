import { useState } from 'react';
import { DateRange } from '@/services/analyticsService';
import { analyticsService } from '@/services/analyticsService';

interface DateRangePickerProps {
  dateRange: DateRange;
  onChange: (range: DateRange) => void;
  onPresetChange: (preset: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth') => void;
}

export function DateRangePicker({ dateRange, onChange, onPresetChange }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('last30days');

  const presets = [
    { label: 'Today', value: 'today' as const },
    { label: 'Yesterday', value: 'yesterday' as const },
    { label: 'Last 7 Days', value: 'last7days' as const },
    { label: 'Last 30 Days', value: 'last30days' as const },
    { label: 'This Month', value: 'thisMonth' as const },
    { label: 'Last Month', value: 'lastMonth' as const },
  ];

  // Check if current dateRange matches a preset
  const isPresetActive = (presetValue: string) => {
    const presetRange = analyticsService.getDateRangePreset(presetValue as 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth');
    return presetRange.startDate === dateRange.startDate && 
           presetRange.endDate === dateRange.endDate;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map((preset) => {
          const isActive = isPresetActive(preset.value);
          return (
            <button
              key={preset.value}
              onClick={() => {
                setSelectedPreset(preset.value);
                onPresetChange(preset.value);
                setShowCustom(false);
              }}
              className={`px-3 py-2 text-sm border rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 font-medium'
                  : 'border-gray-300 hover:bg-gray-50 text-gray-700'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Date Range */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Custom
      </button>

      {showCustom && (
        <div className="absolute right-0 mt-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => onChange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => onChange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setShowCustom(false)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
