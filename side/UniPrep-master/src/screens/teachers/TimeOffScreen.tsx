// TimeOffScreen.tsx
// Phase 3 — Teacher Availability Management
// Teachers add / delete time-off date ranges (vacations, sick days, etc.)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
} from '../../services/availabilityService';

export const TimeOffScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const { showSuccess, showError, showAlert } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [reason, setReason] = useState('');
  const [dateError, setDateError] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  useEffect(() => {
    if (user?.id) loadData();
  }, [user?.id]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const tid = await availabilityService.getTeacherIdFromUserId(user.id);
      if (!tid) return;
      setTeacherId(tid);
      const list = await availabilityService.getTimeOff(tid);
      setTimeOffList(list);
    } catch (e) {
      console.error('TimeOffScreen loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const toDateString = (d: Date): string => d.toISOString().split('T')[0];

  const openAddModal = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
    setReason('');
    setDateError('');
    setShowStartPicker(false);
    setShowEndPicker(false);
    setAddModalVisible(true);
  };

  const validateDates = (): boolean => {
    if (toDateString(endDate) < toDateString(startDate)) {
      setDateError(t('timeOff.errorEndBeforeStart'));
      return false;
    }
    setDateError('');
    return true;
  };

  const handleAdd = async () => {
    if (!validateDates() || !teacherId) return;
    setSaving(true);
    const result = await availabilityService.addTimeOff(
      teacherId,
      toDateString(startDate),
      toDateString(endDate),
      reason.trim() || undefined
    );
    setSaving(false);
    if (result) {
      setAddModalVisible(false);
      showSuccess(t('common.success'), t('timeOff.addedSuccess'));
      await loadData();
    } else {
      showError(t('common.error'), t('timeOff.addedError'));
    }
  };

  const handleDelete = (item: TeacherTimeOff) => {
    showAlert({
      title: t('timeOff.deleteTitle'),
      message: t('timeOff.deleteMessage', { start: item.start_date, end: item.end_date }),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const ok = await availabilityService.deleteTimeOff(item.id);
            if (ok) {
              showSuccess(t('common.success'), t('timeOff.deletedSuccess'));
              await loadData();
            } else {
              showError(t('common.error'), t('timeOff.deletedError'));
            }
          },
        },
      ],
    });
  };

  const formatDateRange = (start: string, end: string): string => {
    if (start === end) return start;
    return `${start} → ${end}`;
  };

  const getDaysCount = (start: string, end: string): number => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const isActive = (item: TeacherTimeOff): boolean => {
    const today = new Date().toISOString().split('T')[0];
    return today >= item.start_date && today <= item.end_date;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('timeOff.title')}</Text>
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
        <Text style={styles.headerTitle}>{t('timeOff.title')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>{t('timeOff.infoText')}</Text>
        </View>

        {/* List */}
        {timeOffList.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>{t('timeOff.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('timeOff.emptySubtitle')}</Text>
            <TouchableOpacity style={styles.emptyAddButton} onPress={openAddModal}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.emptyAddButtonText}>{t('timeOff.addFirst')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {timeOffList.map(item => (
              <View key={item.id} style={[styles.card, isActive(item) && styles.cardActive]}>
                <View style={styles.cardLeft}>
                  <View style={styles.cardIconContainer}>
                    <Ionicons
                      name={isActive(item) ? 'ban' : 'calendar-outline'}
                      size={20}
                      color={isActive(item) ? '#EF4444' : colors.primary}
                    />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardDates}>{formatDateRange(item.start_date, item.end_date)}</Text>
                    <Text style={styles.cardDays}>
                      {t('timeOff.daysCount', { count: getDaysCount(item.start_date, item.end_date) })}
                      {isActive(item) && (
                        <Text style={styles.activeLabel}> · {t('timeOff.active')}</Text>
                      )}
                    </Text>
                    {item.reason ? (
                      <Text style={styles.cardReason}>{item.reason}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Time-Off Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('timeOff.addTitle')}</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Start date */}
            <Text style={styles.fieldLabel}>{t('timeOff.startDate')}</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => { setShowStartPicker(true); setShowEndPicker(false); }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.datePickerText}>{toDateString(startDate)}</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowStartPicker(false);
                  if (date) setStartDate(date);
                }}
              />
            )}

            {/* End date */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>{t('timeOff.endDate')}</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.datePickerText}>{toDateString(endDate)}</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                minimumDate={startDate}
                onChange={(_, date) => {
                  setShowEndPicker(false);
                  if (date) setEndDate(date);
                }}
              />
            )}

            {/* Reason */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
              {t('timeOff.reason')} <Text style={styles.optional}>({t('common.optional')})</Text>
            </Text>
            <TextInput
              style={[styles.dateInput, styles.reasonInput]}
              value={reason}
              onChangeText={setReason}
              placeholder={t('timeOff.reasonPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
            />

            {/* Error */}
            {dateError ? (
              <Text style={styles.errorText}>{dateError}</Text>
            ) : null}

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>{t('timeOff.addButton')}</Text>
              )}
            </TouchableOpacity>
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
    headerTitle: { fontSize: typography.fontSizes.lg, fontWeight: '700', color: colors.text },
    addButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
    scrollContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    infoCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.primary + '15',
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    infoText: { flex: 1, fontSize: typography.fontSizes.sm, color: colors.text, lineHeight: 20 },
    emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
    emptyTitle: { fontSize: typography.fontSizes.lg, fontWeight: '700', color: colors.text },
    emptySubtitle: { fontSize: typography.fontSizes.sm, color: colors.textSecondary, textAlign: 'center' },
    emptyAddButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    emptyAddButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSizes.md },
    list: { gap: spacing.sm },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
    },
    cardActive: { borderColor: '#EF4444', backgroundColor: colors.error ? colors.error + '18' : 'rgba(239,68,68,0.10)' },
    cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardContent: { flex: 1 },
    cardDates: { fontSize: typography.fontSizes.md, fontWeight: '700', color: colors.text },
    cardDays: { fontSize: typography.fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
    activeLabel: { color: '#EF4444', fontWeight: '600' },
    cardReason: { fontSize: typography.fontSizes.sm, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
    datePickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.primary + '60',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    datePickerText: {
      fontSize: typography.fontSizes.md,
      color: colors.text,
      fontWeight: '500',
    },
    deleteButton: { padding: spacing.sm },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
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
    modalTitle: { fontSize: typography.fontSizes.lg, fontWeight: '700', color: colors.text },
    fieldLabel: { fontSize: typography.fontSizes.sm, fontWeight: '600', color: colors.textSecondary },
    optional: { fontWeight: '400', fontStyle: 'italic' },
    dateInput: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border || '#E2E8F0',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: typography.fontSizes.md,
      color: colors.text,
    },
    reasonInput: { minHeight: 60, textAlignVertical: 'top' },
    errorText: { fontSize: typography.fontSizes.sm, color: '#EF4444', marginTop: spacing.xs },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSizes.md },
  });
