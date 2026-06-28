interface DatabaseStatsCardProps {
  stats: any;
}

export function DatabaseStatsCard({ stats }: DatabaseStatsCardProps) {
  // Harmonized with mobile app's data structure
  // Shows database size, record counts, and growth
  
  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Statistics</h3>
        <div className="h-32 flex items-center justify-center text-gray-500">
          No database statistics available
        </div>
      </div>
    );
  }

  const tables = stats.tables || {};
  const growth = stats.growth || {};

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Statistics</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Database Size</div>
          <div className="text-2xl font-bold text-blue-600">{stats.databaseSize || 'N/A'}</div>
        </div>
        
        <div className="p-4 bg-green-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Students</div>
          <div className="text-2xl font-bold text-green-600">{tables.students?.toLocaleString() || 0}</div>
          {growth.studentsThisMonth > 0 && (
            <div className="text-xs text-green-700 mt-1">+{growth.studentsThisMonth} this month</div>
          )}
        </div>
        
        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Questions</div>
          <div className="text-2xl font-bold text-purple-600">{tables.questions?.toLocaleString() || 0}</div>
        </div>
        
        <div className="p-4 bg-orange-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-1">Total Exams</div>
          <div className="text-2xl font-bold text-orange-600">{tables.exams?.toLocaleString() || 0}</div>
        </div>
      </div>

      {/* Table Details */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Table Records</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-lg font-semibold text-gray-900">{tables.students?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">Students</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-lg font-semibold text-gray-900">{tables.questions?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">Questions</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-lg font-semibold text-gray-900">{tables.exams?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">Exams</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-lg font-semibold text-gray-900">{tables.sessions?.toLocaleString() || 0}</div>
            <div className="text-xs text-gray-600">Sessions</div>
          </div>
        </div>
      </div>

      {/* Growth This Month */}
      {(growth.studentsThisMonth > 0 || growth.sessionsThisMonth > 0) && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Growth This Month</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <div>
                <div className="text-lg font-semibold text-gray-900">+{growth.studentsThisMonth}</div>
                <div className="text-xs text-gray-600">New Students</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <div>
                <div className="text-lg font-semibold text-gray-900">+{growth.sessionsThisMonth}</div>
                <div className="text-xs text-gray-600">New Sessions</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
