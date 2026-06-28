'use client';

import { Save } from 'lucide-react';

interface SettingInputProps {
  label: string;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  onSave: () => void;
  type: 'text' | 'email' | 'tel' | 'number' | 'boolean' | 'textarea';
  description?: string;
  saving?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  rows?: number;
}

export default function SettingInput({
  label,
  value,
  onChange,
  onSave,
  type,
  description,
  saving = false,
  placeholder,
  min,
  max,
  rows = 3,
}: SettingInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (type === 'number') {
      onChange(parseFloat(e.target.value));
    } else {
      onChange(e.target.value);
    }
  };

  const handleBooleanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
      </div>

      {type === 'boolean' ? (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={handleBooleanChange}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-600">{description}</span>
        </div>
      ) : type === 'textarea' ? (
        <textarea
          value={value as string}
          onChange={handleChange}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      ) : (
        <input
          type={type}
          value={value as string | number}
          onChange={handleChange}
          placeholder={placeholder}
          min={min}
          max={max}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}

      {description && type !== 'boolean' && (
        <p className="text-sm text-gray-500">{description}</p>
      )}
    </div>
  );
}
