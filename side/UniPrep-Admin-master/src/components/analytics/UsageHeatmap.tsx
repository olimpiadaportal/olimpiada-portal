interface UsageHeatmapProps {
  data: any;
}

export function UsageHeatmap({ data }: UsageHeatmapProps) {
  // Harmonized with mobile app's usage tracking
  // Shows hourly usage patterns by day of week
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Patterns</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No usage pattern data available
        </div>
      </div>
    );
  }

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Create a map of activity by day and hour
  const activityMap = new Map<string, number>();
  let maxActivity = 0;

  data.forEach((item: any) => {
    const key = `${item.dayOfWeek}-${item.hour}`;
    activityMap.set(key, item.activityCount);
    if (item.activityCount > maxActivity) {
      maxActivity = item.activityCount;
    }
  });

  const getActivityColor = (count: number) => {
    if (count === 0) return 'bg-gray-100';
    const intensity = (count / maxActivity) * 100;
    if (intensity > 75) return 'bg-blue-600';
    if (intensity > 50) return 'bg-blue-500';
    if (intensity > 25) return 'bg-blue-400';
    return 'bg-blue-300';
  };

  // Find peak hour
  const peakActivity = Math.max(...Array.from(activityMap.values()));
  const peakEntry = Array.from(activityMap.entries()).find(([_, count]) => count === peakActivity);
  const peakHour = peakEntry ? parseInt(peakEntry[0].split('-')[1]) : 12;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Usage Patterns (Heatmap)</h3>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div>
            Peak hour: <span className="font-medium text-gray-900">{peakHour}:00</span>
          </div>
          <div className="text-xs">
            <span className="font-medium">Days:</span> Sunday - Saturday
          </div>
          <div className="text-xs">
            <span className="font-medium">Hours:</span> 0:00 - 23:00
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour labels */}
          <div className="flex mb-2">
            <div className="w-12"></div>
            {hours.filter(h => h % 3 === 0).map(hour => (
              <div key={hour} className="flex-1 text-xs text-gray-600 text-center" style={{ minWidth: '40px' }}>
                {hour}h
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          {daysOfWeek.map((day, dayIndex) => (
            <div key={dayIndex} className="flex items-center mb-1">
              <div className="w-12 text-xs text-gray-600 font-medium">{day}</div>
              <div className="flex gap-1 flex-1">
                {hours.map(hour => {
                  const key = `${dayIndex}-${hour}`;
                  const count = activityMap.get(key) || 0;
                  const color = getActivityColor(count);
                  
                  return (
                    <div
                      key={hour}
                      className={`h-8 rounded ${color} hover:ring-2 hover:ring-blue-500 transition-all cursor-pointer`}
                      style={{ minWidth: '12px', flex: 1 }}
                      title={`${day} ${hour}:00 - ${count} activities`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-600">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 bg-gray-100 rounded"></div>
          <div className="w-4 h-4 bg-blue-300 rounded"></div>
          <div className="w-4 h-4 bg-blue-400 rounded"></div>
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <div className="w-4 h-4 bg-blue-600 rounded"></div>
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
