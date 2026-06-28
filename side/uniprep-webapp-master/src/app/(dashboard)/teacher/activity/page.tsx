'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ProfileDrawer } from '@/components/shared/ProfileDrawer';
import { 
  ArrowLeft, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { teacherService } from '@/services/teacherService';
import { BookingWithDetails } from '@/types/teacher';
import { getTranslatedSubjectName } from '@/lib/utils/subjectTranslation';

interface ActivityItem {
  id: string;
  type: 'session_completed' | 'booking_accepted' | 'booking_declined' | 'new_request' | 'review_received';
  title: string;
  description: string;
  timestamp: Date;
  metadata?: {
    studentName?: string;
    subject?: string;
    rating?: number;
  };
}

type FilterType = 'all' | 'bookings' | 'reviews';

export default function TeacherActivityPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Get teacher ID first
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!teacher) {
        setLoading(false);
        return;
      }

      // Get teacher bookings to generate activity
      const bookings = await teacherService.getTeacherBookings(user.id);
      
      // Get teacher reviews
      const { data: reviews } = await supabase
        .from('teacher_reviews')
        .select('id, rating, review_text, created_at')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });

      // Convert bookings to activity items
      const activityItems: ActivityItem[] = [];

      bookings.forEach((booking: BookingWithDetails) => {
        if (booking.status === 'completed') {
          activityItems.push({
            id: `completed-${booking.id}`,
            type: 'session_completed',
            title: t('teacher.activity.sessionCompleted'),
            description: `${booking.student.full_name} - ${getTranslatedSubjectName(booking.subject, locale)}`,
            timestamp: new Date(booking.completed_at || booking.updated_at),
            metadata: {
              studentName: booking.student.full_name,
              subject: booking.subject_name,
            },
          });
        } else if (booking.status === 'confirmed') {
          activityItems.push({
            id: `accepted-${booking.id}`,
            type: 'booking_accepted',
            title: t('teacher.activity.bookingAccepted'),
            description: `${booking.student.full_name} - ${getTranslatedSubjectName(booking.subject, locale)}`,
            timestamp: new Date(booking.updated_at),
            metadata: {
              studentName: booking.student.full_name,
              subject: getTranslatedSubjectName(booking.subject, locale),
            },
          });
        } else if (booking.status === 'cancelled') {
          activityItems.push({
            id: `declined-${booking.id}`,
            type: 'booking_declined',
            title: t('teacher.activity.bookingDeclined'),
            description: `${booking.student.full_name} - ${getTranslatedSubjectName(booking.subject, locale)}`,
            timestamp: new Date(booking.cancelled_at || booking.updated_at),
            metadata: {
              studentName: booking.student.full_name,
              subject: getTranslatedSubjectName(booking.subject, locale),
            },
          });
        } else if (booking.status === 'pending') {
          activityItems.push({
            id: `request-${booking.id}`,
            type: 'new_request',
            title: t('teacher.activity.newBookingRequest'),
            description: `${booking.student.full_name} - ${getTranslatedSubjectName(booking.subject, locale)}`,
            timestamp: new Date(booking.created_at),
            metadata: {
              studentName: booking.student.full_name,
              subject: getTranslatedSubjectName(booking.subject, locale),
            },
          });
        }
      });

      // Add reviews to activity
      if (reviews) {
        reviews.forEach((review: any) => {
          activityItems.push({
            id: `review-${review.id}`,
            type: 'review_received',
            title: t('teacher.activity.reviewReceived'),
            description: review.review_text ? `"${review.review_text.substring(0, 50)}${review.review_text.length > 50 ? '...' : ''}"` : `${review.rating} ⭐`,
            timestamp: new Date(review.created_at),
            metadata: {
              rating: review.rating,
            },
          });
        });
      }

      // Sort by timestamp descending
      activityItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setActivities(activityItems);
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return t('teacher.activity.today');
    } else if (days === 1) {
      return t('teacher.activity.yesterday');
    } else if (days < 7) {
      return t('teacher.activity.thisWeek');
    } else if (days < 30) {
      return t('teacher.activity.thisMonth');
    } else {
      return t('teacher.activity.older');
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'session_completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'booking_accepted':
        return <Calendar className="h-5 w-5 text-blue-600" />;
      case 'booking_declined':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'new_request':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'review_received':
        return <Star className="h-5 w-5 text-orange-600" />;
      default:
        return <MessageSquare className="h-5 w-5 text-gray-600" />;
    }
  };

  const getActivityBgColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'session_completed':
        return 'bg-green-100 dark:bg-green-900/20';
      case 'booking_accepted':
        return 'bg-blue-100 dark:bg-blue-900/20';
      case 'booking_declined':
        return 'bg-red-100 dark:bg-red-900/20';
      case 'new_request':
        return 'bg-yellow-100 dark:bg-yellow-900/20';
      case 'review_received':
        return 'bg-orange-100 dark:bg-orange-900/20';
      default:
        return 'bg-gray-100 dark:bg-gray-800';
    }
  };

  // Filter activities based on selected filter
  const getFilteredActivities = () => {
    if (filter === 'all') return activities;
    if (filter === 'bookings') {
      return activities.filter(a => 
        a.type === 'session_completed' || 
        a.type === 'booking_accepted' || 
        a.type === 'booking_declined' || 
        a.type === 'new_request'
      );
    }
    if (filter === 'reviews') {
      return activities.filter(a => a.type === 'review_received');
    }
    return activities;
  };

  const filteredActivities = getFilteredActivities();

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
    const dateKey = formatDate(activity.timestamp);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(activity);
    return groups;
  }, {} as Record<string, ActivityItem[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="text-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('teacher.activity.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                {t('teacher.activity.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter userId={userId} />
            <ProfileDrawer userType="teacher" />
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('teacher.activity.filters.all') || 'All'}
          </button>
          <button
            onClick={() => setFilter('bookings')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === 'bookings'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('teacher.activity.filters.bookings') || 'Bookings'}
          </button>
          <button
            onClick={() => setFilter('reviews')}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === 'reviews'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t('teacher.activity.filters.reviews') || 'Reviews'}
          </button>
        </div>

        {/* Activity List */}
        {filteredActivities.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teacher.activity.noActivity')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('teacher.activity.noActivityDesc')}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([dateGroup, items]) => (
              <div key={dateGroup}>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase">
                  {dateGroup}
                </h2>
                <Card className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((activity) => (
                    <div
                      key={activity.id}
                      className="p-4 flex items-start gap-4"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getActivityBgColor(activity.type)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {activity.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {activity.description}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatTime(activity.timestamp)}
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
