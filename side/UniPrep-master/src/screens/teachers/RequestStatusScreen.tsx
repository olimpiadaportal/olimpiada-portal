import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bookingService } from '../../services/bookingService';
import { paymentService } from '../../services/paymentService';
import { BookingWithDetails } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useStripeContext } from '../../contexts/StripeContext';
import { translateSubject } from '../../utils/subjectTranslation';
import { formatConfirmationDate } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

type RequestStatusScreenNavigationProp = StackNavigationProp<any, 'RequestStatus'>;
type RequestStatusScreenRouteProp = RouteProp<{ params: { bookingId: string } }, 'params'>;

interface Props {
  navigation: RequestStatusScreenNavigationProp;
  route: RequestStatusScreenRouteProp;
}

export const RequestStatusScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { bookingId } = route.params;
  const { colors } = useTheme();
  const { showSuccess, showError, showInfo } = useAlert();
  const { initializePaymentSheet, presentPaymentSheet, isStripeReady } = useStripeContext();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  useEffect(() => {
    loadBookingStatus();
  }, [bookingId]);

  const loadBookingStatus = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await bookingService.getBookingById(bookingId);
      setBooking(data);
    } catch (error) {
      console.error('Load booking status error:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookingStatus(true);
    setRefreshing(false);
  };

  const handlePayNow = async () => {
    if (!booking || payingBookingId) return;
    setPayingBookingId(booking.id);

    try {
      const paymentData = await paymentService.getPaymentClientSecret(booking.id);
      if (!paymentData) {
        showError(t('common.error'), t('bookings.payment.fetchError', 'Could not retrieve payment details. Please try again.'));
        return;
      }

      if (paymentData.alreadyPaid) {
        showSuccess(t('common.success'), t('bookings.payment.alreadyPaid', 'Payment already completed! Your booking is confirmed.'));
        loadBookingStatus();
        return;
      }

      if (!paymentData.clientSecret) {
        showError(t('common.error'), t('bookings.payment.noSecret', 'Payment setup error. Please contact support.'));
        return;
      }

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

      const { error: presentError, success } = await presentPaymentSheet();

      if (success) {
        let confirmed = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
          const refreshed = await bookingService.getBookingById(booking.id);
          if (refreshed) setBooking(refreshed);
          if (refreshed?.status === 'confirmed') {
            confirmed = true;
            break;
          }
        }

        if (confirmed) {
          showSuccess(
            t('bookings.payment.successTitle'),
            t('bookings.payment.successMessage')
          );
        } else {
          showInfo(
            t('bookings.payment.processingTitle'),
            t('bookings.payment.processingMessage')
          );
        }
      } else if (presentError) {
        showError(t('common.error'), presentError);
      }
    } catch (error) {
      console.error('Payment error:', error);
      showError(t('common.error'), t('bookings.payment.genericError', 'Payment failed. Please try again.'));
    } finally {
      setPayingBookingId(null);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          icon: 'time-outline' as const,
          color: '#F59E0B',
          title: t('requestStatus.status.pendingReview.title'),
          message: t('requestStatus.status.pendingReview.message'),
          nextSteps: t('requestStatus.nextSteps.pending', { returnObjects: true }) as string[],
        };
      case 'confirmed':
        return {
          icon: 'checkmark-circle' as const,
          color: colors.success,
          title: t('requestStatus.status.confirmed.title'),
          message: t('requestStatus.status.confirmed.message'),
          nextSteps: t('requestStatus.nextSteps.confirmed', { returnObjects: true }) as string[],
        };
      case 'completed':
        return {
          icon: 'checkmark-done' as const,
          color: colors.info,
          title: t('requestStatus.status.completed.title'),
          message: t('requestStatus.status.completed.message'),
          nextSteps: t('requestStatus.nextSteps.completed', { returnObjects: true }) as string[],
        };
      case 'awaiting_payment':
        return {
          icon: 'card-outline' as const,
          color: '#8B5CF6',
          title: t('requestStatus.status.awaitingPayment.title', 'Payment Required'),
          message: t('requestStatus.status.awaitingPayment.message', 'The teacher accepted your request! Complete payment to confirm your booking.'),
          nextSteps: t('requestStatus.nextSteps.awaitingPayment', { returnObjects: true, defaultValue: ['Tap "Pay Now" below to complete payment', 'Your booking will be confirmed after payment', 'Teacher contact info will be available after payment'] }) as string[],
        };
      case 'cancelled':
        return {
          icon: 'close-circle' as const,
          color: colors.error,
          title: booking?.cancellation_reason?.includes('teacher') ? t('requestStatus.status.declined.title') : t('requestStatus.status.cancelled.title'),
          message: booking?.cancellation_reason || t('requestStatus.status.cancelled.message'),
          nextSteps: t('requestStatus.nextSteps.cancelled', { returnObjects: true }) as string[],
        };
      default:
        return {
          icon: 'help-circle' as const,
          color: colors.textSecondary,
          title: t('requestStatus.status.unknown.title'),
          message: t('requestStatus.status.unknown.message'),
          nextSteps: [],
        };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <LoadingSkeleton width="88%" height={120} borderRadius={borderRadius.lg} />
          <LoadingSkeleton width="88%" height={240} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
          <LoadingSkeleton width="88%" height={150} borderRadius={borderRadius.lg} style={styles.skeletonBlock} />
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{t('requestStatus.title')}</Text>
          <View style={styles.headerIconSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>{t('requestStatus.bookingNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusInfo = getStatusInfo(booking.status);

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
        <Text style={styles.headerTitle} numberOfLines={1}>{t('requestStatus.title')}</Text>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={onRefresh}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Status Card */}
        <View style={[styles.statusCard, { borderLeftColor: statusInfo.color }]}>
          <View style={styles.statusHeader}>
            <Ionicons name={statusInfo.icon} size={48} color={statusInfo.color} />
            <View style={styles.statusTextContainer}>
              <Text style={styles.statusTitle}>{statusInfo.title}</Text>
              <Text style={styles.statusMessage}>{statusInfo.message}</Text>
            </View>
          </View>
        </View>

        {/* Booking Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('requestStatus.bookingDetails')}</Text>
          
          <View style={styles.detailRow}>
            <Ionicons name="person" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.teacher')}</Text>
            <Text style={styles.detailValue}>{booking.teacher.full_name}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="book" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.subject')}</Text>
            <Text style={styles.detailValue}>{translateSubject(booking.subject_name, t) || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.date')}</Text>
            <Text style={styles.detailValue}>
              {formatConfirmationDate(booking.scheduled_date, t('common.locale'))}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.time')}</Text>
            <Text style={styles.detailValue}>{booking.scheduled_time}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="hourglass" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.duration')}</Text>
            <Text style={styles.detailValue}>{booking.duration_hours} {t('requestStatus.hours')}</Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="cash" size={20} color={colors.textSecondary} />
            <Text style={styles.detailLabel}>{t('requestStatus.price')}</Text>
            <Text style={styles.detailValue}>{booking.price} AZN</Text>
          </View>

          {booking.session_method && (
            <View style={styles.detailRow}>
              <Ionicons 
                name={booking.session_method === 'online' ? 'videocam' : 'location'} 
                size={20} 
                color={colors.textSecondary} 
              />
              <Text style={styles.detailLabel}>{t('requestStatus.method')}</Text>
              <Text style={styles.detailValue}>
                {booking.session_method === 'online' ? t('common.online') : t('common.inPerson')}
              </Text>
            </View>
          )}

          {booking.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={colors.textSecondary} />
              <Text style={styles.detailLabel}>{t('requestStatus.location')}</Text>
              <Text style={styles.detailValue}>{booking.location}</Text>
            </View>
          )}
        </View>

        {/* Next Steps */}
        {statusInfo.nextSteps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('requestStatus.whatsNext')}</Text>
            {statusInfo.nextSteps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {booking.status === 'awaiting_payment' && (
            <TouchableOpacity
              style={[styles.payNowButton, payingBookingId === booking.id && { opacity: 0.6 }]}
              onPress={() => handlePayNow()}
              disabled={payingBookingId === booking.id}
            >
              {payingBookingId === booking.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="card" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>
                    {t('bookings.payment.payNow', 'Pay Now')} - {booking.price} AZN
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {booking.status === 'confirmed' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('MyBookings')}
            >
              <Ionicons name="calendar" size={20} color={'#FFFFFF'} />
              <Text style={styles.primaryButtonText}>{t('requestStatus.viewAllBookings')}</Text>
            </TouchableOpacity>
          )}

          {booking.status === 'pending' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('MyBookings')}
            >
              <Text style={styles.secondaryButtonText}>{t('requestStatus.viewAllRequests')}</Text>
            </TouchableOpacity>
          )}

          {booking.status === 'cancelled' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('TeachersList')}
            >
              <Ionicons name="search" size={20} color={'#FFFFFF'} />
              <Text style={styles.primaryButtonText}>{t('requestStatus.findAnotherTeacher')}</Text>
            </TouchableOpacity>
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
    paddingTop: spacing.xl,
  },
  skeletonBlock: {
    marginTop: spacing.md,
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
    paddingBottom: spacing.xxl,
    paddingTop: spacing.lg,
  },
  statusCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTextContainer: {
    marginLeft: spacing.md,
    flex: 1,
  },
  statusTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statusMessage: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  detailLabel: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  stepNumberText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    lineHeight: 22,
    paddingTop: 4,
  },
  actionsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: '#FFFFFF',
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSizes.lg,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  payNowButton: {
    flexDirection: 'row',
    backgroundColor: '#8B5CF6',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
