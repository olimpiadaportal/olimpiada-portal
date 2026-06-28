// All Deadlines Screen
// Shows all upcoming deadlines with filtering and management
// Dark mode support added - Phase 1

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { deadlineService, Deadline } from '../../services/deadlineService';
import { AddDeadlineModal } from '../../components/AddDeadlineModal';
import { supabase } from '../../services/supabase';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { isPast, isToday, isTomorrow } from 'date-fns';
import { formatDateWithCapitalizedMonth } from '../../utils/dateFormatting';
import { useAlert } from '../../components/AlertProvider';

type FilterType = 'all' | 'exam' | 'assignment' | 'goal' | 'custom';

export const AllDeadlinesScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const { showError, showConfirm } = useAlert();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadStudentId();
  }, [user]);

  useEffect(() => {
    if (studentId) {
      loadDeadlines();
    }
  }, [studentId]);

  const loadStudentId = async () => {
    if (!user) return;
    try {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (student) {
        setStudentId(student.id);
      }
    } catch (error) {
      console.error('Load student ID error:', error);
    }
  };

  const loadDeadlines = async () => {
    if (!studentId) return;
    try {
      setLoading(true);
      const data = await deadlineService.getAllDeadlines(studentId);
      setDeadlines(data);
    } catch (error) {
      console.error('Load deadlines error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDeadlines();
    setRefreshing(false);
  };

  const handleAddDeadline = async (
    title: string,
    date: Date,
    type: 'exam' | 'assignment' | 'goal' | 'custom'
  ) => {
    if (!studentId) return;
    try {
      await deadlineService.createDeadline(studentId, {
        title,
        description: null,
        date: date.toISOString().split('T')[0],
        time: null,
        type,
        priority: 'medium',
      });
      await loadDeadlines();
      setShowAddModal(false);
    } catch (error) {
      console.error('Add deadline error:', error);
      showError(t('common.error'), t('home.components.allDeadlines.errorAdd'));
    }
  };

  const handleDeleteDeadline = async (deadlineId: string) => {
    showConfirm(
      t('home.components.allDeadlines.deleteTitle'),
      t('home.components.allDeadlines.deleteMessage'),
      async () => {
        try {
          await deadlineService.deleteReminder(deadlineId);
          await loadDeadlines();
        } catch (error) {
          console.error('Delete deadline error:', error);
          showError(t('common.error'), t('home.components.allDeadlines.errorDelete'));
        }
      },
      undefined,
      t('home.components.allDeadlines.deleteButton'),
      t('common.cancel')
    );
  };

  const getDeadlineDate = (deadline: Deadline): string => {
    const date = new Date(deadline.date);
    if (isToday(date)) return t('home.components.upcomingDeadlines.today');
    if (isTomorrow(date)) return t('home.components.upcomingDeadlines.tomorrow');
    return formatDateWithCapitalizedMonth(date, t('common.locale'), { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDeadlineIcon = (type: string): string => {
    switch (type) {
      case 'exam':
        return 'school';
      case 'assignment':
        return 'document-text';
      case 'goal':
        return 'flag';
      case 'custom':
        return 'calendar';
      default:
        return 'calendar';
    }
  };

  const getDeadlineColor = (deadline: Deadline): string => {
    const date = new Date(deadline.date);
    if (isPast(date)) return colors.disabled;
    if (isToday(date)) return colors.error;
    if (isTomorrow(date)) return colors.warning;
    return colors.primary;
  };

  const filteredDeadlines = filter === 'all' 
    ? deadlines 
    : deadlines.filter(d => d.type === filter);

  const filters: { label: string; value: FilterType }[] = [
    { label: t('home.components.allDeadlines.filters.all'), value: 'all' },
    { label: t('home.components.allDeadlines.filters.exams'), value: 'exam' },
    { label: t('home.components.allDeadlines.filters.assignments'), value: 'assignment' },
    { label: t('home.components.allDeadlines.filters.goals'), value: 'goal' },
    { label: t('home.components.allDeadlines.filters.custom'), value: 'custom' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('home.components.allDeadlines.title')}</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[
              styles.filterChip,
              filter === f.value && styles.filterChipActive,
            ]}
            onPress={() => setFilter(f.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.value && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Deadlines List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('common.loading')}</Text>
          </View>
        ) : filteredDeadlines.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No deadlines found</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'all' 
                ? 'Tap + to add your first deadline' 
                : `No ${filter} deadlines yet`}
            </Text>
          </View>
        ) : (
          filteredDeadlines.map((deadline) => (
            <View key={deadline.id} style={styles.deadlineCard}>
              <View style={styles.deadlineLeft}>
                <View
                  style={[
                    styles.deadlineIconContainer,
                    { backgroundColor: getDeadlineColor(deadline) + '20' },
                  ]}
                >
                  <Ionicons
                    name={getDeadlineIcon(deadline.type) as keyof typeof Ionicons.glyphMap}
                    size={24}
                    color={getDeadlineColor(deadline)}
                  />
                </View>
                <View style={styles.deadlineInfo}>
                  <Text style={styles.deadlineTitle}>{deadline.title}</Text>
                  <Text style={styles.deadlineDate}>
                    {getDeadlineDate(deadline)}
                  </Text>
                  {deadline.description && (
                    <Text style={styles.deadlineDescription} numberOfLines={1}>
                      {deadline.description}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteDeadline(deadline.id)}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Add Deadline Modal */}
      <AddDeadlineModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddDeadline}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  addButton: {
    padding: spacing.xs,
  },
  filtersContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filtersContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: typography.fontSizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deadlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deadlineIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deadlineInfo: {
    flex: 1,
  },
  deadlineTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs / 2,
  },
  deadlineDate: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
  },
  deadlineDescription: {
    fontSize: typography.fontSizes.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs / 2,
  },
  deleteButton: {
    padding: spacing.sm,
  },
});
