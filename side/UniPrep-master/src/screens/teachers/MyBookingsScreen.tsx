import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bookingService } from '../../services/bookingService';
import { paymentService } from '../../services/paymentService';
import { supabase } from '../../services/supabase';
import { BookingWithDetails, BookingStatus } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useStripeContext } from '../../contexts/StripeContext';
import { BookingCardSkeleton } from '../../components/skeletons/BookingCardSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { formatBookingDate } from '../../utils/dateFormatting';
import { translateSubject } from '../../utils/subjectTranslation';
import { useAlert } from '../../components/AlertProvider';

type MyBookingsScreenNavigationProp = StackNavigationProp<any, 'MyBookings'>;

interface Props {
  navigation: MyBookingsScreenNavigationProp;
}

type TabType = 'upcoming' | 'past' | 'pending' | 'cancelled';

export const MyBookingsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError, showInfo, showConfirm, showAlert } = useAlert();
  const { initializePaymentSheet, presentPaymentSheet, isStripeReady } = useStripeContext();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [allBookings, setAllBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
  }, []);

  const filteredBookings = useMemo(
    () => filterBookingsByTab(allBookings, activeTab),
    [allBookings, activeTab]
  );

  // Real-time subscription to refresh bookings when status changes
  useEffect(() => {
    if (!user?.id) return;

    const subscription = supabase
      .channel('student-bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `student_user_id=eq.${user.id}`,
        },
        (payload) => {
          loadBookings(true);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const loadBookings = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await bookingService.getStudentBookings(user?.id || '');
      setAllBookings(data);
    } catch (error) {
      console.error('Load bookings error:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookings(true);
    setRefreshing(false);
  };

  function filterBookingsByTab(
    sourceBookings: BookingWithDetails[],
    selectedTab: TabType
  ): BookingWithDetails[] {
    const now = new Date();
    const bookingDateTime = (booking: BookingWithDetails) => {
      const time = booking.scheduled_time || '00:00:00';
      return new Date(`${booking.scheduled_date}T${time}`);
    };

    switch (selectedTab) {
      case 'upcoming':
        return sourceBookings.filter(
          booking => booking.status === 'confirmed' && bookingDateTime(booking) >= now
        );
      case 'past':
        return sourceBookings.filter(
          booking =>
            booking.status === 'completed'
            || (booking.status === 'confirmed' && bookingDateTime(booking) < now)
        );
      case 'pending':
        return sourceBookings.filter(b => b.status === 'pending' || b.status === 'awaiting_payment');
      case 'cancelled':
        return sourceBookings.filter(b => b.status === 'cancelled');
      default:
        return sourceBookings;
    }
  }

  const handleContactTeacher = (phone: string, name: string) => {
    if (!phone) {
      showInfo(
        t('bookings.noContactInfo'),
        t('bookings.noContactMessage', { name })
      );
      return;
    }

    showAlert({
      title: t('bookings.contactTeacher'),
      message: `${t('bookings.phone')}: ${phone}`,
      type: 'info',
      buttons: [
        { 
          text: t('bookings.call'), 
          onPress: () => Linking.openURL(`tel:${phone}`)
        },
        { 
          text: t('bookings.message'), 
          onPress: () => Linking.openURL(`sms:${phone}`)
        },
      ],
    });
  };

  const handleCancelBooking = (booking: BookingWithDetails) => {
    showConfirm(
      t('bookings.cancelTitle'),
      t('bookings.cancelMessage'),
      async () => {
        try {
          const success = await bookingService.cancelBooking(
            booking.id,
            'Cancelled by student',
            'student'
          );
          if (success) {
            showSuccess(t('common.success'), t('bookings.cancelSuccess'));
            loadBookings(true);
          } else {
            showError(t('common.error'), t('bookings.cancelError'));
          }
        } catch (error) {
          console.error('Cancel booking error:', error);
          showError(t('common.error'), t('bookings.cancelError'));
        }
      },
      undefined,
      t('bookings.cancelConfirm'),
      t('common.no')
    );
  };

  const handlePayNow = async (booking: BookingWithDetails) => {
    if (payingBookingId) return;
    setPayingBookingId(booking.id);

    try {
      // 1. Get client secret from Edge Function
      const paymentData = await paymentService.getPaymentClientSecret(booking.id);
      if (!paymentData) {
        showError(t('common.error'), t('bookings.payment.fetchError', 'Could not retrieve payment details. Please try again.'));
        return;
      }

      if (paymentData.alreadyPaid) {
        showSuccess(t('common.success'), t('bookings.payment.alreadyPaid', 'Payment already completed! Your booking is confirmed.'));
        loadBookings(true);
        return;
      }

      if (!paymentData.clientSecret) {
        showError(t('common.error'), t('bookings.payment.noSecret', 'Payment setup error. Please contact support.'));
        return;
      }

      // 2. Initialize PaymentSheet with client secret
      if (!isStripeReady) {
        showInfo(
          t('bookings.payment.stripeNotReady', 'Payment Not Available'),
          t('bookings.payment.useDevBuild', 'Stripe payments require a development build. Please use a dev build to complete payment.')
        );
        return;
      }

      const { error: initError } = await initializePaymentSheet({
        clientSecret: paymentData.clientSecret,
        merchantDisplayName: 'Elmly',
      });

      if (initError) {
        showError(t('common.error'), initError);
        return;
      }

      // 3. Present PaymentSheet
      const { error: presentError, success } = await presentPaymentSheet();

      if (success) {
        // Stripe's signed webhook is authoritative. Keep the booking in the
        // visible Pending tab until the server confirms it, then move it.
        let confirmedBooking: BookingWithDetails | undefined;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
          const refreshed = await bookingService.getStudentBookings(user?.id || '');
          setAllBookings(refreshed);
          confirmedBooking = refreshed.find(
            candidate => candidate.id === booking.id && candidate.status === 'confirmed'
          );
          if (confirmedBooking) break;
        }

        if (confirmedBooking) {
          const scheduledAt = new Date(
            `${confirmedBooking.scheduled_date}T${confirmedBooking.scheduled_time || '00:00:00'}`
          );
          setActiveTab(scheduledAt >= new Date() ? 'upcoming' : 'past');
          showSuccess(
            t('bookings.payment.successTitle'),
            t('bookings.payment.successMessage')
          );
        } else {
          setActiveTab('pending');
          showInfo(
            t('bookings.payment.processingTitle'),
            t('bookings.payment.processingMessage')
          );
        }
      } else if (presentError) {
        showError(t('common.error'), presentError);
      }
      // If neither success nor error, user cancelled — do nothing
    } catch (error) {
      console.error('Payment error:', error);
      showError(t('common.error'), t('bookings.payment.genericError', 'Payment failed. Please try again.'));
    } finally {
      setPayingBookingId(null);
    }
  };

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'pending':
        return '#F59E0B';
      case 'awaiting_payment':
        return '#8B5CF6';
      case 'completed':
        return colors.primary;
      case 'cancelled':
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: BookingStatus) => {
    switch (status) {
      case 'confirmed':
        return t('bookings.status.confirmed');
      case 'pending':
        return t('bookings.status.pending');
      case 'awaiting_payment':
        return t('bookings.status.awaiting_payment', 'Awaiting Payment');
      case 'completed':
        return t('bookings.status.completed');
      case 'cancelled':
        return t('bookings.status.cancelled');
      default:
        return status;
    }
  };

  const renderBookingCard = ({ item }: { item: BookingWithDetails }) => (
    <View style={styles.bookingCard}>
      {/* Teacher Info */}
      <View style={styles.cardHeader}>
        <Image
          source={
            item.teacher.avatar_url
              ? { uri: item.teacher.avatar_url }
              : require('../../../assets/defaultavatar.png')
          }
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.teacherName} numberOfLines={2}>{item.teacher.full_name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.ratingText}>{item.teacher.rating.toFixed(1)}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>

      {/* Booking Details */}
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Ionicons name="book" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{translateSubject(item.subject_name, t)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>
            {formatBookingDate(item.scheduled_date, t('common.locale'), false)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="time" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>
            {item.scheduled_time} ({item.duration_hours} {t('common.hour')})
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons
            name={item.session_method === 'online' ? 'videocam' : 'people'}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.detailText}>
            {item.session_method === 'online' ? t('common.online') : t('common.inPerson')}
          </Text>
        </View>

        {item.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        )}
      </View>

      {/* Price */}
      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>{t('common.total')}</Text>
        <Text style={styles.priceValue}>{item.price} AZN</Text>
      </View>

      {/* Awaiting Payment Banner + Pay Now */}
      {item.status === 'awaiting_payment' && (
        <View style={styles.paymentSection}>
          <View style={styles.paymentBanner}>
            <Ionicons name="card-outline" size={18} color="#8B5CF6" />
            <Text style={styles.paymentBannerText}>
              {t('bookings.payment.teacherAccepted', 'Teacher accepted! Complete payment to confirm your booking.')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.payNowButton, payingBookingId === item.id && { opacity: 0.6 }]}
            onPress={() => handlePayNow(item)}
            disabled={payingBookingId === item.id}
          >
            {payingBookingId === item.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="card" size={18} color="#FFFFFF" />
                <Text style={styles.payNowButtonText}>
                  {t('bookings.payment.payNow', 'Pay Now')} - {item.price} AZN
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        {item.status === 'pending' && (
          <TouchableOpacity
            style={styles.statusButton}
            onPress={() => navigation.navigate('RequestStatus', { bookingId: item.id })}
          >
            <Ionicons name="eye" size={16} color={'#FFFFFF'} />
            <Text style={styles.statusButtonText}>{t('common.trackStatus')}</Text>
          </TouchableOpacity>
        )}

        {item.can_cancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => handleCancelBooking(item)}
          >
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        )}

        {item.can_review && (
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={() =>
              navigation.navigate('LeaveReview', {
                booking: item,
                teacher: item.teacher,
              })
            }
          >
            <Ionicons name="star" size={16} color={'#FFFFFF'} />
            <Text style={styles.reviewButtonText}>{t('common.leaveReview')}</Text>
          </TouchableOpacity>
        )}

        {item.status === 'confirmed' && (
          <TouchableOpacity
            style={styles.contactButton}
            onPress={() => handleContactTeacher(item.teacher.phone, item.teacher.full_name)}
          >
            <Ionicons name="call" size={16} color={colors.primary} />
            <Text style={styles.contactButtonText}>{t('common.contact')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {item.status === 'completed' && item.teacher_notes ? (
        <View style={styles.teacherNotesSection}>
          <View style={styles.teacherNotesHeader}>
            <Ionicons name="document-text" size={14} color={colors.primary} />
            <Text style={styles.teacherNotesLabel}>{t('bookings.teacherNotes')}</Text>
          </View>
          <Text style={styles.teacherNotesText}>{item.teacher_notes}</Text>
        </View>
      ) : null}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>{t('bookings.emptyState.title')}</Text>
      <Text style={styles.emptyText}>
        {t('bookings.emptyState.description')}
      </Text>
      {activeTab === 'upcoming' && (
        <TouchableOpacity
          style={styles.findTeachersButton}
          onPress={() => navigation.navigate('TeachersList')}
        >
          <Text style={styles.findTeachersText}>{t('bookings.emptyState.findTeachers')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

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
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {t('bookings.title')}
        </Text>
        <View style={styles.headerIconSpacer} />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text
            style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('bookings.tabs.upcoming')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text
            style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('bookings.tabs.pending')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text
            style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('bookings.tabs.past')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'cancelled' && styles.tabActive]}
          onPress={() => setActiveTab('cancelled')}
        >
          <Text
            style={[styles.tabText, activeTab === 'cancelled' && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {t('bookings.tabs.cancelled')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bookings List */}
      {loading ? (
        <View style={styles.listContent}>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={t('bookings.emptyState.title')}
          description={t('bookings.emptyState.description')}
        />
      ) : (
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        />
      )}
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
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    minHeight: 68,
  },
  tabsScroll: {
    flexGrow: 0,
    backgroundColor: colors.background,
    minHeight: 68,
    maxHeight: 68,
  },
  tab: {
    minWidth: 118,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
  },
  bookingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  teacherName: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    maxWidth: 130,
  },
  statusText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  detailsContainer: {
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  detailText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  actionsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  statusButton: {
    flexDirection: 'row',
    backgroundColor: colors.info,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  statusButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  cancelButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  reviewButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  reviewButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  contactButton: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  contactButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.primary,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  findTeachersButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  findTeachersText: {
    fontSize: typography.fontSizes.md,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  teacherNotesSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  teacherNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  teacherNotesLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teacherNotesText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  paymentSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF620',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  paymentBannerText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: '#7C3AED',
    fontWeight: '500',
    lineHeight: 18,
  },
  payNowButton: {
    flexDirection: 'row',
    backgroundColor: '#8B5CF6',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  payNowButtonText: {
    fontSize: typography.fontSizes.md,
    color: '#FFFFFF',
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
});
