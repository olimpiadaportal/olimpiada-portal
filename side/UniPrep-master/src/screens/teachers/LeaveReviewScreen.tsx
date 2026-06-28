import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { reviewService } from '../../services/reviewService';
import { BookingWithDetails } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { sanitizeInput } from '../../utils/validation';
import { translateSubject } from '../../utils/subjectTranslation';
import { formatBookingDate } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

type LeaveReviewScreenNavigationProp = StackNavigationProp<any, 'LeaveReview'>;
type LeaveReviewScreenRouteProp = RouteProp<
  {
    params: {
      booking: BookingWithDetails;
      teacher: { id: string; full_name: string; avatar_url: string | null };
    };
  },
  'params'
>;

interface Props {
  navigation: LeaveReviewScreenNavigationProp;
  route: LeaveReviewScreenRouteProp;
}

export const LeaveReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { booking, teacher } = route.params;
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError } = useAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [loadingReview, setLoadingReview] = useState(true);

  useEffect(() => {
    loadExistingReview();
  }, []);

  const loadExistingReview = async () => {
    try {
      setLoadingReview(true);
      const review = await reviewService.getReviewByBookingId(booking.id);
      if (review) {
        setExistingReview(review);
        setRating(review.rating);
        setReviewText(review.review_text);
      }
    } catch (error) {
      console.error('Load existing review error:', error);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) {
      return;
    }

    // Validation
    if (rating === 0) {
      showError(t('leaveReview.ratingRequired'), t('leaveReview.selectRating'));
      return;
    }

    if (reviewText.trim().length < 10) {
      showError(t('leaveReview.reviewTooShort'), t('leaveReview.writeAtLeast'));
      return;
    }

    try {
      setLoading(true);

      // Sanitize review text
      const sanitizedReview = sanitizeInput(reviewText.trim());

      if (!sanitizedReview || sanitizedReview.length < 10) {
        showError(t('common.error'), 'Review contains invalid content');
        setLoading(false);
        return;
      }

      let review;
      if (existingReview) {
        // Update existing review
        review = await reviewService.updateReview(
          existingReview.id,
          rating,
          sanitizedReview
        );
      } else {
        // Submit new review
        review = await reviewService.submitReview(
          user?.id || '',
          teacher.id,
          booking.id,
          rating,
          sanitizedReview
        );
      }

      if (review) {
        showSuccess(
          t('common.success'),
          existingReview ? t('leaveReview.reviewUpdated') : t('leaveReview.thankYou'),
          () => navigation.goBack()
        );
      } else {
        showError(t('common.error'), existingReview ? t('leaveReview.updateFailed') : t('leaveReview.submitFailed'));
      }
    } catch (error) {
      console.error('Submit review error:', error);
      showError(t('common.error'), t('leaveReview.tryAgain'));
    } finally {
      setLoading(false);
    }
  };

  const renderStarRating = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          onPress={() => setRating(i)}
          style={styles.starButton}
        >
          <Ionicons
            name={i <= rating ? 'star' : 'star-outline'}
            size={48}
            color={i <= rating ? '#F59E0B' : colors.border}
          />
        </TouchableOpacity>
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const getRatingLabel = () => {
    switch (rating) {
      case 1:
        return t('leaveReview.ratingLabels.poor');
      case 2:
        return t('leaveReview.ratingLabels.fair');
      case 3:
        return t('leaveReview.ratingLabels.good');
      case 4:
        return t('leaveReview.ratingLabels.veryGood');
      case 5:
        return t('leaveReview.ratingLabels.excellent');
      default:
        return t('leaveReview.tapToRate');
    }
  };

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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {existingReview ? t('leaveReview.updateTitle') : t('leaveReview.title')}
        </Text>
        <View style={styles.headerIconSpacer} />
      </View>

      {loadingReview ? (
        <View style={styles.loadingReviewContent}>
          <LoadingSkeleton width="100%" height={132} borderRadius={borderRadius.lg} />
          <LoadingSkeleton width="100%" height={178} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
          <LoadingSkeleton width="100%" height={210} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Teacher Info */}
        <View style={styles.teacherCard}>
          <Image
            source={
              teacher.avatar_url
                ? { uri: teacher.avatar_url }
                : require('../../../assets/defaultavatar.png')
            }
            style={styles.avatar}
          />
          <Text style={styles.teacherName} numberOfLines={2}>{teacher.full_name}</Text>
          <Text style={styles.sessionInfo} numberOfLines={2}>
            {translateSubject(booking.subject_name, t)} • {formatBookingDate(booking.scheduled_date, t('common.locale'), false)}
          </Text>
        </View>

        {/* Rating Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('leaveReview.howWasExperience')}</Text>
          {renderStarRating()}
          <Text style={styles.ratingLabel}>{getRatingLabel()}</Text>
        </View>

        {/* Review Text */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('leaveReview.writeReview')}</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder={t('leaveReview.placeholder')}
            value={reviewText}
            onChangeText={setReviewText}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>
            {reviewText.length}/500 {t('leaveReview.characters')}
          </Text>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={20} color={colors.primary} />
            <Text style={styles.tipsTitle}>{t('leaveReview.tipsTitle')}</Text>
          </View>
          <View style={styles.tipsList}>
            {(t('leaveReview.tips', { returnObjects: true }) as string[]).map((tip, index) => (
              <View key={index} style={styles.tipItem}>
                <Text style={styles.tipBullet}>•</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      )}

      {/* Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (loading || rating === 0 || reviewText.trim().length < 10) &&
              styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || loadingReview || rating === 0 || reviewText.trim().length < 10}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText} numberOfLines={1}>
              {existingReview ? t('leaveReview.updateReview') : t('leaveReview.submitReview')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  headerIconSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: spacing.md,
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + 84,
  },
  loadingReviewContent: {
    flex: 1,
    padding: spacing.lg,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
  teacherCard: {
    backgroundColor: colors.card,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  teacherName: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  sessionInfo: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
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
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  starButton: {
    padding: spacing.xs,
    minWidth: 48,
    alignItems: 'center',
  },
  ratingLabel: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
  },
  reviewInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.disabled,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    minHeight: 150,
  },
  charCount: {
    marginTop: spacing.xs,
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  tipsCard: {
    backgroundColor: colors.card,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tipsTitle: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  tipsList: {
    gap: spacing.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipBullet: {
    fontSize: typography.fontSizes.md,
    color: colors.primary,
    marginRight: spacing.sm,
    fontWeight: '700',
  },
  tipText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  footer: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: spacing.sm,
  },
});
