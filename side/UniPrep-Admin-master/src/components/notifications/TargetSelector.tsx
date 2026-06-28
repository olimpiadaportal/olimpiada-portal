'use client';

import { useState, useEffect } from 'react';
import { adminNotificationService, NotificationTarget } from '@/services/adminNotificationService';

interface TargetSelectorProps {
  value: NotificationTarget;
  onChange: (target: NotificationTarget) => void;
  onCountChange?: (count: number) => void;
}

const TARGET_GROUPS = ['I', 'II', 'III', 'IV', 'V'];

export default function TargetSelector({ value, onChange, onCountChange }: TargetSelectorProps) {
  const [targetCount, setTargetCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [individualInput, setIndividualInput] = useState('');

  // Update target count when value changes
  useEffect(() => {
    updateTargetCount();
  }, [value]);

  const updateTargetCount = async () => {
    setLoading(true);
    try {
      const count = await adminNotificationService.getTargetCount(value);
      setTargetCount(count);
      onCountChange?.(count);
    } catch (error) {
      console.error('Error getting target count:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type: NotificationTarget['type']) => {
    onChange({ type, filter: {} });
  };

  const handleGroupChange = (target_group: string) => {
    onChange({ type: 'target_group', filter: { target_group } });
  };

  const handleIndividualAdd = () => {
    if (!individualInput.trim()) return;
    
    const currentIds = value.filter?.user_ids || [];
    const newIds = individualInput.split(',').map(id => id.trim()).filter(Boolean);
    
    onChange({
      type: 'individual',
      filter: { user_ids: [...new Set([...currentIds, ...newIds])] }
    });
    setIndividualInput('');
  };

  const handleIndividualRemove = (id: string) => {
    const currentIds = value.filter?.user_ids || [];
    onChange({
      type: 'individual',
      filter: { user_ids: currentIds.filter(uid => uid !== id) }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Target Audience
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { type: 'all', label: 'All Users', icon: '👥' },
            { type: 'students', label: 'Students Only', icon: '🎓' },
            { type: 'teachers', label: 'Teachers Only', icon: '👨‍🏫' },
            { type: 'target_group', label: 'By Group', icon: '📊' },
            { type: 'individual', label: 'Individual', icon: '👤' },
          ].map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => handleTypeChange(option.type as NotificationTarget['type'])}
              className={`
                flex items-center gap-2 p-3 rounded-lg border-2 transition-all
                ${value.type === option.type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }
              `}
            >
              <span className="text-xl">{option.icon}</span>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Target Group Selector */}
      {value.type === 'target_group' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Target Group
          </label>
          <div className="flex gap-2">
            {TARGET_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => handleGroupChange(group)}
                className={`
                  px-4 py-2 rounded-lg border-2 font-medium transition-all
                  ${value.filter?.target_group === group
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }
                `}
              >
                Group {group}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Individual User Selector */}
      {value.type === 'individual' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            User IDs (comma-separated)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={individualInput}
              onChange={(e) => setIndividualInput(e.target.value)}
              placeholder="Enter user IDs..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleIndividualAdd}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add
            </button>
          </div>
          
          {/* Selected Users */}
          {value.filter?.user_ids && value.filter.user_ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {value.filter.user_ids.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm"
                >
                  <span className="truncate max-w-[150px]">{id}</span>
                  <button
                    type="button"
                    onClick={() => handleIndividualRemove(id)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Target Count Display */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
        <span className="text-2xl">📬</span>
        <div>
          <p className="text-sm text-gray-600">Recipients</p>
          <p className="text-lg font-semibold text-gray-900">
            {loading ? (
              <span className="text-gray-400">Calculating...</span>
            ) : (
              <span>{targetCount.toLocaleString()} users</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
