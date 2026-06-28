import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { RouteProp, useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { bookingService } from '../../services/bookingService';
import { BookingWithDetails, BookingStatus } from '../../types/teacher';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { formatBookingDate } from '../../utils/dateFormatting';
import { translateSubject } from '../../utils/subjectTranslation';
import { useAlert } from '../../components/AlertProvider';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { FadeIn } from '../../components/animated';
import { AppPressable, SectionHeader, StatusBadge } from '../../components/ui';

type TeacherBookingsScreenNavigationProp = StackNavigationProp<any, 'TeacherBookings'>;
type TeacherBookingsScreenRouteProp = RouteProp<{ params: { initialTab?: string } }, 'params'>;

interface Props {
  navigation?: TeacherBookingsScreenNavigationProp;
  route?: TeacherBookingsScreenRouteProp;
}

type TabType = 'pending' | 'upcoming' | 'past' | 'all';

export const TeacherBookingsScreen: React.FC<Props> = ({ navigation: navProp, route }) => {
  const { t } = useTranslation();
  const navigation = navProp || useNavigation<TeacherBookingsScreenNavigationProp>();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showSuccess, showError, showInfo, showConfirm, showAlert } = useAlert();
  const { enabled: isSessionNotesEnabled } = useFeatureFlag('session_notes');
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const initialTab = (route?.params?.initialTab as 'pending' | 'upcoming' | 'past' | 'all') || 'pending';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [allBookings, setAllBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [notesBooking, setNotesBooking] = useState<BookingWithDetails | null>(null);
  const [notesText, setNotesText] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = React.useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (user?.id && isMountedRef.current) {
      loadBookings();
    }
  }, [user?.id]);

  // Update active tab when route params change
  useEffect(() => {
    if (route?.params?.initialTab) {
      setActiveTab(route.params.initialTab as TabType);
    }
  }, [route?.params?.initialTab]);

  // Real-time subscription to refresh bookings when status changes (e.g., after student payment)
  useEffect(() => {
    if (!user?.id) return;

    const subscription = supabase
      .channel('teacher-bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `teacher_user_id=eq.${user.id}`,
        },
        () => {
          // Refresh quietly when any change occurs.
          if (isMountedRef.current) {
            loadBookings({ showLoader: false });
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const loadBookings = async (options: { showLoader?: boolean } = {}) => {
    if (!user?.id || !isMountedRef.current) {
      if (isMountedRef.current) setLoading(false);
      return;
    }

    try {
      const shouldShowLoader = options.showLoader ?? allBookings.length === 0;
      if (isMountedRef.current && shouldShowLoader) setLoading(true);

      // Get teacher record ID from user ID
      const { data: teacher, error: teacherError } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (teacherError || !teacher) {
        console.error('Teacher record not found:', teacherError);
        showError('Error', 'Teacher profile not found. Please contact support.');
        return;
      }
      
      const data = await bookingService.getTeacherBookings(teacher.id);
      if (isMountedRef.current) {
        setAllBookings(data);
      }
    } catch (error) {
      console.error('Load bookings error:', error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBookings({ showLoader: false });
    setRefreshing(false);
  };

  const filterBookingsByTab = useCallback((source: BookingWithDetails[], tab: TabType): BookingWithDetails[] => {
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day for accurate date comparison

    switch (tab) {
      case 'pending':
        return source.filter(b => b.status === 'pending');
      case 'upcoming':
        return source.filter(b => {
          const bookingDate = new Date(b.scheduled_date);
          bookingDate.setHours(0, 0, 0, 0); // Reset to start of day
          return (b.status === 'confirmed' || b.status === 'awaiting_payment') && bookingDate >= now;
        });
      case 'past':
        return source.filter(b => b.status === 'completed');
      case 'all':
        return source;
      default:
        return source;
    }
  }, []);

  const displayedBookings = useMemo(
    () => filterBookingsByTab(allBookings, activeTab),
    [activeTab, allBookings, filterBookingsByTab]
  );

  const bookingCounts = useMemo(() => ({
    pending: filterBookingsByTab(allBookings, 'pending').length,
    upcoming: filterBookingsByTab(allBookings, 'upcoming').length,
    past: filterBookingsByTab(allBookings, 'past').length,
    all: allBookings.length,
  }), [allBookings, filterBookingsByTab]);

  const setBookingProcessing = (bookingId: string, value: boolean) => {
    setProcessingIds(prev => {
      const next = new Set(prev);
      if (value) {
        next.add(bookingId);
      } else {
        next.delete(bookingId);
      }
      return next;
    });
  };

  const handleContactStudent = (phone: string, name: string, status?: BookingStatus, paymentStatus?: string) => {
    // Block contact if awaiting payment
    if (status === 'awaiting_payment' || paymentStatus === 'pending_payment') {
      showInfo(
        t('teacherBookings.awaitingPayment'),
        t('teacherBookings.contactAfterPayment', 'Student contact info will be available after payment is completed.')
      );
      return;
    }

    if (!phone) {
      showInfo(
        t('teacherBookings.noContactInfo'),
        t('teacherBookings.noContactMessage', { name })
      );
      return;
    }

    showAlert({
      title: t('teacherBookings.contactStudent', { name }),
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

  const handleAcceptBooking = async (booking: BookingWithDetails) => {
    if (processingIds.has(booking.id)) return;

    showConfirm(
      t('teacherBookings.acceptBookingTitle'),
      t('teacherBookings.acceptBookingMessage', { name: booking.student.full_name }),
      async () => {
        setBookingProcessing(booking.id, true);
        try {
          const result = await bookingService.acceptBooking(booking.id);
          if (result.success) {
            if (result.paymentRequired) {
              // Payment is required - student will be notified
              showSuccess(
                t('teacherBookings.bookingAccepted'),
                t('teacherBookings.paymentPending', { 
                  price: result.price, 
                  currency: result.currency 
                })
              );
            } else {
              // Free booking - confirmed immediately
              showSuccess(t('common.success'), t('teacherBookings.bookingAccepted'));
            }
            await loadBookings({ showLoader: false });
          } else {
            showError(t('common.error'), result.message || t('teacherBookings.acceptFailed'));
          }
        } catch (error) {
          console.error('Accept booking error:', error);
          showError(t('common.error'), t('teacherBookings.acceptFailed'));
        } finally {
          setBookingProcessing(booking.id, false);
        }
      },
      undefined,
      t('teacherBookings.accept'),
      t('common.cancel')
    );
  };

  const handleRejectBooking = async (booking: BookingWithDetails) => {
    if (processingIds.has(booking.id)) return;

    showConfirm(
      t('teacherBookings.rejectBookingTitle'),
      t('teacherBookings.rejectBookingMessage', { name: booking.student.full_name }),
      async () => {
        setBookingProcessing(booking.id, true);
        try {
          const success = await bookingService.rejectBooking(
            booking.id,
            'Not available at this time'
          );
          if (success) {
            showSuccess(t('common.success'), t('teacherBookings.bookingRejected'));
            await loadBookings({ showLoader: false });
          } else {
            showError(t('common.error'), t('teacherBookings.rejectFailed'));
          }
        } catch (error) {
          console.error('Reject booking error:', error);
          showError(t('common.error'), t('teacherBookings.rejectFailed'));
        } finally {
          setBookingProcessing(booking.id, false);
        }
      },
      undefined,
      t('teacherBookings.reject'),
      t('common.cancel')
    );
  };

  const handleOpenNotes = (booking: BookingWithDetails) => {
    setNotesBooking(booking);
    setNotesText(booking.teacher_notes || '');
    setNotesModalVisible(true);
  };

  const handleSaveNotes = async () => {
    if (!notesBooking) return;
    if (processingIds.has(notesBooking.id)) return;

    setNotesSaving(true);
    setBookingProcessing(notesBooking.id, true);
    try {
      const success = await bookingService.updateTeacherNotes(notesBooking.id, notesText);
      if (success) {
        showSuccess(t('common.success'), t('teacherBookings.notesSaved'));
        setNotesModalVisible(false);
        await loadBookings({ showLoader: false });
      } else {
        showError(t('common.error'), t('teacherBookings.notesSaveFailed'));
      }
    } catch (error) {
      console.error('Save notes error:', error);
      showError(t('common.error'), t('teacherBookings.notesSaveFailed'));
    } finally {
      setBookingProcessing(notesBooking.id, false);
      setNotesSaving(false);
    }
  };

  const handleCompleteBooking = async (booking: BookingWithDetails) => {
    if (processingIds.has(booking.id)) return;

    showConfirm(
      t('teacherBookings.completeBookingTitle'),
      t('teacherBookings.completeBookingMessage', { name: booking.student.full_name }),
      async () => {
        setBookingProcessing(booking.id, true);
        try {
          const success = await bookingService.completeBooking(booking.id);
          if (success) {
            showSuccess(t('common.success'), t('teacherBookings.sessionCompleted'));
            await loadBookings({ showLoader: false });
          } else {
            showError(t('common.error'), t('teacherBookings.completeFailed'));
          }
        } catch (error) {
          console.error('Complete booking error:', error);
          showError(t('common.error'), t('teacherBookings.completeFailed'));
        } finally {
          setBookingProcessing(booking.id, false);
        }
      },
      undefined,
      t('common.complete'),
      t('common.cancel')
    );
  };

  const getStatusVariant = (status: BookingStatus) => {
    switch (status) {
      case 'confirmed':
      case 'completed':
        return 'success' as const;
      case 'pending':
        return 'warning' as const;
      case 'awaiting_payment':
        return 'accent' as const;
      case 'cancelled':
        return 'error' as const;
      default:
        return 'neutral' as const;
    }
  };

  const renderLoadingSkeleton = () => (
    <View style={styles.skeletonList}>
      {[1, 2, 3].map(item => (
        <View key={item} style={[styles.bookingCard, styles.skeletonCard]}>
          <View style={styles.cardHeader}>
            <LoadingSkeleton width={50} height={50} borderRadius={25} />
            <View style={styles.headerInfo}>
              <LoadingSkeleton width="55%" height={18} />
              <LoadingSkeleton width="42%" height={14} style={{ marginTop: spacing.sm }} />
            </View>
            <LoadingSkeleton width={76} height={28} borderRadius={borderRadius.full} />
          </View>
          <LoadingSkeleton width="80%" height={16} style={styles.skeletonLine} />
          <LoadingSkeleton width="65%" height={16} style={styles.skeletonLine} />
          <LoadingSkeleton width="100%" height={42} borderRadius={borderRadius.md} style={styles.skeletonLine} />
        </View>
      ))}
    </View>
  );

  const renderBookingCard = ({ item }: { item: BookingWithDetails }) => {
    const isProcessing = processingIds.has(item.id);

    return (
      <FadeIn duration={260}>
      <View style={styles.bookingCard}>
      {/* Student Info */}
      <View style={styles.cardHeader}>
        <Image
          source={
            item.student.avatar_url
              ? { uri: item.student.avatar_url }
              : require('../../../assets/defaultavatar.png')
          }
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.studentName} numberOfLines={1}>{item.student.full_name}</Text>
          {/* Show phone but contact is blocked until payment complete */}
          <View style={styles.phoneRow}>
            <Ionicons name="call" size={14} color={colors.textSecondary} />
            <Text style={styles.phoneText} numberOfLines={1}>{item.student.phone}</Text>
          </View>
        </View>
        <StatusBadge
          label={t(`bookings.status.${item.status}`)}
          variant={getStatusVariant(item.status)}
          style={styles.statusBadge}
        />
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
            {formatBookingDate(item.scheduled_date, t('common.locale'), true)}
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
            {item.session_method === 'online' ? t('teacherBookings.onlineSession') : t('teacherBookings.inPersonSession')}
          </Text>
        </View>

        {item.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        )}

        {item.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>{t('teacherBookings.notes')}:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        )}
      </View>

      {/* Service Type */}
      {item.service_type && (
        <View style={styles.serviceTypeRow}>
          <View style={styles.serviceTypeBadge}>
            <Ionicons 
              name={item.service_type === 'hourly' ? 'time-outline' : 'calendar-outline'} 
              size={14} 
              color={colors.primary} 
            />
            <Text style={styles.serviceTypeText}>
              {item.service_type === 'hourly' 
                ? t('teacherBookings.hourlyService') 
                : t('teacherBookings.monthlyService')}
            </Text>
          </View>
        </View>
      )}

      {/* Actions */}
      {item.status === 'pending' && (
        <View style={styles.actionsContainer}>
          <AppPressable
            accessibilityLabel={t('teacherBookings.reject')}
            style={[styles.rejectButton, isProcessing && styles.disabledAction]}
            onPress={() => handleRejectBooking(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.rejectButtonText}>{t('teacherBookings.reject')}</Text>
            )}
          </AppPressable>
          <AppPressable
            accessibilityLabel={t('teacherBookings.accept')}
            style={[styles.acceptButton, isProcessing && styles.disabledAction]}
            onPress={() => handleAcceptBooking(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.acceptButtonText}>{t('teacherBookings.accept')}</Text>
            )}
          </AppPressable>
        </View>
      )}

      {item.status === 'awaiting_payment' && (
        <View style={styles.awaitingPaymentContainer}>
          <View style={styles.awaitingPaymentBanner}>
            <Ionicons name="time-outline" size={18} color="#8B5CF6" />
            <Text style={styles.awaitingPaymentText}>
              {t('teacherBookings.awaitingPayment')}
            </Text>
          </View>
        </View>
      )}

      {item.status === 'confirmed' && (
        <View style={styles.actionsContainer}>
          <AppPressable
            accessibilityLabel={t('teacherBookings.contact')}
            style={[styles.contactButton, isProcessing && styles.disabledAction]}
            onPress={() => handleContactStudent(item.student.phone, item.student.full_name, item.status, item.payment_status)}
            disabled={isProcessing}
          >
            <Ionicons name="call" size={16} color={'#FFFFFF'} />
            <Text style={styles.contactButtonText}>{t('teacherBookings.contact')}</Text>
          </AppPressable>
          <AppPressable
            accessibilityLabel={t('teacherBookings.markComplete')}
            style={[styles.completeButton, isProcessing && styles.disabledAction]}
            onPress={() => handleCompleteBooking(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={'#FFFFFF'} />
                <Text style={styles.completeButtonText}>{t('teacherBookings.markComplete')}</Text>
              </>
            )}
          </AppPressable>
        </View>
      )}

      {item.status === 'completed' && isSessionNotesEnabled && (
        <View style={styles.completedActionsContainer}>
          {item.teacher_notes ? (
            <View style={styles.teacherNotesPreview}>
              <View style={styles.teacherNotesHeader}>
                <Ionicons name="document-text" size={14} color={colors.primary} />
                <Text style={styles.teacherNotesLabel}>{t('teacherBookings.sessionNotes')}</Text>
              </View>
              <Text style={styles.teacherNotesText} numberOfLines={2}>{item.teacher_notes}</Text>
            </View>
          ) : null}
          <AppPressable
            accessibilityLabel={
              item.teacher_notes
                ? t('teacherBookings.editNotes')
                : t('teacherBookings.addNotes')
            }
            style={styles.notesButton}
            onPress={() => handleOpenNotes(item)}
          >
            <Ionicons name={item.teacher_notes ? 'create-outline' : 'add-circle-outline'} size={16} color={colors.primary} />
            <Text style={styles.notesButtonText}>
              {item.teacher_notes ? t('teacherBookings.editNotes') : t('teacherBookings.addNotes')}
            </Text>
          </AppPressable>
        </View>
      )}
      </View>
      </FadeIn>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>{t('teacherBookings.emptyState.title')}</Text>
      <Text style={styles.emptyText}>
        {activeTab === 'pending' && t('teacherBookings.emptyState.pending')}
        {activeTab === 'upcoming' && t('teacherBookings.emptyState.upcoming')}
        {activeTab === 'past' && t('teacherBookings.emptyState.past')}
        {activeTab === 'all' && t('teacherBookings.emptyState.all')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Session Notes Modal */}
      {isSessionNotesEnabled && (
      <Modal
        visible={notesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.notesModal}>
            <View style={styles.notesModalHeader}>
              <Text style={styles.notesModalTitle}>{t('teacherBookings.sessionNotes')}</Text>
              <AppPressable
                accessibilityLabel={t('common.close')}
                style={styles.notesModalCloseButton}
                onPress={() => setNotesModalVisible(false)}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </AppPressable>
            </View>
            {notesBooking && (
              <Text style={styles.notesModalSubtitle}>
                {notesBooking.student.full_name} - {notesBooking.subject_name}
              </Text>
            )}
            <TextInput
              style={styles.notesInput}
              value={notesText}
              onChangeText={setNotesText}
              placeholder={t('teacherBookings.notesPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <View style={styles.notesModalActions}>
              <AppPressable
                accessibilityLabel={t('common.cancel')}
                style={styles.notesCancelButton}
                onPress={() => setNotesModalVisible(false)}
              >
                <Text style={styles.notesCancelText}>{t('common.cancel')}</Text>
              </AppPressable>
              <AppPressable
                accessibilityLabel={t('common.save')}
                style={[styles.notesSaveButton, notesSaving && { opacity: 0.6 }]}
                onPress={handleSaveNotes}
                disabled={notesSaving}
              >
                {notesSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.notesSaveText}>{t('common.save')}</Text>
                )}
              </AppPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}

      <View style={styles.header}>
        <SectionHeader
          title={t('teacherBookings.title')}
          subtitle={t('teacherBookings.screenSubtitle')}
          icon="calendar-outline"
          style={styles.headerSection}
        />
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{bookingCounts.pending}</Text>
            <Text style={styles.summaryLabel}>{t('teacherBookings.tabs.pending')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{bookingCounts.upcoming}</Text>
            <Text style={styles.summaryLabel}>{t('teacherBookings.tabs.upcoming')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{bookingCounts.past}</Text>
            <Text style={styles.summaryLabel}>{t('teacherBookings.tabs.past')}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
      >
        {(['pending', 'upcoming', 'past', 'all'] as const).map(tab => (
          <AppPressable
            key={tab}
            accessibilityLabel={t(`teacherBookings.tabs.${tab}`)}
            accessibilityState={{ selected: activeTab === tab }}
            haptic={false}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]} numberOfLines={1}>
              {t(`teacherBookings.tabs.${tab}`)}
            </Text>
            <Text style={[styles.tabCount, activeTab === tab && styles.tabCountActive]}>
              {bookingCounts[tab]}
            </Text>
          </AppPressable>
        ))}
      </ScrollView>

      {/* Bookings List */}
      {loading ? (
        renderLoadingSkeleton()
      ) : (
        <FlatList
          data={displayedBookings}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSection: {
    marginBottom: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  summaryValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '800',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 68,
  },
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 68,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    minWidth: 112,
    height: 42,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    backgroundColor: colors.card,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabCount: {
    fontSize: typography.fontSizes.xs,
    color: colors.textTertiary,
    fontWeight: '800',
  },
  tabCountActive: {
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonCard: {
    marginBottom: 0,
  },
  skeletonLine: {
    marginTop: spacing.sm,
  },
  bookingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  },
  studentName: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  statusBadge: {
    maxWidth: 118,
    flexShrink: 0,
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
    lineHeight: 20,
  },
  notesContainer: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  notesLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  notesText: {
    fontSize: typography.fontSizes.sm,
    color: colors.text,
    lineHeight: 20,
  },
  serviceTypeRow: {
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  serviceTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  serviceTypeText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  disabledAction: {
    opacity: 0.65,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  rejectButtonText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
    fontWeight: '600',
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  contactButtonText: {
    fontSize: typography.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  completeButtonText: {
    fontSize: typography.fontSizes.xs,
    color: '#FFFFFF',
    fontWeight: '600',
    flexShrink: 1,
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
  },
  awaitingPaymentContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  awaitingPaymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF615',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  awaitingPaymentText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  completedActionsContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  teacherNotesPreview: {
    backgroundColor: colors.primary + '10',
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
  notesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  notesButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  notesModal: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  notesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  notesModalCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesModalTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
    color: colors.text,
  },
  notesModalSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: typography.fontSizes.md,
    color: colors.text,
    minHeight: 140,
    marginBottom: spacing.md,
  },
  notesModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  notesCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesCancelText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  notesSaveButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  notesSaveText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
