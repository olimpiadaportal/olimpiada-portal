// WeeklyScheduleGrid.tsx
// Phase 3 — Teacher Availability Management
// Visual 7-day grid where teachers toggle availability per day

import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { TeacherAvailability } from '../../types/teacher';
import { TeacherTimeOff, DAY_LABELS, TIME_OPTIONS } from '../../services/availabilityService';

interface WeeklyScheduleGridProps {
  availability: TeacherAvailability[];
  timeOff: TeacherTimeOff[];
  onDayPress: (dayOfWeek: number, existing: TeacherAvailability | null) => void;
  loading?: boolean;
}

export const WeeklyScheduleGrid: React.FC<WeeklyScheduleGridProps> = ({
  availability,
  timeOff,
  onDayPress,
  loading = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Build a map: dayOfWeek → availability row
  const availMap = useMemo(() => {
    const map = new Map<number, TeacherAvailability>();
    availability.forEach(a => map.set(a.day_of_week, a));
    return map;
  }, [availability]);

  // Check if today has an active time-off block
  const todayStr = new Date().toISOString().split('T')[0];
  const isOnTimeOff = timeOff.some(
    t => todayStr >= t.start_date && todayStr <= t.end_date
  );

  // Days ordered Mon–Sun (1–6, 0) for display
  const orderedDays = [1, 2, 3, 4, 5, 6, 0];

  return (
    <View style={styles.container}>
      {/* Time-off banner */}
      {isOnTimeOff && (
        <View style={styles.timeOffBanner}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.timeOffBannerText}>
            {t('availability.currentlyOnTimeOff')}
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success || '#10B981' }]} />
          <Text style={styles.legendText}>{t('availability.available')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border || '#E2E8F0' }]} />
          <Text style={styles.legendText}>{t('availability.notSet')}</Text>
        </View>
      </View>

      {/* Day rows */}
      <View style={styles.grid}>
        {orderedDays.map(day => {
          const slot = availMap.get(day) || null;
          const isSet = slot !== null && slot.is_available;

          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayRow,
                isSet && styles.dayRowActive,
              ]}
              onPress={() => onDayPress(day, slot)}
              activeOpacity={0.7}
              disabled={loading}
            >
              {/* Day label */}
              <View style={styles.dayLabelContainer}>
                <Text style={[styles.dayLabel, isSet && styles.dayLabelActive]}>
                  {t(`availability.days.${DAY_LABELS[day].toLowerCase()}`, DAY_LABELS[day])}
                </Text>
              </View>

              {/* Time range or "Tap to set" */}
              <View style={styles.dayContent}>
                {isSet ? (
                  <View style={styles.timeRange}>
                    <Ionicons name="time-outline" size={14} color={colors.success || '#10B981'} />
                    <Text style={styles.timeRangeText}>
                      {slot!.start_time} – {slot!.end_time}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.notSetText}>
                    {t('availability.tapToSet')}
                  </Text>
                )}
              </View>

              {/* Edit / Add icon */}
              <Ionicons
                name={isSet ? 'create-outline' : 'add-circle-outline'}
                size={20}
                color={isSet ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    timeOffBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: '#EF4444',
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    timeOffBannerText: {
      color: '#fff',
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
    },
    legend: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
    },
    grid: {
      gap: spacing.xs,
    },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
    },
    dayRowActive: {
      borderColor: colors.success || '#10B981',
      backgroundColor: (colors.success || '#10B981') + '10',
    },
    dayLabelContainer: {
      width: 44,
    },
    dayLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    dayLabelActive: {
      color: colors.text,
    },
    dayContent: {
      flex: 1,
      paddingHorizontal: spacing.sm,
    },
    timeRange: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    timeRangeText: {
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      fontWeight: '500',
    },
    notSetText: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
  });
