interface FeatureUsageChartProps {
  data: any;
}

export function FeatureUsageChart({ data }: FeatureUsageChartProps) {
  // Harmonized with mobile app's feature tracking
  // Tracks: practice mode, exam mode, competitive mode usage
  
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Usage</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          No feature usage data available
        </div>
      </div>
    );
  }

  const features = [
    {
      name: 'Practice Mode',
      icon: '📝',
      sessions: data.practiceMode?.totalSessions || 0,
      users: data.practiceMode?.uniqueUsers || 0,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      name: 'Exam Mode',
      icon: '📋',
      sessions: data.examMode?.totalAttempts || 0,
      users: data.examMode?.uniqueUsers || 0,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
    },
    {
      name: 'Competitive Mode',
      icon: '🏆',
      sessions: data.competitiveMode?.totalMatches || 0,
      users: data.competitiveMode?.uniquePlayers || 0,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
  ];

  const maxSessions = Math.max(...features.map(f => f.sessions));
  const totalSessions = features.reduce((sum, f) => sum + f.sessions, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Usage</h3>
      
      <div className="space-y-4">
        {features.map((feature, index) => {
          const percentage = maxSessions > 0 ? (feature.sessions / maxSessions) * 100 : 0;
          const sharePercentage = totalSessions > 0 ? (feature.sessions / totalSessions) * 100 : 0;
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{feature.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{feature.name}</div>
                    <div className="text-xs text-gray-500">{feature.users} unique users</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-semibold ${feature.textColor}`}>
                    {feature.sessions.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">{sharePercentage.toFixed(1)}% share</div>
                </div>
              </div>
              
              <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`${feature.color} h-3 rounded-full transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-gray-900">{totalSessions.toLocaleString()}</div>
          <div className="text-xs text-gray-600">Total Sessions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {features.reduce((sum, f) => sum + f.users, 0).toLocaleString()}
          </div>
          <div className="text-xs text-gray-600">Total Users</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {totalSessions > 0 ? (totalSessions / features.reduce((sum, f) => sum + f.users, 0)).toFixed(1) : 0}
          </div>
          <div className="text-xs text-gray-600">Avg Sessions/User</div>
        </div>
      </div>

      {/* Most Popular Feature */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <div className="text-sm text-gray-600">Most Popular Feature</div>
        <div className="text-lg font-semibold text-blue-600 flex items-center gap-2 mt-1">
          <span className="text-2xl">{features[0].icon}</span>
          {features[0].name}
        </div>
      </div>
    </div>
  );
}
