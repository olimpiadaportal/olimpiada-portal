import { StudentSegments } from '@/services/analyticsService';

interface StudentSegmentsPieProps {
  segments: StudentSegments | null;
}

export function StudentSegmentsPie({ segments }: StudentSegmentsPieProps) {
  if (!segments) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Distribution</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No segment data available
        </div>
      </div>
    );
  }

  const segmentData = [
    { label: 'High Performers', value: segments.highPerformers, color: 'bg-green-500', percentage: 0 },
    { label: 'Power Users', value: segments.powerUsers, color: 'bg-blue-500', percentage: 0 },
    { label: 'Struggling', value: segments.struggling, color: 'bg-yellow-500', percentage: 0 },
    { label: 'At Risk', value: segments.atRisk, color: 'bg-red-500', percentage: 0 },
    { label: 'Inactive', value: segments.inactive, color: 'bg-gray-500', percentage: 0 },
  ];

  // Calculate percentages
  segmentData.forEach(seg => {
    seg.percentage = segments.total > 0 ? (seg.value / segments.total) * 100 : 0;
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Distribution</h3>
      
      {/* Stacked Bar */}
      <div className="mb-6">
        <div className="flex h-8 rounded-lg overflow-hidden">
          {segmentData.map((seg, idx) => (
            seg.percentage > 0 && (
              <div
                key={idx}
                className={seg.color}
                style={{ width: `${seg.percentage}%` }}
                title={`${seg.label}: ${seg.value} (${seg.percentage.toFixed(1)}%)`}
              />
            )
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3">
        {segmentData.map((seg, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${seg.color}`} />
              <span className="text-sm text-gray-700">{seg.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900">{seg.value}</span>
              <span className="text-xs text-gray-500 w-12 text-right">{seg.percentage.toFixed(1)}%</span>
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
