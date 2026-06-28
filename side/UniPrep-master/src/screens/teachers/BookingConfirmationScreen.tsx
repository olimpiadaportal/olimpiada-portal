import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Booking } from '../../types/teacher';
import { translateSubject } from '../../utils/subjectTranslation';
import { formatConfirmationDate } from '../../utils/dateFormatting';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type BookingConfirmationScreenNavigationProp = StackNavigationProp<any, 'BookingConfirmation'>;
type BookingConfirmationScreenRouteProp = RouteProp<
  { params: { booking: Booking } },
  'params'
>;

interface Props {
  navigation: BookingConfirmationScreenNavigationProp;
  route: BookingConfirmationScreenRouteProp;
}

export const BookingConfirmationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { booking } = route.params;
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const subjectName =
    booking.subject_name ||
    (booking as any).subjects?.name_en ||
    (booking as any).subject?.name_en ||
    t('common.notSpecified', 'Not specified');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={100} color={colors.success} />
        </View>

        {/* Success Message */}
        <Text style={styles.title}>{t('teachers.bookingConfirmation.title')}</Text>
        <Text style={styles.subtitle}>
          {t('teachers.bookingConfirmation.subtitle')}
        </Text>

        {/* Booking Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>{t('teachers.bookingConfirmation.bookingDetails')}</Text>

          <View style={styles.detailRow}>
            <Ionicons name="book" size={20} color={colors.textSecondary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.subject')}</Text>
              <Text style={styles.detailValue} numberOfLines={2}>{translateSubject(subjectName, t)}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color={colors.textSecondary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.date')}</Text>
              <Text style={styles.detailValue}>
                {formatConfirmationDate(booking.scheduled_date, t('common.locale'))}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="time" size={20} color={colors.textSecondary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.time')}</Text>
              <Text style={styles.detailValue}>{booking.scheduled_time}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="hourglass" size={20} color={colors.textSecondary} />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.duration')}</Text>
              <Text style={styles.detailValue}>
                {booking.duration_hours} {booking.duration_hours !== 1 ? t('teachers.booking.hours') : t('teachers.booking.hourShort')}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Ionicons
              name={booking.session_method === 'online' ? 'videocam' : 'people'}
              size={20}
              color={colors.textSecondary}
            />
            <View style={styles.detailText}>
              <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.method')}</Text>
              <Text style={styles.detailValue}>
                {booking.session_method === 'online' ? t('teachers.booking.onlineSession') : t('teachers.booking.inPersonSession')}
              </Text>
            </View>
          </View>

          {booking.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color={colors.textSecondary} />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>{t('teachers.bookingConfirmation.location')}</Text>
                <Text style={styles.detailValue}>{booking.location}</Text>
              </View>
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('teachers.bookingConfirmation.totalPrice')}</Text>
            <Text style={styles.priceValue}>{booking.price} AZN</Text>
          </View>

          <View style={styles.statusBadge}>
            <Ionicons name="time-outline" size={16} color="#F59E0B" />
            <Text style={styles.statusText}>{t('teachers.bookingConfirmation.pendingConfirmation')}</Text>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color={colors.info} />
          <Text style={styles.infoText}>
            {t('teachers.bookingConfirmation.infoMessage')}
          </Text>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('RequestStatus', { bookingId: booking.id })}
        >
          <Ionicons name="eye" size={20} color={colors.card} />
          <Text style={styles.primaryButtonText} numberOfLines={1}>{t('teachers.bookingConfirmation.trackStatus')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('MyBookings')}
        >
          <Text style={styles.secondaryButtonText} numberOfLines={1}>{t('teachers.bookingConfirmation.viewBookings')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={() => navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'TeachersList' }],
            })
          )}
        >
          <Text style={styles.tertiaryButtonText} numberOfLines={1}>{t('teachers.bookingConfirmation.backToTeachers')}</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  detailText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.fontSizes.md,
    color: colors.text,
    fontWeight: '500',
    flexShrink: 1,
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
    fontSize: typography.fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  priceValue: {
    fontSize: typography.fontSizes.xl,
    fontWeight: '700',
    color: colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  statusText: {
    marginLeft: spacing.xs,
    fontSize: typography.fontSizes.sm,
    color: '#92400E',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  infoText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSizes.sm,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '700',
    color: colors.card,
    flexShrink: 1,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.primary,
    paddingHorizontal: spacing.md,
  },
  tertiaryButton: {
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.disabled,
  },
  tertiaryButtonText: {
    fontSize: typography.fontSizes.md,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
  },
});
