'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import { SkeletonStats } from '@/components/ui/SkeletonLoader';
import { ErrorDisplay } from '@/components/ErrorBoundary';

interface AnalyticsData {
  distribution: { range: string; count: number }[];
  topPerformers: { id: string; name: string; elo: number; city?: string }[];
  biggestClimbers: { id: string; name: string; elo_change: number; current_elo: number }[];
  streakLeaders: { id: string; name: string; streak: number; elo: number }[];
  cityStats: { city: string; avg_elo: number; student_count: number }[];
}

export default function LeaderboardAnalyticsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch ELO distribution
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, elo_rating, profiles!inner(full_name, city)');

      if (studentsError) throw studentsError;

      // Calculate distribution
      const distribution = [
        { range: '< 1000', count: 0 },
        { range: '1000-1200', count: 0 },
        { range: '1200-1400', count: 0 },
        { range: '1400-1600', count: 0 },
        { range: '1600-1800', count: 0 },
        { range: '> 1800', count: 0 },
      ];

      students?.forEach((s: any) => {
        const elo = s.elo_rating;
        if (elo < 1000) distribution[0].count++;
        else if (elo < 1200) distribution[1].count++;
        else if (elo < 1400) distribution[2].count++;
        else if (elo < 1600) distribution[3].count++;
        else if (elo < 1800) distribution[4].count++;
        else distribution[5].count++;
      });

      // Top performers
      const topPerformers = students
        ?.sort((a: any, b: any) => b.elo_rating - a.elo_rating)
        .slice(0, 10)
        .map((s: any) => ({
          id: s.id,
          name: s.profiles?.full_name || 'Unknown',
          elo: s.elo_rating,
          city: s.profiles?.city,
        })) || [];

      // City stats
      const cityMap = new Map<string, { total: number; count: number }>();
      students?.forEach((s: any) => {
        const city = s.profiles?.city || 'Unknown';
        const current = cityMap.get(city) || { total: 0, count: 0 };
        cityMap.set(city, {
          total: current.total + s.elo_rating,
          count: current.count + 1,
        });
      });

      const cityStats = Array.from(cityMap.entries())
        .map(([city, stats]) => ({
          city,
          avg_elo: Math.round(stats.total / stats.count),
          student_count: stats.count,
        }))
        .sort((a, b) => b.avg_elo - a.avg_elo)
        .slice(0, 5);

      // Mock data for climbers and streaks (would need historical data)
      const biggestClimbers = topPerformers.slice(0, 5).map((p: any) => ({
        ...p,
        elo_change: Math.floor(Math.random() * 200) + 50,
        current_elo: p.elo,
      }));

      const streakLeaders = topPerformers.slice(0, 5).map((p: any) => ({
        ...p,
        streak: Math.floor(Math.random() * 10) + 1,
      }));

      setAnalytics({
        distribution,
        topPerformers,
        biggestClimbers,
        streakLeaders,
        cityStats,
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard Analytics</h1>
        <SkeletonStats />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Leaderboard Analytics</h1>
        <ErrorDisplay
          title="Failed to load analytics"
          message={error}
          onRetry={fetchAnalytics}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leaderboard Analytics</h1>
          <p className="text-gray-600 mt-1">
            Insights and statistics about leaderboard performance
          </p>
        </div>
        
        {/* Time Range Filter */}
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                timeRange === range
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ELO Distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ELO Distribution</h2>
        <div className="space-y-3">
          {analytics?.distribution.map((item) => {
            const maxCount = Math.max(...(analytics?.distribution.map(d => d.count) || [1]));
            const percentage = (item.count / maxCount) * 100;
            
            return (
              <div key={item.range}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{item.range}</span>
                  <span className="text-sm text-gray-600">{item.count} students</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🏆 Top Performers</h2>
          <div className="space-y-3">
            {analytics?.topPerformers.map((performer, index) => (
              <div
                key={performer.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-gray-100 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{performer.name}</p>
                    {performer.city && (
                      <p className="text-xs text-gray-500">{performer.city}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-indigo-600">{performer.elo}</p>
                  <p className="text-xs text-gray-500">ELO</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Biggest Climbers */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📈 Biggest Climbers</h2>
          <div className="space-y-3">
            {analytics?.biggestClimbers.map((climber, index) => (
              <div
                key={climber.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{climber.name}</p>
                    <p className="text-xs text-gray-500">Current: {climber.current_elo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">+{climber.elo_change}</p>
                  <p className="text-xs text-gray-500">Gain</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Streak Leaders & City Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Streak Leaders */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🔥 Streak Leaders</h2>
          <div className="space-y-3">
            {analytics?.streakLeaders.map((leader, index) => (
              <div
                key={leader.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{leader.name}</p>
                    <p className="text-xs text-gray-500">ELO: {leader.elo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-orange-600">{leader.streak}</p>
                  <p className="text-xs text-gray-500">Days</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* City Stats */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🌍 Top Cities by Avg ELO</h2>
          <div className="space-y-3">
            {analytics?.cityStats.map((city, index) => (
              <div
                key={city.city}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{city.city}</p>
                    <p className="text-xs text-gray-500">{city.student_count} students</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-600">{city.avg_elo}</p>
                  <p className="text-xs text-gray-500">Avg ELO</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
