// AvailabilityManagementScreen.tsx
// Phase 3 — Teacher Availability Management
// Teachers set their weekly recurring schedule here

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useAlert } from '../../components/AlertProvider';
import {
  availabilityService,
  TeacherTimeOff,
  AvailabilitySlot,
  DAY_LABELS_FULL,
  TIME_OPTIONS,
} from '../../services/availabilityService';
import { TeacherAvailability } from '../../types/teacher';
import { WeeklyScheduleGrid } from '../../components/teachers/WeeklyScheduleGrid';

export const AvailabilityManagementScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const { showSuccess, showError } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<TeacherAvailability[]>([]);
  const [timeOff, setTimeOff] = useState<TeacherTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Day-edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('18:00');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (user?.id) loadData();
  }, [user?.id]);

  // Reload when returning from TimeOffScreen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.id) loadData();
    });
    return unsubscribe;
  }, [navigation, user?.id]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const tid = await availabilityService.getTeacherIdFromUserId(user.id);
      if (!tid) return;
      setTeacherId(tid);
      const [avail, off] = await Promise.all([
        availabilityService.getAvailability(tid),
        availabilityService.getTimeOff(tid),
      ]);
      setAvailability(avail);
      setTimeOff(off);
    } catch (e) {
      console.error('loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Open edit modal for a day
  const handleDayPress = (dayOfWeek: number, existing: TeacherAvailability | null) => {
    setEditingDay(dayOfWeek);
    setEditStartTime(existing?.start_time || '09:00');
    setEditEndTime(existing?.end_time || '18:00');
    setShowStartPicker(false);
    setShowEndPicker(false);
    setEditModalVisible(true);
  };

  // Save a single day slot
  const handleSaveDay = async () => {
    if (editingDay === null || !teacherId) return;
    if (editStartTime >= editEndTime) {
      showError(t('common.error'), t('availability.errorTimeRange'));
      return;
    }
    setSaving(true);
    const ok = await availabilityService.upsertDayAvailability(teacherId, {
      day_of_week: editingDay,
      start_time: editStartTime,
      end_time: editEndTime,
      is_available: true,
    });
    setSaving(false);
    if (ok) {
      setEditModalVisible(false);
      showSuccess(t('common.success'), t('availability.savedSuccess'));
      await loadData();
    } else {
      showError(t('common.error'), t('availability.savedError'));
    }
  };

  // Remove a day's availability
  const handleRemoveDay = async () => {
    if (editingDay === null || !teacherId) return;
    setSaving(true);
    const ok = await availabilityService.deleteDayAvailability(teacherId, editingDay);
    setSaving(false);
    if (ok) {
      setEditModalVisible(false);
      showSuccess(t('common.success'), t('availability.removedSuccess'));
      await loadData();
    } else {
      showError(t('common.error'), t('availability.savedError'));
    }
  };

  const existingForEditingDay = editingDay !== null
    ? availability.find(a => a.day_of_week === editingDay) || null
    : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('availability.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('availability.title')}</Text>
        <TouchableOpacity
          style={styles.timeOffButton}
          onPress={() => navigation.navigate('TimeOff')}
        >
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>{t('availability.infoText')}</Text>
        </View>

        {/* Weekly schedule grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('availability.weeklySchedule')}</Text>
          <WeeklyScheduleGrid
            availability={availability}
            timeOff={timeOff}
            onDayPress={handleDayPress}
            loading={saving}
          />
        </View>

        {/* Time-off summary */}
        {timeOff.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('availability.upcomingTimeOff')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('TimeOff')}>
                <Text style={styles.seeAllText}>{t('availability.manage')}</Text>
              </TouchableOpacity>
            </View>
            {timeOff.slice(0, 3).map(item => (
              <View key={item.id} style={styles.timeOffItem}>
                <Ionicons name="ban-outline" size={16} color="#EF4444" />
                <View style={styles.timeOffItemContent}>
                  <Text style={styles.timeOffItemDates}>
                    {item.start_date} → {item.end_date}
                  </Text>
                  {item.reason ? (
                    <Text style={styles.timeOffItemReason}>{item.reason}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Add time-off CTA */}
        <TouchableOpacity
          style={styles.addTimeOffCta}
          onPress={() => navigation.navigate('TimeOff')}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={styles.addTimeOffCtaText}>{t('availability.addTimeOff')}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Day-edit modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDay !== null
                  ? t(`availability.days.${DAY_LABELS_FULL[editingDay].toLowerCase()}`, DAY_LABELS_FULL[editingDay])
                  : ''}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Start time */}
            <Text style={styles.fieldLabel}>{t('availability.startTime')}</Text>
            <TouchableOpacity
              style={styles.timePickerButton}
              onPress={() => { setShowStartPicker(v => !v); setShowEndPicker(false); }}
            >
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.timePickerText}>{editStartTime}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {showStartPicker && (
              <ScrollView style={styles.timeList} nestedScrollEnabled>
                {TIME_OPTIONS.map(t2 => (
                  <TouchableOpacity
                    key={t2}
                    style={[styles.timeOption, editStartTime === t2 && styles.timeOptionSelected]}
                    onPress={() => { setEditStartTime(t2); setShowStartPicker(false); }}
                  >
                    <Text style={[styles.timeOptionText, editStartTime === t2 && styles.timeOptionTextSelected]}>
                      {t2}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* End time */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{t('availability.endTime')}</Text>
            <TouchableOpacity
              style={styles.timePickerButton}
              onPress={() => { setShowEndPicker(v => !v); setShowStartPicker(false); }}
            >
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.timePickerText}>{editEndTime}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {showEndPicker && (
              <ScrollView style={styles.timeList} nestedScrollEnabled>
                {TIME_OPTIONS.map(t2 => (
                  <TouchableOpacity
                    key={t2}
                    style={[styles.timeOption, editEndTime === t2 && styles.timeOptionSelected]}
                    onPress={() => { setEditEndTime(t2); setShowEndPicker(false); }}
                  >
                    <Text style={[styles.timeOptionText, editEndTime === t2 && styles.timeOptionTextSelected]}>
                      {t2}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Action buttons */}
            <View style={styles.modalActions}>
              {existingForEditingDay && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={handleRemoveDay}
                  disabled={saving}
                >
                  <Text style={styles.removeButtonText}>{t('availability.removeDay')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveDay}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('availability.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border || '#E2E8F0',
    },
    backButton: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
    },
    timeOffButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    scrollContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.primary + '15',
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    infoText: {
      flex: 1,
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      lineHeight: 20,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: typography.fontSizes.md,
      fontWeight: '700',
      color: colors.text,
    },
    seeAllText: {
      fontSize: typography.fontSizes.sm,
      color: colors.primary,
      fontWeight: '600',
    },
    timeOffItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    timeOffItemContent: { flex: 1 },
    timeOffItemDates: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: colors.text,
    },
    timeOffItemReason: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    addTimeOffCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    addTimeOffCtaText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      color: colors.primary,
      fontWeight: '600',
    },
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: borderRadius.xl || 20,
      borderTopRightRadius: borderRadius.xl || 20,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    modalTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
    },
    fieldLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    timePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
    },
    timePickerText: {
      flex: 1,
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: '500',
    },
    timeList: {
      maxHeight: 160,
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
    },
    timeOption: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    timeOptionSelected: {
      backgroundColor: colors.primary + '20',
    },
    timeOptionText: {
      fontSize: typography.fontSizes.sm,
      color: colors.text,
    },
    timeOptionTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    removeButton: {
      flex: 1,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#EF4444',
    },
    removeButtonText: {
      color: '#EF4444',
      fontWeight: '600',
      fontSize: typography.fontSizes.md,
    },
    saveButton: {
      flex: 2,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: typography.fontSizes.md,
    },
  });
