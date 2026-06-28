import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bookingService } from '../../services/bookingService';
import { availabilityService } from '../../services/availabilityService';
import { paymentService } from '../../services/paymentService';
import { teacherService } from '../../services/teacherService';
import {
  teacherSubscriptionService,
  TeacherSubscription,
} from '../../services/teacherSubscriptionService';
import { useStripeContext } from '../../contexts/StripeContext';
import { translateSubject } from '../../utils/subjectTranslation';
import { TeacherWithDetails, SessionMethod, ServiceType } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { CustomDateTimePicker } from '../../components/DateTimePicker';
import { supabase } from '../../services/supabase';
import { useAlert } from '../../components/AlertProvider';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

type BookingScreenNavigationProp = StackNavigationProp<any, 'Booking'>;
type BookingScreenRouteProp = RouteProp<{ params: { teacher: TeacherWithDetails } }, 'params'>;

interface Props {
  navigation: BookingScreenNavigationProp;
  route: BookingScreenRouteProp;
}

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'History', 'Geography', 'Literature', 'English',
  'Azerbaijani', 'Russian',
];

const DURATIONS = [1, 1.5, 2, 2.5, 3];

export const BookingScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const initialTeacher = route.params.teacher;
  const [teacher, setTeacher] = useState<TeacherWithDetails>(initialTeacher);
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showError, showConfirm, showSuccess, showInfo } = useAlert();
  const { isBookingsPaid, isStripeReady, initializePaymentSheet, presentPaymentSheet } = useStripeContext();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [duration, setDuration] = useState<number>(1);
  const [sessionMethod, setSessionMethod] = useState<SessionMethod>('online');
  const [serviceType, setServiceType] = useState<ServiceType>('hourly');
  const [location, setLocation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [subjectsMap, setSubjectsMap] = useState<Map<string, string>>(new Map());
  const [timeSlots, setTimeSlots] = useState<{ time: string; disabled: boolean }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsState, setSlotsState] = useState<'loading' | 'time_off' | 'no_schedule' | 'ok'>('loading');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [bookingMode, setBookingMode] = useState<ServiceType>('hourly');
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
  const [subscription, setSubscription] = useState<TeacherSubscription | null>(null);
  const [subscriptionCurrency, setSubscriptionCurrency] = useState('AZN');
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionActionLoading, setSubscriptionActionLoading] = useState(false);
  const submitInFlightRef = useRef(false);
  const subscriptionActionRef = useRef(false);
  
  const monthlyRate = Number(teacher.monthly_rate ?? 0);
  const hasMonthlyRate = Number.isFinite(monthlyRate) && monthlyRate > 0;
  const isTeacherMarketplaceVerified = teacher.is_verified && teacher.verification_status !== 'rejected';
  const canUseMonthly = Boolean(
    user?.user_type === 'student' &&
    subscriptionEnabled &&
    isTeacherMarketplaceVerified &&
    hasMonthlyRate
  );
  const isMonthlyAvailabilityChecking = Boolean(
    subscriptionLoading &&
    user?.user_type === 'student' &&
    isTeacherMarketplaceVerified &&
    hasMonthlyRate
  );
  const canSelectMonthly = canUseMonthly || isMonthlyAvailabilityChecking;
  const monthlyUnavailableReason = !subscriptionEnabled
    ? t('teachers.booking.monthlyBillingDisabled')
    : !isTeacherMarketplaceVerified
    ? t('teachers.booking.monthlyTeacherUnverified')
    : !hasMonthlyRate
    ? t('teachers.booking.monthlyRateMissing')
    : t('teachers.booking.monthlyUnavailableShort');

  useEffect(() => {
    let isMounted = true;

    const refreshTeacherForBooking = async () => {
      try {
        const freshTeacher = await teacherService.getTeacherById(initialTeacher.id, user?.id);
        if (isMounted && freshTeacher) {
          setTeacher(freshTeacher);
        }
      } catch (error) {
        console.error('Refresh booking teacher error:', error);
      }
    };

    refreshTeacherForBooking();

    return () => {
      isMounted = false;
    };
  }, [initialTeacher.id, user?.id]);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        // Fetch all subjects from database
        const { data: subjects, error } = await supabase
          .from('subjects')
          .select('id, name_en');

        if (error) throw error;

        // Create a map of subject name to ID
        const map = new Map<string, string>();
        subjects?.forEach(subject => {
          map.set(subject.name_en, subject.id);
        });
        setSubjectsMap(map);

        // Filter subjects based on teacher's specializations
        const filtered = SUBJECTS.filter(subject =>
          teacher.specializations.includes(subject) && map.has(subject)
        );
        setAvailableSubjects(filtered);
        if (filtered.length > 0) {
          setSelectedSubject(filtered[0]);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
        // Fallback to teacher's specializations
        const filtered = teacher.specializations;
        setAvailableSubjects(filtered);
        if (filtered.length > 0) {
          setSelectedSubject(filtered[0]);
        }
      }
    };

    fetchSubjects();
    
    setServiceType('hourly');
    setBookingMode('hourly');
  }, [teacher]);

  useEffect(() => {
    let isMounted = true;

    const loadSubscriptionState = async () => {
      if (!user || user.user_type !== 'student') {
        setSubscriptionLoading(false);
        return;
      }

      setSubscriptionLoading(true);
      try {
        const [config, current] = await Promise.all([
          teacherSubscriptionService.getPublicConfig(),
          teacherSubscriptionService.getForTeacher(teacher.id),
        ]);

        if (!isMounted) return;
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
            resolvedSubscription = await teacherSubscriptionService.reconcile(teacher.id);
          } catch (reconcileError) {
            console.error('Reconcile booking subscription state error:', reconcileError);
          }
        }
        if (!isMounted) return;
        setSubscriptionEnabled(config.subscriptionsEnabled);
        setSubscription(resolvedSubscription);
        setSubscriptionCurrency(resolvedSubscription?.currency?.toUpperCase() || config.currency);
      } catch (error) {
        console.error('Load booking subscription state error:', error);
        if (isMounted) {
          setSubscriptionEnabled(false);
        }
      } finally {
        if (isMounted) {
          setSubscriptionLoading(false);
        }
      }
    };

    loadSubscriptionState();

    return () => {
      isMounted = false;
    };
  }, [isStripeReady, teacher.id, user]);

  useEffect(() => {
    if (!subscriptionLoading && !canUseMonthly && bookingMode === 'monthly') {
      setBookingMode('hourly');
      setServiceType('hourly');
    }
  }, [bookingMode, canUseMonthly, subscriptionLoading]);

  // Reload time slots whenever selected date changes
  useEffect(() => {
    loadTimeSlots(selectedDate);
  }, [selectedDate, teacher.id]);

  const loadTimeSlots = async (date: Date) => {
    setSlotsLoading(true);
    setSlotsState('loading');
    setSelectedTime('');
    try {
      const dateStr = date.toISOString().split('T')[0];
      const timeOffList = await availabilityService.getTimeOff(teacher.id);
      const isBlocked = availabilityService.isDateBlockedByTimeOff(dateStr, timeOffList);

      if (isBlocked) {
        setTimeSlots([]);
        setSlotsState('time_off');
        return;
      }

      const slots = await bookingService.getAvailableTimeSlots(teacher.id, dateStr);

      if (slots.length === 0) {
        setTimeSlots([]);
        setSlotsState('no_schedule');
        return;
      }

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      const mapped = slots.map(s => {
        const hour = parseInt(s.time.split(':')[0], 10);
        const isPast = isToday && (hour < currentHour || (hour === currentHour && currentMinute > 0));
        return { time: s.time, disabled: !s.is_available || isPast };
      });

      setTimeSlots(mapped);
      setSlotsState('ok');
    } catch (error) {
      console.error('Load time slots error:', error);
      setTimeSlots([]);
      setSlotsState('no_schedule');
    } finally {
      setSlotsLoading(false);
    }
  };

  const checkPhoneNumber = async (): Promise<boolean> => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user?.id)
        .single();

      if (error || !profile?.phone) {
        showConfirm(
          t('teachers.booking.phoneNumberRequired'),
          t('teachers.booking.phoneNumberMessage'),
          () => navigation.navigate('Profile'),
          undefined,
          t('teachers.booking.addPhoneNumber'),
          t('common.cancel')
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Check phone error:', error);
      return false;
    }
  };

  const handleMonthlySubscribe = async () => {
    if (subscriptionActionRef.current || subscriptionActionLoading) return;

    if (!canUseMonthly) {
      showInfo(
        t('teachers.booking.monthlyUnavailableTitle'),
        t('teachers.booking.monthlyUnavailableDesc')
      );
      return;
    }

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
          console.error('Post-payment subscription reconciliation error:', reconcileError);
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
      }
    } catch (error) {
      console.error('Booking monthly subscription error:', error);
      showError(
        t('common.error'),
        t('teachers.profile.subscription.createFailed')
      );
    } finally {
      subscriptionActionRef.current = false;
      setSubscriptionActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (submitInFlightRef.current || loading || paymentProcessing) {
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);

    try {
      // Validation
      if (!selectedSubject) {
        showError(t('common.error'), t('teachers.booking.pleaseSelectSubject'));
        return;
      }

      if (!selectedTime) {
        showError(t('common.error'), t('teachers.booking.pleaseSelectTime'));
        return;
      }

      if (sessionMethod === 'in-person' && !location) {
        showError(t('common.error'), t('teachers.booking.pleaseEnterLocation'));
        return;
      }

      // Check if user has phone number
      const hasPhone = await checkPhoneNumber();
      if (!hasPhone) {
        return;
      }

      // Get subject ID from the map
      const subjectId = subjectsMap.get(selectedSubject);

      if (!subjectId) {
        showError(t('common.error'), t('teachers.booking.invalidSubject'));
        return;
      }

      const bookingParams = {
        teacherId: teacher.id,
        subjectId: subjectId,
        scheduledDate: selectedDate.toISOString().split('T')[0],
        scheduledTime: selectedTime,
        durationHours: duration,
        sessionMethod: sessionMethod,
        serviceType: serviceType,
        location: sessionMethod === 'in-person' ? location : undefined,
        notes: notes || undefined,
      };

      // Stripe SDK is only needed later when the student pays after teacher acceptance.
    // Only isBookingsPaid matters here — Stripe SDK is only needed later
    // when student pays after teacher accepts (not at booking request time)
      if (isBookingsPaid) {
        await handlePaidBooking(bookingParams);
      } else {
        await handleFreeBooking(bookingParams);
      }
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  /**
   * Handle paid booking flow with Pay-After-Acceptance
   * Payment is NOT collected here - only when teacher accepts
   */
  const handlePaidBooking = async (params: {
    teacherId: string;
    subjectId: string;
    scheduledDate: string;
    scheduledTime: string;
    durationHours: number;
    sessionMethod: string;
    serviceType: string;
    location?: string;
    notes?: string;
  }) => {
    try {
      // Call create-payment Edge Function to create booking request
      // NO payment is collected at this stage (Pay-After-Acceptance)
      const result = await paymentService.initiateBookingPayment(params);

      if (!result) {
        showError(t('common.error'), t('teachers.booking.bookingFailed'));
        return;
      }

      const { bookingId, estimatedPrice, paymentRequired } = result as any;

      // Fetch the created booking
      const { data: booking } = await supabase
        .from('bookings')
        .select('*, subjects(name_en)')
        .eq('id', bookingId)
        .single();

      if (booking) {
        const bookingForConfirmation = {
          ...booking,
          subject_name: (booking.subjects as any)?.name_en || selectedSubject,
        };

        // Show appropriate message based on whether payment will be required
        if (paymentRequired && estimatedPrice > 0) {
          showSuccess(
            t('teachers.booking.requestSent'),
            t('teachers.booking.payAfterAcceptance', { price: estimatedPrice })
          );
        } else {
          showSuccess(
            t('teachers.booking.requestSent'),
            t('teachers.booking.requestSentDesc')
          );
        }
        navigation.navigate('BookingConfirmation', { booking: bookingForConfirmation });
      } else {
        navigation.navigate('MyBookings');
      }
    } catch (error) {
      console.error('Booking error:', error);
      showError(t('common.error'), t('teachers.booking.bookingFailed'));
    }
  };

  /**
   * Handle free booking flow (original flow)
   */
  const handleFreeBooking = async (params: {
    teacherId: string;
    subjectId: string;
    scheduledDate: string;
    scheduledTime: string;
    durationHours: number;
    sessionMethod: string;
    serviceType: string;
    location?: string;
    notes?: string;
  }) => {
    try {
      const result = await bookingService.createBooking(user?.id || '', {
        teacher_id: params.teacherId,
        subject_id: params.subjectId,
        scheduled_date: params.scheduledDate,
        scheduled_time: params.scheduledTime,
        duration_hours: params.durationHours,
        session_method: params.sessionMethod as SessionMethod,
        service_type: params.serviceType as ServiceType,
        location: params.location,
        notes: params.notes,
      });

      if (result.booking) {
        navigation.navigate('BookingConfirmation', { booking: result.booking });
      } else {
        const errorKey = result.error || 'bookingFailed';
        showError(t('common.error'), t(`teachers.booking.${errorKey}`));
      }
    } catch (error) {
      console.error('Booking error:', error);
      showError(t('common.error'), t('teachers.booking.bookingFailed'));
    }
  };

  const renderTimeSlot = ({ time, disabled }: { time: string; disabled: boolean }) => (
    <TouchableOpacity
      key={time}
      style={[
        styles.timeSlot,
        selectedTime === time && styles.timeSlotSelected,
        disabled && styles.timeSlotDisabled,
      ]}
      onPress={() => !disabled && setSelectedTime(time)}
      disabled={disabled}
    >
      <Text
        style={[
          styles.timeSlotText,
          selectedTime === time && styles.timeSlotTextSelected,
          disabled && styles.timeSlotTextDisabled,
        ]}
      >
        {time}
      </Text>
    </TouchableOpacity>
  );

  const hasExistingSubscription = Boolean(
    subscription && !['cancelled', 'incomplete_expired'].includes(subscription.status)
  );
  const hasActiveSubscription = Boolean(
    subscription && ['active', 'trialing'].includes(subscription.status)
  );
  const subscriptionNeedsPayment = Boolean(
    subscription && ['incomplete', 'past_due', 'unpaid'].includes(subscription.status)
  );
  const subscriptionActionBlocked = hasActiveSubscription || subscription?.status === 'paused';

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
        <Text style={styles.headerTitle} numberOfLines={1}>{t('teachers.booking.bookSession')}</Text>
        <View style={styles.headerIconSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Teacher Info */}
        <View style={styles.teacherInfo}>
          <Text style={styles.teacherName} numberOfLines={2}>{teacher.full_name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color="#F59E0B" />
            <Text style={styles.ratingText}>{teacher.rating.toFixed(1)}</Text>
          </View>
        </View>

        {/* Plan Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.choosePlan')}</Text>
          <View style={styles.planStack}>
            <TouchableOpacity
              style={[
                styles.planOption,
                bookingMode === 'hourly' && styles.planOptionSelected,
              ]}
              onPress={() => {
                setBookingMode('hourly');
                setServiceType('hourly');
              }}
            >
              <View style={styles.planIcon}>
                <Ionicons
                  name="time-outline"
                  size={22}
                  color={bookingMode === 'hourly' ? colors.primary : colors.textSecondary}
                />
              </View>
              <View style={styles.planTextBlock}>
                <Text
                  style={[
                    styles.planOptionTitle,
                    bookingMode === 'hourly' && styles.planOptionTitleSelected,
                  ]}
                >
                  {t('teachers.booking.hourlyService')}
                </Text>
                <Text style={styles.planOptionDesc}>
                  {t('teachers.booking.hourlyServiceDesc')}
                </Text>
              </View>
              {bookingMode === 'hourly' && (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.planOption,
                bookingMode === 'monthly' && styles.planOptionSelected,
                !canSelectMonthly && styles.planOptionDisabled,
              ]}
              onPress={() => canSelectMonthly && setBookingMode('monthly')}
              disabled={!canSelectMonthly}
            >
              <View style={styles.planIcon}>
                <Ionicons
                  name="repeat-outline"
                  size={22}
                  color={bookingMode === 'monthly' ? colors.primary : colors.textSecondary}
                />
              </View>
              <View style={styles.planTextBlock}>
                <Text
                  style={[
                    styles.planOptionTitle,
                    bookingMode === 'monthly' && styles.planOptionTitleSelected,
                  ]}
                >
                  {t('teachers.booking.monthlyService')}
                </Text>
                <Text style={styles.planOptionDesc}>
                  {canUseMonthly || isMonthlyAvailabilityChecking
                    ? t('teachers.booking.monthlyServiceDesc')
                    : monthlyUnavailableReason}
                </Text>
              </View>
              {isMonthlyAvailabilityChecking ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : bookingMode === 'monthly' ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        {bookingMode === 'hourly' ? (
          <>
        {/* Subject Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.selectSubject')} *</Text>
          <View style={styles.subjectsContainer}>
            {availableSubjects.map(subject => (
              <TouchableOpacity
                key={subject}
                style={[
                  styles.subjectChip,
                  selectedSubject === subject && styles.subjectChipSelected,
                ]}
                onPress={() => setSelectedSubject(subject)}
              >
                <Text
                  style={[
                    styles.subjectChipText,
                    selectedSubject === subject && styles.subjectChipTextSelected,
                  ]}
                >
                  {translateSubject(subject, t)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date Selection */}
        <View style={styles.section}>
          <CustomDateTimePicker
            label={`${t('teachers.booking.selectDate')} *`}
            value={selectedDate}
            onChange={setSelectedDate}
            mode="date"
            minimumDate={new Date()}
            maximumDate={new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)} // 90 days from now
          />
        </View>

        {/* Time Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.selectTime')} *</Text>
          {slotsLoading ? (
            <View style={styles.slotSkeletonGrid}>
              {[1, 2, 3, 4, 5, 6].map(item => (
                <LoadingSkeleton
                  key={item}
                  width={70}
                  height={38}
                  borderRadius={borderRadius.md}
                  style={styles.slotSkeleton}
                />
              ))}
            </View>
          ) : slotsState === 'time_off' ? (
            <View style={styles.slotsInfoBox}>
              <Ionicons name="ban" size={20} color="#EF4444" />
              <Text style={[styles.slotsInfoText, { color: '#EF4444' }]}>
                {t('teachers.booking.teacherOnTimeOff')}
              </Text>
            </View>
          ) : slotsState === 'no_schedule' ? (
            <View style={styles.slotsInfoBox}>
              <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.slotsInfoText}>
                {t('teachers.booking.noSlotsAvailable')}
              </Text>
            </View>
          ) : (
            <View style={styles.timeSlotsContainer}>
              {timeSlots.map(renderTimeSlot)}
            </View>
          )}
        </View>

        {/* Duration Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.duration')} *</Text>
          <View style={styles.durationContainer}>
            {DURATIONS.map(dur => (
              <TouchableOpacity
                key={dur}
                style={[
                  styles.durationChip,
                  duration === dur && styles.durationChipSelected,
                ]}
                onPress={() => setDuration(dur)}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    duration === dur && styles.durationChipTextSelected,
                  ]}
                >
                  {dur}{t('teachers.booking.hourShort').charAt(0).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Session Method Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.sessionMethod')} *</Text>
          
          {/* Online Option */}
          <TouchableOpacity
            style={[
              styles.methodOption,
              sessionMethod === 'online' && styles.methodOptionSelected,
            ]}
            onPress={() => setSessionMethod('online')}
          >
            <View style={styles.methodOptionContent}>
              <Ionicons
                name="videocam"
                size={24}
                color={sessionMethod === 'online' ? colors.primary : colors.textSecondary}
              />
              <View style={styles.methodOptionText}>
                <Text
                  style={[
                    styles.methodOptionTitle,
                    sessionMethod === 'online' && styles.methodOptionTitleSelected,
                  ]}
                >
                  {t('teachers.booking.onlineSession')}
                </Text>
                <Text style={styles.methodOptionDescription}>
                  {t('teachers.booking.videoCall')}
                </Text>
              </View>
            </View>
            {sessionMethod === 'online' && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>

          {/* In-Person Option */}
          <TouchableOpacity
            style={[
              styles.methodOption,
              sessionMethod === 'in-person' && styles.methodOptionSelected,
              !teacher.can_do_in_person && styles.methodOptionDisabled,
            ]}
            onPress={() => {
              if (teacher.can_do_in_person) {
                setSessionMethod('in-person');
              }
            }}
            disabled={!teacher.can_do_in_person}
          >
            <View style={styles.methodOptionContent}>
              <Ionicons
                name="people"
                size={24}
                color={
                  !teacher.can_do_in_person
                    ? colors.placeholder
                    : sessionMethod === 'in-person'
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <View style={styles.methodOptionText}>
                <Text
                  style={[
                    styles.methodOptionTitle,
                    sessionMethod === 'in-person' && styles.methodOptionTitleSelected,
                    !teacher.can_do_in_person && styles.methodOptionTitleDisabled,
                  ]}
                >
                  {t('teachers.booking.inPersonSession')}
                </Text>
                <Text style={styles.methodOptionDescription}>
                  {teacher.can_do_in_person
                    ? t('teachers.booking.meetAtLocation')
                    : t('teachers.booking.notAvailableDifferentCity')}
                </Text>
              </View>
            </View>
            {sessionMethod === 'in-person' && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Location (if in-person) */}
        {sessionMethod === 'in-person' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('teachers.booking.location')} *</Text>
            <TextInput
              style={styles.input}
              placeholder={t('teachers.booking.enterLocation')}
              value={location}
              onChangeText={setLocation}
              multiline
            />
          </View>
        )}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('teachers.booking.additionalNotes')}</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder={t('teachers.booking.notesPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Request Info Box - Replaces Price Summary */}
        <View style={styles.requestInfoBox}>
          <Ionicons name="information-circle" size={24} color="#1E40AF" />
          <View style={styles.requestInfoContent}>
            <Text style={styles.requestInfoTitle}>{t('teachers.booking.requestInfo')}</Text>
            <Text style={styles.requestInfoText}>
              {t('teachers.booking.requestInfoDesc')}
            </Text>
          </View>
        </View>
          </>
        ) : (
          <View style={styles.section}>
            <View style={styles.monthlyHeader}>
              <View style={styles.monthlyIcon}>
                <Ionicons name="repeat-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.monthlyHeaderText}>
                <Text style={styles.monthlyTitle}>
                  {t('teachers.booking.monthlyAccessTitle')}
                </Text>
                <Text style={styles.monthlyDescription}>
                  {t('teachers.booking.monthlyAccessDesc')}
                </Text>
              </View>
            </View>

            <View style={styles.monthlyPriceRow}>
              <Text style={styles.priceLabel}>{t('teachers.profile.monthlyRate')}</Text>
              <Text style={styles.monthlyPriceValue}>
                {monthlyRate.toFixed(2)} {subscriptionCurrency}
              </Text>
            </View>

            {subscriptionLoading ? (
              <LoadingSkeleton width="100%" height={46} borderRadius={borderRadius.md} />
            ) : hasExistingSubscription && subscription ? (
              <View style={styles.subscriptionStatusBox}>
                <Ionicons
                  name={['active', 'trialing'].includes(subscription.status) ? 'checkmark-circle' : 'time-outline'}
                  size={20}
                  color={['active', 'trialing'].includes(subscription.status) ? colors.success : '#F59E0B'}
                />
                <Text style={styles.subscriptionStatusText}>
                  {t(`teachers.profile.subscription.status.${subscription.status}`)}
                </Text>
              </View>
            ) : (
              <Text style={styles.monthlyFinePrint}>
                {t('teachers.profile.subscription.description', {
                  amount: monthlyRate.toFixed(2),
                  currency: subscriptionCurrency,
                })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        {/* Price Preview (when paid bookings enabled) */}
        {bookingMode === 'hourly' && isBookingsPaid && (
          <View style={styles.pricePreview}>
            <Text style={styles.priceLabel}>{t('teachers.booking.estimatedPrice')}</Text>
            <Text style={styles.priceValue}>
              {((teacher.hourly_rate || 0) * duration).toFixed(2)} AZN
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (
              loading ||
              paymentProcessing ||
              subscriptionActionLoading ||
              subscriptionLoading ||
              (bookingMode === 'monthly' && subscriptionActionBlocked)
            ) && styles.submitButtonDisabled,
          ]}
          onPress={bookingMode === 'monthly' ? handleMonthlySubscribe : handleSubmit}
          disabled={
            loading ||
            paymentProcessing ||
            subscriptionActionLoading ||
            subscriptionLoading ||
            (bookingMode === 'monthly' && subscriptionActionBlocked)
          }
        >
          {loading || paymentProcessing || subscriptionActionLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={'#FFFFFF'} />
              {paymentProcessing && (
                <Text style={styles.loadingText}>{t('teachers.booking.processingPayment')}</Text>
              )}
            </View>
          ) : (
            <Text
              style={styles.submitButtonText}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {bookingMode === 'monthly'
                ? hasActiveSubscription
                  ? t('teachers.profile.subscription.activeButton')
                  : subscription?.status === 'paused'
                  ? t('teachers.profile.subscription.status.paused')
                  : subscriptionNeedsPayment
                  ? t('teachers.profile.subscription.completePayment')
                  : t('teachers.booking.monthlySubscribe', {
                    amount: monthlyRate.toFixed(2),
                    currency: subscriptionCurrency,
                  })
                : isBookingsPaid
                ? t('teachers.booking.proceedToPayment')
                : t('teachers.booking.requestBooking')
              }
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
  teacherInfo: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  teacherName: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.md,
    color: colors.text,
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
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  planStack: {
    gap: spacing.sm,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.disabled,
    gap: spacing.md,
  },
  planOptionSelected: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
  },
  planOptionDisabled: {
    opacity: 0.55,
  },
  planIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  planOptionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  planOptionTitleSelected: {
    color: colors.primary,
  },
  planOptionDesc: {
    marginTop: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  subjectsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  subjectChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  subjectChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subjectChipText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  subjectChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeSlotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timeSlot: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.disabled,
    minWidth: 70,
    alignItems: 'center',
  },
  timeSlotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeSlotDisabled: {
    backgroundColor: colors.surfaceVariant,
    borderColor: colors.border,
    opacity: 0.5,
  },
  timeSlotText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
  },
  timeSlotTextSelected: {
    color: '#FFFFFF',
  },
  timeSlotTextDisabled: {
    color: colors.placeholder,
  },
  durationContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  durationChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  durationChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationChipText: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  durationChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.disabled,
  },
  methodOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  methodOptionDisabled: {
    opacity: 0.5,
  },
  methodOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodOptionText: {
    marginLeft: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  methodOptionTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  methodOptionTitleSelected: {
    color: colors.primary,
  },
  methodOptionTitleDisabled: {
    color: colors.placeholder,
  },
  methodOptionDescription: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.disabled,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  slotsInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotsInfoText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  slotSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotSkeleton: {
    marginBottom: spacing.xs,
  },
  requestInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  requestInfoContent: {
    flex: 1,
  },
  requestInfoTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: spacing.xs,
  },
  requestInfoText: {
    fontSize: typography.fontSizes.sm,
    color: '#1E40AF',
    lineHeight: 20,
  },
  monthlyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  monthlyIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthlyHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  monthlyTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 25,
  },
  monthlyDescription: {
    marginTop: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  monthlyPriceRow: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  monthlyPriceValue: {
    flexShrink: 0,
    fontSize: typography.fontSizes.xl,
    fontWeight: '800',
    color: colors.primary,
  },
  monthlyFinePrint: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  subscriptionStatusBox: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionStatusText: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: spacing.sm,
  },
  pricePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: typography.fontSizes.md,
    color: '#FFFFFF',
    marginLeft: spacing.sm,
  },
});
