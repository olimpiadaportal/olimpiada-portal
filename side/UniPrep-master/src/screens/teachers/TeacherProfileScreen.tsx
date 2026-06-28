import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { teacherService } from '../../services/teacherService';
import { translateSubject } from '../../utils/subjectTranslation';
import { formatShortDate } from '../../utils/dateFormatting';
import { reviewService } from '../../services/reviewService';
import { bookingService } from '../../services/bookingService';
import { shareService } from '../../services/shareService';
import { referenceDataService, City } from '../../services/referenceDataService';
import { messagingService, MessagingEligibility } from '../../services/messagingService';
import {
  teacherSubscriptionService,
  TeacherSubscription,
} from '../../services/teacherSubscriptionService';
import { TeacherWithDetails, ReviewWithStudent } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { TeacherProfileSkeleton } from '../../components/skeletons/TeacherProfileSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { ScaleButton } from '../../components/animated/ScaleButton';
import { FadeIn, Stagger } from '../../components/animated';
import { useAlert } from '../../components/AlertProvider';
import { useStripeContext } from '../../contexts/StripeContext';

type TeacherProfileScreenNavigationProp = StackNavigationProp<any, 'TeacherProfile'>;
type TeacherProfileScreenRouteProp = RouteProp<{ params: { teacherId: string } }, 'params'>;

interface Props {
  navigation: TeacherProfileScreenNavigationProp;
  route: TeacherProfileScreenRouteProp;
}

