import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { reviewService } from '../../services/reviewService';
import { teacherService } from '../../services/teacherService';
import { ReviewWithStudent } from '../../types/teacher';
import { colors as staticColors, typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { EmptyState } from '../../components/EmptyState';

type TeacherReviewsScreenNavigationProp = StackNavigationProp<any, 'TeacherReviews'>;

interface Props {
  navigation: TeacherReviewsScreenNavigationProp;
}

interface RatingDistribution {
  rating: number;
  count: number;
}

type SortOption = 'recent' | 'oldest' | 'highest' | 'lowest';
type RatingFilter = 'all' | 1 | 2 | 3 | 4 | 5;

const REVIEWS_PER_PAGE = 10;

export const TeacherReviewsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [allReviews, setAllReviews] = useState<ReviewWithStudent[]>([]);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter and pagination state
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [displayCount, setDisplayCount] = useState(REVIEWS_PER_PAGE);
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadReviews();
    }
  }, [user?.id]);

  // Reset display count when filter changes
  useEffect(() => {
    setDisplayCount(REVIEWS_PER_PAGE);
  }, [ratingFilter, sortOption]);

  const loadReviews = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Get teacher record ID from user ID
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id, rating, total_reviews')
        .eq('user_id', user.id)
        .single();

      if (teacherError || !teacher) {
        console.error('Teacher record not found:', teacherError);
        return;
      }

      const [reviewsData, distributionData] = await Promise.all([
        reviewService.getTeacherReviews(teacher.id),
        reviewService.getRatingDistribution(teacher.id),
      ]);

      setAllReviews(reviewsData);
      setRatingDistribution(distributionData);
      setAverageRating(teacher.rating || 0);
      setTotalReviews(teacher.total_reviews || 0);
    } catch (error) {
      console.error('Load reviews error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort reviews
  const filteredAndSortedReviews = useMemo(() => {
    let filtered = [...allReviews];
    
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
    
    return filtered;
  }, [allReviews, ratingFilter, sortOption]);

  // Get reviews to display (with pagination)
  const displayedReviews = useMemo(() => {
    return filteredAndSortedReviews.slice(0, displayCount);
  }, [filteredAndSortedReviews, displayCount]);

  const hasMoreReviews = displayCount < filteredAndSortedReviews.length;

  const loadMoreReviews = () => {
    setDisplayCount(prev => prev + REVIEWS_PER_PAGE);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setDisplayCount(REVIEWS_PER_PAGE);
    await loadReviews();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getMaxDistributionCount = () => {
    return Math.max(...ratingDistribution.map(d => d.count), 1);
  };

  const getSortLabel = (option: SortOption): string => {
    switch (option) {
      case 'recent': return t('teacherReviews.sortRecent');
      case 'oldest': return t('teacherReviews.sortOldest');
      case 'highest': return t('teacherReviews.sortHighest');
      case 'lowest': return t('teacherReviews.sortLowest');
    }
  };

  const renderStars = (rating: number, size: number = 16) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map(star => (
          <Ionicons
            key={star}
            name={star <= rating ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-outline'}
            size={size}
            color="#F59E0B"
          />
        ))}
      </View>
    );
  };

  const renderRatingFilters = () => {
    const filters: RatingFilter[] = ['all', 5, 4, 3, 2, 1];
    
    return (
      <View style={styles.filtersCard}>
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>{t('teacherReviews.filterByRating')}</Text>
          <TouchableOpacity 
            style={styles.sortButton}
            onPress={() => setShowSortMenu(!showSortMenu)}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.primary} />
            <Text style={styles.sortButtonText}>{getSortLabel(sortOption)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
        
        {showSortMenu && (
          <View style={styles.sortMenu}>
            {(['recent', 'oldest', 'highest', 'lowest'] as SortOption[]).map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.sortMenuItem, sortOption === option && styles.sortMenuItemActive]}
                onPress={() => {
                  setSortOption(option);
                  setShowSortMenu(false);
                }}
              >
                <Text style={[styles.sortMenuItemText, sortOption === option && styles.sortMenuItemTextActive]}>
                  {getSortLabel(option)}
                </Text>
                {sortOption === option && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContainer}
        >
          {filters.map(filter => {
            const isActive = ratingFilter === filter;
            const count = filter === 'all' 
              ? allReviews.length 
              : ratingDistribution.find(d => d.rating === filter)?.count || 0;
            
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setRatingFilter(filter)}
              >
                {filter !== 'all' && (
                  <Ionicons name="star" size={14} color={isActive ? '#FFFFFF' : '#F59E0B'} />
                )}
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter === 'all' ? t('teacherReviews.allRatings') : filter}
                </Text>
                <Text style={[styles.filterChipCount, isActive && styles.filterChipCountActive]}>
                  ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderRatingOverview = () => {
    const maxCount = getMaxDistributionCount();

    return (
      <View style={styles.overviewCard}>
        <View style={styles.overviewLeft}>
          <Text style={styles.averageRating}>{averageRating.toFixed(1)}</Text>
          {renderStars(averageRating, 20)}
          <Text style={styles.totalReviewsText}>
            {totalReviews} {t('teacherReviews.reviews')}
          </Text>
        </View>
        <View style={styles.overviewRight}>
          {[5, 4, 3, 2, 1].map(rating => {
            const distribution = ratingDistribution.find(d => d.rating === rating);
            const count = distribution?.count || 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

            return (
              <TouchableOpacity 
                key={rating} 
                style={styles.distributionRow}
                onPress={() => setRatingFilter(rating as RatingFilter)}
              >
                <Text style={styles.distributionRating}>{rating}</Text>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <View style={styles.distributionBarContainer}>
                  <View
                    style={[
                      styles.distributionBar,
                      { width: `${percentage}%` },
                    ]}
                  />
                </View>
                <Text style={styles.distributionCount}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderReviewItem = (review: ReviewWithStudent) => {
    return (
      <View key={review.id} style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={styles.reviewerInfo}>
            {review.student.avatar_url ? (
              <Image
                source={{ uri: review.student.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={20} color={colors.textSecondary} />
              </View>
            )}
            <View style={styles.reviewerDetails}>
              <Text style={styles.reviewerName}>{review.student.full_name}</Text>
              <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
            </View>
          </View>
          {renderStars(review.rating)}
        </View>
        {review.review_text && (
          <Text style={styles.reviewText}>{review.review_text}</Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.text}
            onPress={() => navigation.goBack()}
          />
          <Text style={styles.headerTitle}>{t('teacherReviews.title')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color={colors.text}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>{t('teacherReviews.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {renderRatingOverview()}
        
        {renderRatingFilters()}

        <View style={styles.reviewsSection}>
          <Text style={styles.sectionTitle}>
            {t('teacherReviews.allReviews')} ({filteredAndSortedReviews.length})
          </Text>

          {filteredAndSortedReviews.length === 0 ? (
            <EmptyState
              icon="chatbubble-outline"
              title={ratingFilter === 'all' ? t('teacherReviews.noReviewsTitle') : t('teacherReviews.noMatchingReviews')}
              description={ratingFilter === 'all' ? t('teacherReviews.noReviewsDescription') : t('teacherReviews.tryDifferentFilter')}
            />
          ) : (
            <>
              {displayedReviews.map((review: ReviewWithStudent) => renderReviewItem(review))}
              
              {hasMoreReviews && (
                <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreReviews}>
                  <Text style={styles.loadMoreText}>
                    {t('teacherReviews.loadMore')} ({filteredAndSortedReviews.length - displayCount} {t('teacherReviews.remaining')})
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              
              {!hasMoreReviews && displayedReviews.length > REVIEWS_PER_PAGE && (
                <Text style={styles.endOfReviewsText}>
                  {t('teacherReviews.showingAll', { count: displayedReviews.length })}
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  overviewCard: {
    backgroundColor: colors.card,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  overviewLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.lg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  averageRating: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.text,
  },
  starsContainer: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
  },
  totalReviewsText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  overviewRight: {
    flex: 1,
    paddingLeft: spacing.lg,
    justifyContent: 'center',
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  distributionRating: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    width: 12,
    textAlign: 'right',
    marginRight: 4,
  },
  distributionBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  distributionBar: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  distributionCount: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    width: 24,
    textAlign: 'right',
  },
  reviewsSection: {
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  reviewCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewerDetails: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  reviewerName: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  reviewDate: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  reviewText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  filtersCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  filterTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
  },
  sortButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '500',
    marginHorizontal: spacing.xs,
  },
  sortMenu: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sortMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  sortMenuItemActive: {
    backgroundColor: colors.primary + '10',
  },
  sortMenuItemText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  sortMenuItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  filterChipsContainer: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    marginLeft: 4,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipCount: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  filterChipCountActive: {
    color: '#FFFFFF',
    opacity: 0.8,
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  loadMoreText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  endOfReviewsText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
});

export default TeacherReviewsScreen;
