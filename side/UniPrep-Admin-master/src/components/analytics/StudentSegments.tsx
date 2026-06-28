import { StudentSegments as StudentSegmentsType } from '@/services/analyticsService';

interface StudentSegmentsProps {
  segments: StudentSegmentsType;
}

export function StudentSegments({ segments }: StudentSegmentsProps) {
  const segmentData = [
    { label: 'High Performers', value: segments.highPerformers, color: 'bg-green-500', textColor: 'text-green-700' },
    { label: 'Power Users', value: segments.powerUsers, color: 'bg-blue-500', textColor: 'text-blue-700' },
    { label: 'Struggling', value: segments.struggling, color: 'bg-yellow-500', textColor: 'text-yellow-700' },
    { label: 'At Risk', value: segments.atRisk, color: 'bg-red-500', textColor: 'text-red-700' },
    { label: 'Inactive', value: segments.inactive, color: 'bg-gray-500', textColor: 'text-gray-700' },
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Segments</h3>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {segmentData.map((segment, index) => (
          <div key={index} className="text-center">
            <div className={`w-16 h-16 ${segment.color} rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xl font-bold`}>
              {segment.value}
            </div>
            <div className={`text-sm font-medium ${segment.textColor}`}>{segment.label}</div>
            <div className="text-xs text-gray-500 mt-1">
              {segments.total > 0 ? ((segment.value / segments.total) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 text-center">
        <span className="text-sm text-gray-600">Total Students: </span>
        <span className="text-sm font-semibold text-gray-900">{segments.total}</span>
      </div>
    </div>
  );
}
