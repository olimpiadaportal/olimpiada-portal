'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Star,
  Filter,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { teacherService } from '@/services/teacherService';
import { ReviewWithStudent, TeacherStats } from '@/types/teacher';

type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest';
type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;

export default function TeacherReviewsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewWithStudent[]>([]);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [displayCount, setDisplayCount] = useState(10);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      // Get teacher ID first
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!teacher) {
        console.error('Teacher not found');
        return;
      }

      // Get reviews and stats
      const [reviewsData, statsData] = await Promise.all([
        teacherService.getTeacherReviews(teacher.id),
        teacherService.getTeacherStats(user.id),
      ]);

      setReviews(reviewsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'az' ? 'az-AZ' : locale === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFilteredAndSortedReviews = () => {
    let filtered = [...reviews];

    // Apply rating filter
    if (ratingFilter !== 'all') {
      filtered = filtered.filter(r => r.rating === ratingFilter);
    }

    // Apply sorting
    switch (sortOption) {
      case 'recent':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'highest':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        filtered.sort((a, b) => a.rating - b.rating);
        break;
    }

    return filtered.slice(0, displayCount);
  };

  const getRatingDistribution = () => {
    const distribution = [0, 0, 0, 0, 0]; // 1-5 stars
    reviews.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating - 1]++;
      }
    });
    return distribution;
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? 'text-yellow-500 fill-yellow-500'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-800 rounded mb-8 animate-pulse"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded mb-4 animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const filteredReviews = getFilteredAndSortedReviews();
  const ratingDistribution = getRatingDistribution();
  const totalFilteredReviews = ratingFilter === 'all' 
    ? reviews.length 
    : reviews.filter(r => r.rating === ratingFilter).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-600 dark:text-gray-400"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('teacher.reviews.title')}
          </h1>
        </div>

        {/* Rating Overview */}
        <Card className="p-6 bg-white dark:bg-gray-800 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Average Rating */}
            <div className="text-center md:text-left">
              <div className="text-5xl font-bold text-gray-900 dark:text-white mb-2">
                {stats?.average_rating?.toFixed(1) || '0.0'}
              </div>
              <div className="flex items-center justify-center md:justify-start mb-2">
                {renderStars(Math.round(stats?.average_rating || 0))}
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                {stats?.total_reviews || 0} {t('teacher.reviews.totalReviews')}
              </p>
            </div>

            {/* Rating Distribution */}
            <div className="flex-1 max-w-md">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {t('teacher.reviews.ratingDistribution')}
              </h3>
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = ratingDistribution[rating - 1];
                const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                
                return (
                  <div key={rating} className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">
                      {rating} <Star className="h-3 w-3 inline text-yellow-500" />
                    </span>
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-8">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {t('teacher.reviews.sortBy')}: {t(`teacher.reviews.sortOptions.${sortOption}`)}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortOption('recent')}>
                {t('teacher.reviews.sortOptions.recent')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption('oldest')}>
                {t('teacher.reviews.sortOptions.oldest')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption('highest')}>
                {t('teacher.reviews.sortOptions.highest')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortOption('lowest')}>
                {t('teacher.reviews.sortOptions.lowest')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Rating Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {t('teacher.reviews.filterByRating')}:
            </span>
            <div className="flex gap-1">
              <Badge
                className={`cursor-pointer ${
                  ratingFilter === 'all'
                    ? 'bg-blue-900 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
                onClick={() => setRatingFilter('all')}
              >
                {t('teacher.reviews.allRatings')}
              </Badge>
              {[5, 4, 3, 2, 1].map((rating) => (
                <Badge
                  key={rating}
                  className={`cursor-pointer ${
                    ratingFilter === rating
                      ? 'bg-blue-900 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => setRatingFilter(rating as RatingFilter)}
                >
                  {rating} <Star className="h-3 w-3 ml-1 inline" />
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Reviews List */}
        {reviews.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <Star className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {t('teacher.reviews.noReviews')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {t('teacher.reviews.noReviewsDesc')}
            </p>
          </Card>
        ) : filteredReviews.length === 0 ? (
          <Card className="p-8 text-center bg-white dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              No reviews match the selected filter.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredReviews.map((review) => (
              <Card key={review.id} className="p-4 bg-white dark:bg-gray-800">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {review.student.avatar_url ? (
                      <img
                        src={review.student.avatar_url}
                        alt={review.student.full_name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-lg font-bold text-gray-600 dark:text-gray-400">
                          {review.student.full_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        {review.student.full_name || t('teacher.reviews.anonymous')}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                  </div>
                  {renderStars(review.rating)}
                </div>
                {review.review_text && (
                  <p className="text-gray-700 dark:text-gray-300">
                    {review.review_text}
                  </p>
                )}
              </Card>
            ))}

            {/* Load More */}
            {totalFilteredReviews > displayCount && (
              <div className="text-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDisplayCount(prev => prev + 10)}
                >
                  {t('teacher.reviews.loadMore')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
