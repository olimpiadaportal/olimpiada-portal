'use client';

import { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import type { ActivityEvent } from '@/types';
import { timeAgo } from '@/lib/utils';

const EVENT_ICONS = {
  registration: '👤',
  score_change: '📊',
  admin_action: '⚙️',
  exam_completed: '📝',
};

const EVENT_COLORS = {
  registration: 'bg-green-100 text-green-800',
  score_change: 'bg-blue-100 text-blue-800',
  admin_action: 'bg-purple-100 text-purple-800',
  exam_completed: 'bg-yellow-100 text-yellow-800',
};

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadEvents, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadEvents() {
    const response = await dashboardService.getRecentActivity(10);
    if (response.success && response.data) {
      setEvents(response.data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={index} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl ${EVENT_COLORS[event.event_type as keyof typeof EVENT_COLORS]}`}>
            {EVENT_ICONS[event.event_type as keyof typeof EVENT_ICONS]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {getEventDescription(event)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {timeAgo(event.event_timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function getEventDescription(event: ActivityEvent): string {
  switch (event.event_type) {
    case 'registration':
      return `${event.user_name} joined as ${event.metadata.user_type}`;
    case 'score_change':
      const change = event.metadata.elo_change;
      const sign = change > 0 ? '+' : '';
      return `${event.user_name} ${sign}${change} ELO (now ${event.metadata.new_elo})`;
    case 'admin_action':
      return `${event.user_name} performed ${event.metadata.action}`;
    case 'exam_completed':
      return `${event.user_name} completed an exam`;
    default:
      return `${event.user_name} - ${event.event_type}`;
  }
}