export const TeacherProfileScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { teacherId } = route.params;
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError, showConfirm, showInfo } = useAlert();
  const { initializePaymentSheet, presentPaymentSheet, isStripeReady } = useStripeContext();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [teacher, setTeacher] = useState<TeacherWithDetails | null>(null);
  const [reviews, setReviews] = useState<ReviewWithStudent[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [messagingEligibility, setMessagingEligibility] = useState<MessagingEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscription, setSubscription] = useState<TeacherSubscription | null>(null);
  const [subscriptionCurrency, setSubscriptionCurrency] = useState('AZN');
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
  const subscriptionActionRef = useRef(false);
  
  // Filter and pagination state for reviews
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'highest' | 'lowest'>('recent');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [displayCount, setDisplayCount] = useState(5);
  const REVIEWS_PER_PAGE = 5;

  useEffect(() => {
    loadTeacherData();
    loadCities();
    checkMessagingEligibility();
    loadSubscription();
  }, [teacherId]);

  const checkMessagingEligibility = async () => {
    if (!user?.id || user.user_type !== 'student') {
      setEligibilityLoading(false);
      return;
    }
    
    try {
      // Get student ID
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!studentData) {
        setEligibilityLoading(false);
        return;
      }
      
      const eligibility = await messagingService.checkMessagingEligibility(
        studentData.id,
        teacherId
      );
      setMessagingEligibility(eligibility);
    } catch (error) {
      console.error('Error checking messaging eligibility:', error);
    } finally {
      setEligibilityLoading(false);
    }
  };

  // Refresh quietly on focus after the first load, so returning from booking or review
  // updates eligibility/reviews without replaying the full-page skeleton.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (teacher) {
        void loadTeacherData(true);
        void checkMessagingEligibility();
        void loadSubscription();
      }
    });

    return unsubscribe;
  }, [navigation, teacher?.id]);

  const loadSubscription = async () => {
    if (!user?.id || user.user_type !== 'student') {
      setSubscriptionEnabled(false);
      setSubscription(null);
      setSubscriptionLoading(false);
      return;
    }

    try {
      setSubscriptionLoading(true);
      const [config, current] = await Promise.all([
        teacherSubscriptionService.getPublicConfig(),
        teacherSubscriptionService.getForTeacher(teacherId),
      ]);
      let resolvedSubscription = current;
      if (
        isStripeReady &&
        current &&
        (
          ['incomplete', 'past_due', 'unpaid'].includes(current.status)
          || (['active', 'trialing'].includes(current.status) && !current.current_period_end)
        )
      ) {
        try {
          resolvedSubscription = await teacherSubscriptionService.reconcile(teacherId);
        } catch (reconcileError) {
          console.error('Reconcile teacher subscription state error:', reconcileError);
        }
      }
      setSubscriptionEnabled(config.subscriptionsEnabled);
      setSubscription(resolvedSubscription);
      setSubscriptionCurrency(resolvedSubscription?.currency?.toUpperCase() || config.currency);
    } catch (error) {
      console.error('Load teacher subscription error:', error);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (subscriptionActionRef.current || !teacher) return;
    subscriptionActionRef.current = true;
    setSubscriptionActionLoading(true);

    try {
      if (!isStripeReady) {
        showInfo(
          t('teachers.profile.subscription.paymentUnavailableTitle'),
          t('teachers.profile.subscription.paymentUnavailableMessage')
        );
        return;
      }

      const result = await teacherSubscriptionService.create(teacher.id);
      setSubscription(result.subscription);

      if (['active', 'trialing'].includes(result.subscription.status)) {
        showSuccess(
          t('common.success'),
          t('teachers.profile.subscription.alreadyActive')
        );
        return;
      }

      if (!result.clientSecret) {
        showInfo(
          t('teachers.profile.subscription.pendingTitle'),
          t('teachers.profile.subscription.pendingMessage')
        );
        return;
      }

      const { error: initError } = await initializePaymentSheet({
        clientSecret: result.clientSecret,
        merchantDisplayName: 'Elmly',
      });
      if (initError) {
        showError(t('common.error'), initError);
        return;
      }

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        showError(t('common.error'), paymentResult.error);
        return;
      }

      if (paymentResult.success) {
        showSuccess(
          t('teachers.profile.subscription.paymentSubmittedTitle'),
          t('teachers.profile.subscription.paymentSubmittedMessage')
        );

        await new Promise(resolve => setTimeout(resolve, 500));
        let reconciled: TeacherSubscription | null = null;
        try {
          reconciled = await teacherSubscriptionService.reconcile(teacher.id);
          setSubscription(reconciled);
        } catch (reconcileError) {
          console.error('Post-payment teacher subscription reconciliation error:', reconcileError);
        }

        if (!reconciled || !['active', 'trialing'].includes(reconciled.status)) {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 900));
            const refreshed = await teacherSubscriptionService.getForTeacher(teacher.id);
            if (refreshed) {
              setSubscription(refreshed);
              if (['active', 'trialing'].includes(refreshed.status)) break;
            }
          }
        }
        await loadTeacherData(true);
      }
    } catch (error) {
      console.error('Teacher subscription error:', error);
      showError(
        t('common.error'),
        t('teachers.profile.subscription.createFailed')
      );
    } finally {
      subscriptionActionRef.current = false;
      setSubscriptionActionLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    if (!teacher || subscriptionActionRef.current) return;

    showConfirm(
      t('teachers.profile.subscription.cancelTitle'),
      t('teachers.profile.subscription.cancelMessage'),
      async () => {
        subscriptionActionRef.current = true;
        setSubscriptionActionLoading(true);
        try {
          const updated = await teacherSubscriptionService.cancelAtPeriodEnd(teacher.id);
          setSubscription(updated);
          showSuccess(
            t('common.success'),
            t('teachers.profile.subscription.cancelScheduled')
          );
        } catch (error) {
          console.error('Cancel teacher subscription error:', error);
          showError(
            t('common.error'),
            t('teachers.profile.subscription.cancelFailed')
          );
        } finally {
          subscriptionActionRef.current = false;
          setSubscriptionActionLoading(false);
        }
      }
    );
  };

  const handleResumeSubscription = async () => {
    if (!teacher || subscriptionActionRef.current) return;
    subscriptionActionRef.current = true;
    setSubscriptionActionLoading(true);
    try {
      const updated = await teacherSubscriptionService.resumeRenewal(teacher.id);
      setSubscription(updated);
      showSuccess(
        t('common.success'),
        t('teachers.profile.subscription.resumeSuccess')
      );
    } catch (error) {
      console.error('Resume teacher subscription error:', error);
      showError(
        t('common.error'),
        t('teachers.profile.subscription.resumeFailed')
      );
    } finally {
      subscriptionActionRef.current = false;
      setSubscriptionActionLoading(false);
    }
  };

  const loadCities = async () => {
    try {
      const citiesData = await referenceDataService.getCities();
      setCities(citiesData);
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadTeacherData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const [teacherData, reviewsData] = await Promise.all([
        teacherService.getTeacherById(teacherId, user?.id),
        reviewService.getTeacherReviews(teacherId),
      ]);

      // Calculate rating from reviews (like Reviews section does)
      if (teacherData && reviewsData.length > 0) {
        const totalRating = reviewsData.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalRating / reviewsData.length;
        const calculatedRating = Math.round(averageRating * 10) / 10;

        // Override teacher rating with calculated rating
        teacherData.rating = calculatedRating;
        teacherData.total_reviews = reviewsData.length;
      }

      setTeacher(teacherData);
      setReviews(reviewsData);
    } catch (error) {
      console.error('Load teacher data error:', error);
      showError(t('common.error'), t('teachers.profile.errorLoadingProfile'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Helper to get Azerbaijani city name for display
  const getCityDisplayName = (englishName: string): string => {
    const city = cities.find(c => c.name === englishName);
    return city?.name_az || englishName;
  };

  const handleToggleFavorite = async () => {
    if (!teacher || !user?.id) return;

    try {
      setFavoriteLoading(true);
      const isFavorited = await teacherService.toggleFavorite(user.id, teacher.id);
      setTeacher({ ...teacher, is_favorite: isFavorited });
      showSuccess(
        t('common.success'),
        isFavorited ? t('teachers.profile.addedToFavorites') : t('teachers.profile.removedFromFavorites')
      );
    } catch (error) {
      console.error('Toggle favorite error:', error);
      showError(t('common.error'), t('teachers.profile.failedToUpdateFavorites'));
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleBookSession = () => {
    if (!teacher) return;
    navigation.navigate('Booking', { teacher });
  };

  const handleMessage = async () => {
    if (!teacher || !user?.id) return;

    try {
      // Get student ID
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (studentError || !studentData) {
        showError(t('common.error'), t('teachers.profile.onlyStudentsCanMessage'));
        return;
      }

      // Check messaging eligibility
      const eligibility = messagingEligibility || await messagingService.checkMessagingEligibility(
        studentData.id,
        teacher.id
      );

      if (!eligibility.canMessage) {
        // Show appropriate message based on reason
        if (eligibility.reason === 'pending_booking') {
          showError(
            t('teachers.profile.messagingLocked'),
            t('teachers.profile.messagingPendingBooking')
          );
        } else {
          showError(
            t('teachers.profile.messagingLocked'),
            t('teachers.profile.messagingRequiresBooking')
          );
        }
        return;
      }

      // Get or create conversation (will be approved since we passed eligibility check)
      const { conversation, error } = await messagingService.getOrCreateConversation(
        studentData.id,
        teacher.id
      );

      if (error || !conversation) {
        showError('Error', 'Failed to start conversation');
        return;
      }

      // Navigate to chat
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        otherUser: {
          profiles: {
            full_name: teacher.full_name,
            avatar_url: teacher.avatar_url,
          },
        },
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      showError('Error', 'Failed to start conversation');
    }
  };

  const renderRatingStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : i - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={20}
          color="#F59E0B"
        />
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const renderReviewItem = (review: ReviewWithStudent) => (
    <View key={review.id} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Image
          source={
            review.student.avatar_url
              ? { uri: review.student.avatar_url }
              : require('../../../assets/defaultavatar.png')
          }
          style={styles.reviewAvatar}
        />
        <View style={styles.reviewHeaderInfo}>
          <Text style={styles.reviewerName}>{review.student.full_name}</Text>
          <View style={styles.reviewRatingRow}>
            {renderRatingStars(review.rating)}
            <Text style={styles.reviewDate}>
              {formatShortDate(review.created_at, t('common.locale'))}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.reviewText}>{review.review_text}</Text>
    </View>
  );

  // Filter and sort reviews
  const filteredAndSortedReviews = useMemo(() => {
    let result = [...reviews];
    
    // Apply rating filter
    if (ratingFilter !== null) {
      result = result.filter(review => review.rating === ratingFilter);
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'recent':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'highest':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        result.sort((a, b) => a.rating - b.rating);
        break;
    }
    
    return result;
  }, [reviews, ratingFilter, sortBy]);

  // Paginated reviews
  const displayedReviews = useMemo(() => {
    return filteredAndSortedReviews.slice(0, displayCount);
  }, [filteredAndSortedReviews, displayCount]);

  const hasMoreReviews = displayCount < filteredAndSortedReviews.length;
  const remainingReviews = filteredAndSortedReviews.length - displayCount;

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + REVIEWS_PER_PAGE);
  };

  const handleRatingFilter = (rating: number | null) => {
    setRatingFilter(rating);
    setDisplayCount(REVIEWS_PER_PAGE); // Reset pagination when filter changes
  };

  const handleSortChange = (sort: 'recent' | 'oldest' | 'highest' | 'lowest') => {
    setSortBy(sort);
    setShowSortMenu(false);
    setDisplayCount(REVIEWS_PER_PAGE); // Reset pagination when sort changes
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'recent': return t('teacherReviews.sortRecent');
      case 'oldest': return t('teacherReviews.sortOldest');
      case 'highest': return t('teacherReviews.sortHighest');
      case 'lowest': return t('teacherReviews.sortLowest');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <TeacherProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (!teacher) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon="person-outline"
          title="Teacher Not Found"
          description="This teacher profile could not be loaded. Please try again."
          actionLabel="Go Back"
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => shareService.shareTeacher(teacher.id, teacher.full_name)}
            accessibilityRole="button"
          >
            <Ionicons
              name="share-outline"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={handleToggleFavorite}
            disabled={favoriteLoading}
            accessibilityRole="button"
          >
            <Ionicons
              name={teacher.is_favorite ? 'heart' : 'heart-outline'}
              size={24}
              color={colors.secondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <FadeIn duration={400}>
        <View style={styles.profileHeader}>
          <Image
            source={
              teacher.avatar_url
                ? { uri: teacher.avatar_url }
                : require('../../../assets/defaultavatar.png')
            }
            style={styles.profileAvatar}
          />
          <View style={styles.nameContainer}>
            <Text style={styles.teacherName} numberOfLines={2}>{teacher.full_name}</Text>
            {teacher.is_verified && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>{getCityDisplayName(teacher.city)}</Text>
            {teacher.is_same_city && (
              <View style={styles.sameCityBadge}>
                <Text style={styles.sameCityText} numberOfLines={1}>{t('teachers.sameCity')}</Text>
              </View>
            )}
          </View>
        </View>
        </FadeIn>

        {/* Rating Section */}
        <FadeIn delay={200} duration={400}>
        <View style={styles.ratingSection}>
          <View style={styles.ratingBox}>
            <Text style={styles.ratingValue}>{teacher.rating.toFixed(1)}</Text>
            {renderRatingStars(Math.round(teacher.rating))}
            <Text style={styles.reviewsCount}>
              {t('teachers.profile.reviewsCount', { count: teacher.total_reviews })}
            </Text>
          </View>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{teacher.current_students ?? teacher.total_students ?? 0}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{t('teachers.profile.currentStudents')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{teacher.experience_years}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{t('teachers.profile.yearsExp')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{teacher.total_students}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{t('teachers.profile.totalStudents')}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{teacher.total_sessions}</Text>
              <Text style={styles.statLabel} numberOfLines={2}>{t('teachers.profile.sessions')}</Text>
            </View>
          </View>
        </View>
        </FadeIn>

        {/* Bio Section */}
        <Stagger delay={80} initialDelay={400} distance={16}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.profile.about')}</Text>
          <Text style={styles.bioText}>{teacher.bio || t('teachers.profile.noBioAvailable')}</Text>
        </View>

        {/* Specializations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.profile.specializations')}</Text>
          <View style={styles.specializationsContainer}>
            {teacher.specializations.map((subject, index) => (
              <View key={index} style={styles.specializationChip}>
                <Text style={styles.specializationText}>{translateSubject(subject, t)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Available Groups */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.profile.availableForGroups')}</Text>
          <View style={styles.groupsContainer}>
            {teacher.available_groups.map((group, index) => (
              <View key={index} style={styles.groupChip}>
                <Text style={styles.groupText}>{t('common.group')} {group}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Education */}
        {teacher.education && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('teachers.profile.education')}</Text>
            <Text style={styles.educationText}>{teacher.education}</Text>
          </View>
        )}

        {/* Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.profile.pricing')}</Text>
          <View style={styles.pricingContainer}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>{t('teachers.profile.hourlyRate')}</Text>
              <Text style={styles.priceValue}>{teacher.hourly_rate} AZN</Text>
            </View>
            {teacher.monthly_rate && (
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>{t('teachers.profile.monthlyRate')}</Text>
                <Text style={styles.priceValue}>{teacher.monthly_rate} AZN</Text>
              </View>
            )}
          </View>
        </View>

        {user?.user_type === 'student'
          && subscriptionEnabled
          && Boolean(teacher.monthly_rate)
          && (
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <View style={styles.subscriptionIcon}>
                  <Ionicons name="repeat-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.subscriptionHeaderText}>
                  <Text style={styles.subscriptionTitle}>
                    {t('teachers.profile.subscription.title')}
                  </Text>
                  <Text style={styles.subscriptionDescription}>
                    {t('teachers.profile.subscription.description', {
                      amount: teacher.monthly_rate,
                      currency: subscriptionCurrency,
                    })}
                  </Text>
                </View>
              </View>

              {subscriptionLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : subscription && !['cancelled', 'incomplete_expired'].includes(subscription.status) ? (
                <>
                  <View style={styles.subscriptionStatusRow}>
                    <Text style={styles.subscriptionStatusLabel}>
                      {t(`teachers.profile.subscription.status.${subscription.status}`)}
                    </Text>
                    {subscription.current_period_end ? (
                      <Text style={styles.subscriptionPeriodText}>
                        {subscription.cancel_at_period_end
                          ? t('teachers.profile.subscription.endsOn', {
                              date: formatShortDate(subscription.current_period_end, t('common.locale')),
                            })
                          : t('teachers.profile.subscription.renewsOn', {
                              date: formatShortDate(subscription.current_period_end, t('common.locale')),
                            })}
                      </Text>
                    ) : null}
                  </View>

                  {subscription.cancel_at_period_end ? (
                    <>
                      <View style={styles.subscriptionNotice}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                        <Text style={styles.subscriptionNoticeText}>
                          {t('teachers.profile.subscription.cancelPending')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.subscriptionPrimaryButton}
                        onPress={handleResumeSubscription}
                        disabled={subscriptionActionLoading}
                      >
                        {subscriptionActionLoading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.subscriptionPrimaryButtonText}>
                            {t('teachers.profile.subscription.resumeAction')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : ['active', 'trialing'].includes(subscription.status) ? (
                    <TouchableOpacity
                      style={styles.subscriptionSecondaryButton}
                      onPress={handleCancelSubscription}
                      disabled={subscriptionActionLoading}
                    >
                      <Text style={styles.subscriptionSecondaryButtonText}>
                        {t('teachers.profile.subscription.cancelAction')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {['incomplete', 'past_due', 'unpaid'].includes(subscription.status) ? (
                    <TouchableOpacity
                      style={styles.subscriptionPrimaryButton}
                      onPress={handleSubscribe}
                      disabled={subscriptionActionLoading}
                    >
                      {subscriptionActionLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.subscriptionPrimaryButtonText}>
                          {t('teachers.profile.subscription.completePayment')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <TouchableOpacity
                  style={styles.subscriptionPrimaryButton}
                  onPress={handleSubscribe}
                  disabled={subscriptionActionLoading}
                >
                  {subscriptionActionLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.subscriptionPrimaryButtonText}>
                      {t('teachers.profile.subscription.subscribeAction', {
                        amount: teacher.monthly_rate,
                        currency: subscriptionCurrency,
                      })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

        {/* Session Methods */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.profile.sessionMethods')}</Text>
          <View style={styles.methodsContainer}>
            <View style={styles.methodItem}>
              <Ionicons name="videocam" size={20} color={colors.primary} />
              <Text style={styles.methodText}>{t('teachers.profile.onlineSessions')}</Text>
            </View>
            {teacher.can_do_in_person && (
              <View style={styles.methodItem}>
                <Ionicons name="people" size={20} color={colors.primary} />
                <Text style={styles.methodText}>{t('teachers.profile.inPersonSessions')}</Text>
              </View>
            )}
          </View>
        </View>

        </Stagger>

        {/* Reviews */}
        <FadeIn delay={800} duration={400}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('teachers.profile.reviews')} ({reviews.length})
          </Text>
          
          {reviews.length > 0 && (
            <>
              {/* Rating Filter Chips */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.filterScrollView}
                contentContainerStyle={styles.filterContainer}
              >
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    ratingFilter === null && styles.filterChipActive
                  ]}
                  onPress={() => handleRatingFilter(null)}
                >
                  <Text style={[
                    styles.filterChipText,
                    ratingFilter === null && styles.filterChipTextActive
                  ]}>
                    {t('teacherReviews.allRatings')}
                  </Text>
                </TouchableOpacity>
                {[5, 4, 3, 2, 1].map(rating => (
                  <TouchableOpacity
                    key={rating}
                    style={[
                      styles.filterChip,
                      ratingFilter === rating && styles.filterChipActive
                    ]}
                    onPress={() => handleRatingFilter(rating)}
                  >
                    <Ionicons 
                      name="star" 
                      size={14} 
                      color={ratingFilter === rating ? colors.card : '#F59E0B'} 
                    />
                    <Text style={[
                      styles.filterChipText,
                      ratingFilter === rating && styles.filterChipTextActive
                    ]}>
                      {rating}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Sort Dropdown */}
              <View style={styles.sortContainer}>
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setShowSortMenu(!showSortMenu)}
                >
                  <Ionicons name="swap-vertical" size={16} color={colors.primary} />
                  <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
                  <Ionicons 
                    name={showSortMenu ? 'chevron-up' : 'chevron-down'} 
                    size={16} 
                    color={colors.textSecondary} 
                  />
                </TouchableOpacity>
                
                {showSortMenu && (
                  <View style={styles.sortMenu}>
                    {(['recent', 'oldest', 'highest', 'lowest'] as const).map(option => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.sortMenuItem,
                          sortBy === option && styles.sortMenuItemActive
                        ]}
                        onPress={() => handleSortChange(option)}
                      >
                        <Text style={[
                          styles.sortMenuItemText,
                          sortBy === option && styles.sortMenuItemTextActive
                        ]}>
                          {option === 'recent' && t('teacherReviews.sortRecent')}
                          {option === 'oldest' && t('teacherReviews.sortOldest')}
                          {option === 'highest' && t('teacherReviews.sortHighest')}
                          {option === 'lowest' && t('teacherReviews.sortLowest')}
                        </Text>
                        {sortBy === option && (
                          <Ionicons name="checkmark" size={16} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Reviews List */}
          {filteredAndSortedReviews.length > 0 ? (
            <>
              {displayedReviews.map(renderReviewItem)}
              
              {/* Load More / Status */}
              {hasMoreReviews ? (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={handleLoadMore}
                >
                  <Text style={styles.loadMoreText}>
                    {t('teacherReviews.loadMore')} ({remainingReviews} {t('teacherReviews.remaining')})
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.primary} />
                </TouchableOpacity>
              ) : displayedReviews.length > 0 && (
                <Text style={styles.showingAllText}>
                  {t('teacherReviews.showingAll', { count: filteredAndSortedReviews.length })}
                </Text>
              )}
            </>
          ) : reviews.length > 0 ? (
            <View style={styles.noMatchingContainer}>
              <Ionicons name="search-outline" size={40} color={colors.textSecondary} />
              <Text style={styles.noMatchingTitle}>{t('teacherReviews.noMatchingReviews')}</Text>
              <Text style={styles.noMatchingText}>{t('teacherReviews.tryDifferentFilter')}</Text>
            </View>
          ) : (
            <Text style={styles.noReviewsText}>{t('teachers.profile.noReviewsYet')}</Text>
          )}
        </View>
        </FadeIn>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        {/* Message button - show loading state while checking eligibility */}
        {eligibilityLoading ? (
          <View style={[styles.messageButton, styles.messageButtonLocked]}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        ) : messagingEligibility?.canMessage ? (
          <ScaleButton
            style={styles.messageButton}
            onPress={handleMessage}
            scaleValue={0.97}
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
            <Text style={styles.messageButtonText} numberOfLines={1}>
              {t('teachers.profile.message')}
            </Text>
          </ScaleButton>
        ) : messagingEligibility?.reason === 'pending_booking' ? (
          <ScaleButton
            style={[styles.messageButton, styles.messageButtonLocked]}
            onPress={handleMessage}
            scaleValue={0.97}
          >
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.messageButtonText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('teachers.profile.messagePending')}
            </Text>
          </ScaleButton>
        ) : (
          <ScaleButton
            style={[styles.messageButton, styles.messageButtonLocked]}
            onPress={handleMessage}
            scaleValue={0.97}
          >
            <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.messageButtonText, { color: colors.textSecondary }]} numberOfLines={1}>
              {t('teachers.profile.messageAfterBooking')}
            </Text>
          </ScaleButton>
        )}
        <ScaleButton
          style={styles.bookButton}
          onPress={handleBookSession}
          scaleValue={0.97}
        >
          <Ionicons name="calendar-outline" size={20} color="#FFFFFF" />
          <Text style={styles.bookButtonText} numberOfLines={1}>
            {t('teachers.profile.bookSession')}
          </Text>
        </ScaleButton>
      </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: typography.fontSizes.lg,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    color: colors.card,
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 72,
  },
  profileHeader: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    maxWidth: '100%',
  },
  teacherName: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  locationText: {
    flexShrink: 1,
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  sameCityBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
    maxWidth: 140,
  },
  sameCityText: {
    fontSize: typography.fontSizes.xs,
    color: colors.card,
    fontWeight: '600',
  },
  ratingSection: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingBox: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  ratingValue: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  reviewsCount: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statBox: {
    width: '48%',
    minWidth: 0,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  statValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  bioText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 24,
  },
  specializationsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  specializationChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  specializationText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: '500',
  },
  groupsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  groupChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupText: {
    fontSize: typography.fontSizes.sm,
    color: colors.card,
    fontWeight: '600',
  },
  educationText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  pricingContainer: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  priceBox: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  priceLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  priceValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.primary,
  },
  subscriptionCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  subscriptionIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  subscriptionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  subscriptionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.text,
  },
  subscriptionDescription: {
    marginTop: spacing.xs,
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  subscriptionStatusRow: {
    gap: spacing.xs,
  },
  subscriptionStatusLabel: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.primary,
  },
  subscriptionPeriodText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  subscriptionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  subscriptionNoticeText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  subscriptionPrimaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  subscriptionPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: typography.fontSizes.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  subscriptionSecondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  subscriptionSecondaryButtonText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
    fontWeight: '700',
  },
  methodsContainer: {
    gap: spacing.md,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  methodText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
  },
  reviewHeaderInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  reviewerName: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reviewRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewDate: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
  },
  reviewText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  noReviewsText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  footer: {
    backgroundColor: colors.card,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  messageButton: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  messageButtonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.primary,
  },
  messageButtonLocked: {
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  bookButton: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  bookButtonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.card,
    textAlign: 'center',
  },
  // Filter and sort styles
  filterScrollView: {
    marginBottom: spacing.sm,
  },
  filterContainer: {
    paddingRight: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    gap: spacing.xs,
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
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.card,
  },
  sortContainer: {
    marginBottom: spacing.md,
    zIndex: 10,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  sortButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    fontWeight: '500',
  },
  sortMenu: {
    position: 'absolute',
    top: 40,
    left: 0,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 160,
    zIndex: 100,
  },
  sortMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortMenuItemActive: {
    backgroundColor: colors.surface,
  },
  sortMenuItemText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  sortMenuItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  loadMoreText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  showingAllText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  noMatchingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  noMatchingTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  noMatchingText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
