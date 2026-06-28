'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ProfileDrawer } from '@/components/shared/ProfileDrawer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Users, BookOpen, Clock, Star, ChevronRight, CheckCircle, TrendingUp, Wallet, FileText, HelpCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { teacherService } from '@/services/teacherService';
import { TeacherStats, BookingWithDetails } from '@/types/teacher';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getTranslatedSubjectName } from '@/lib/utils/subjectTranslation';
import { motion } from 'motion/react';

interface SessionsTrend {
  month: string;
  sessions: number;
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [userId, setUserId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState('Teacher');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [pendingRequests, setPendingRequests] = useState<BookingWithDetails[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<BookingWithDetails[]>([]);

  useEffect(() => {
    loadTeacherData();
  }, []);

  const loadTeacherData = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Get teacher profile name - profiles table uses 'id' not 'user_id'
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profile && (profile as any).full_name) {
        setTeacherName((profile as any).full_name.split(' ')[0]);
      }

      // Get teacher stats
      const teacherStats = await teacherService.getTeacherStats(user.id);
      if (teacherStats) {
        setStats(teacherStats);
      }

      // Get teacher bookings
      const fetchedBookings = await teacherService.getTeacherBookings(user.id);
      setBookings(fetchedBookings);
      const now = new Date();

      // Filter pending requests
      const pending = fetchedBookings.filter(b => b.status === 'pending').slice(0, 3);
      setPendingRequests(pending);

      // Filter upcoming sessions
      const upcoming = fetchedBookings.filter(b => {
        const bookingDate = new Date(b.scheduled_date);
        return b.status === 'confirmed' && bookingDate >= now;
      }).slice(0, 3);
      setUpcomingSessions(upcoming);
    } catch (error) {
      console.error('Error loading teacher data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Use useMemo to generate sessions trend data based on bookings and locale
  const sessionsTrend = useMemo(() => {
    // Define month names for each locale
    const monthNames = {
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      az: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'],
      ru: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
    };

    const months: SessionsTrend[] = [];
    const now = new Date();
    const currentLocale = (locale || 'en') as 'en' | 'az' | 'ru';
    const monthLabels = monthNames[currentLocale] || monthNames.en;

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthIndex = date.getMonth();
      const monthLabel = monthLabels[monthIndex];

      const sessionsInMonth = bookings.filter(b => {
        const bookingDate = new Date(b.scheduled_date);
        return b.status === 'completed' &&
          bookingDate.getFullYear() === date.getFullYear() &&
          bookingDate.getMonth() === date.getMonth();
      }).length;

      months.push({ month: monthLabel, sessions: sessionsInMonth });
    }

    return months;
  }, [bookings, locale]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <motion.div 
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('teacher.dashboard.welcome')}, {teacherName}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {t('teacher.dashboard.subtitle')}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter userId={userId} />
            <ProfileDrawer userType="teacher" />
          </div>
        </motion.div>

        {/* Quick Actions - Moved to top */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('teacher.dashboard.quickActions')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/bookings')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div 
                    className="p-4 bg-blue-600 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Calendar className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacher.dashboard.manageBookings')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.manageBookingsDesc')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/activity')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div 
                    className="p-4 bg-green-600 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TrendingUp className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacher.dashboard.viewActivity')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.viewActivityDesc')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/reviews')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div 
                    className="p-4 bg-yellow-500 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Star className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacher.dashboard.myReviews')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.myReviewsDesc')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/earnings')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div
                    className="p-4 bg-emerald-600 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Wallet className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacher.dashboard.earningsPayouts')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.earningsPayoutsDesc')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/questions')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div
                    className="p-4 bg-indigo-600 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <HelpCircle className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacherExams.questions.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacherExams.questions.empty')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card
                className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer h-full"
                onClick={() => router.push('/teacher/exams')}
              >
                <div className="flex items-start space-x-4">
                  <motion.div
                    className="p-4 bg-orange-500 rounded-lg"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <FileText className="h-8 w-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('teacherExams.exams.title')}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacherExams.exams.empty')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            whileHover={{ y: -4 }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.totalStudents')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.total_students || 0}</p>
                </div>
                <motion.div whileHover={{ scale: 1.1 }} transition={{ duration: 0.2 }}>
                  <Users className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                </motion.div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            whileHover={{ y: -4 }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.upcomingBookings')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.active_bookings || 0}</p>
                </div>
                <motion.div whileHover={{ scale: 1.1 }} transition={{ duration: 0.2 }}>
                  <Calendar className="h-10 w-10 text-green-600 dark:text-green-400" />
                </motion.div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            whileHover={{ y: -4 }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.totalSessions')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.completed_sessions || 0}</p>
                </div>
                <motion.div whileHover={{ scale: 1.1 }} transition={{ duration: 0.2 }}>
                  <BookOpen className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                </motion.div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            whileHover={{ y: -4 }}
          >
            <Card className="p-6 bg-white dark:bg-gray-800 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('teacher.dashboard.avgRating')}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.average_rating?.toFixed(1) || '0.0'}</p>
                </div>
                <motion.div whileHover={{ scale: 1.1 }} transition={{ duration: 0.2 }}>
                  <Star className="h-10 w-10 text-orange-600 dark:text-orange-400" />
                </motion.div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Reviews Summary */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-8 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/teacher/reviews')}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('teacher.dashboard.myReviews')}
            </h2>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-gray-900 dark:text-white">
              {stats?.average_rating?.toFixed(1) || '0.0'}
            </div>
            <div>
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= (stats?.average_rating || 0)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {stats?.total_reviews || 0} {t('teacher.dashboard.reviews')}
              </p>
            </div>
          </div>
        </Card>

        {/* Sessions Trend Chart - Using Recharts */}
        {sessionsTrend.length > 0 && locale && (
          <Card className="p-6 bg-white dark:bg-gray-800 mb-8" key={`chart-${locale}`}>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {t('teacher.dashboard.sessionsTrend')}
            </h2>
            <div className="w-full h-64" style={{ minHeight: '256px', width: '100%' }}>
              <ResponsiveContainer width="100%" height={256} key={`container-${locale}`}>
                <BarChart data={sessionsTrend} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} key={`barchart-${locale}`}>
                  <XAxis 
                    dataKey="month" 
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1F2937', 
                      border: 'none', 
                      borderRadius: '8px',
                      color: '#FFFFFF'
                    }}
                    labelStyle={{ color: '#FFFFFF' }}
                    itemStyle={{ color: '#FFFFFF' }}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    formatter={(value: number) => [value, t('teacher.dashboard.sessions')]}
                  />
                  <Bar dataKey="sessions" radius={[4, 4, 0, 0]}>
                    {sessionsTrend.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === sessionsTrend.length - 1 ? '#3B82F6' : '#93C5FD'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <Card className="p-6 bg-white dark:bg-gray-800 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('teacher.dashboard.pendingRequests')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/teacher/bookings')}>
                {t('teacher.dashboard.seeAll')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {pendingRequests.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => router.push('/teacher/bookings')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {booking.student.full_name}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getTranslatedSubjectName(booking.subject, locale)} • {formatDate(booking.scheduled_date)} {t('teacher.dashboard.at')} {booking.scheduled_time}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Upcoming Sessions */}
        {upcomingSessions.length > 0 && (
          <Card className="p-6 bg-white dark:bg-gray-800 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('teacher.dashboard.upcomingSessions')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => router.push('/teacher/bookings')}>
                {t('teacher.dashboard.seeAll')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {upcomingSessions.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                  onClick={() => router.push('/teacher/bookings')}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {booking.student.full_name}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getTranslatedSubjectName(booking.subject, locale)} • {formatDate(booking.scheduled_date)} {t('teacher.dashboard.at')} {booking.scheduled_time}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
