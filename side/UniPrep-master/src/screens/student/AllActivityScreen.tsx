// All Activity Screen
// Shows all recent activities with filtering
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
import { activityService, Activity } from '../../services/activityService';
import { supabase } from '../../services/supabase';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { FadeIn } from '../../components/animated';
import { format } from 'date-fns';

type FilterType = 'all' | 'quiz' | 'exam';

export const AllActivityScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    loadStudentId();
  }, [user]);

  useEffect(() => {
    if (user && studentId) {
      loadActivities();
    }
  }, [user, studentId]);

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

  const loadActivities = async () => {
    if (!user || !studentId) return;
    try {
      setLoading(true);
      // Get all recent activities (up to 50)
      const data = await activityService.getLatestResults(user.id, studentId, 50);
      setActivities(data);
    } catch (error) {
      console.error('Load activities error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActivities();
    setRefreshing(false);
  };

  const handleActivityPress = (activity: Activity) => {
    if (activity.type === 'quiz') {
      // Navigate to Practice tab, then to QuizResult screen
      (navigation as any).navigate('Practice', {
        screen: 'QuizResult',
        params: { sessionId: activity.id },
      });
    } else if (activity.type === 'exam') {
      // Navigate to MockExams tab, then to ExamResults screen
      (navigation as any).navigate('MockExams', {
        screen: 'ExamResults',
        params: { attemptId: activity.id },
      });
    }
  };

  const getFilteredActivities = () => {
    if (filter === 'all') return activities;
    return activities.filter(a => a.type === filter);
  };

  const filteredActivities = getFilteredActivities();

  const filters: { label: string; value: FilterType }[] = [
    { label: t('home.components.allActivity.filters.all'), value: 'all' },
    { label: t('home.components.allActivity.filters.practice'), value: 'quiz' },
    { label: t('home.components.allActivity.filters.exams'), value: 'exam' },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'quiz':
        return 'document-text';
      case 'exam':
        return 'school';
      default:
        return 'checkmark-circle';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('home.components.allActivity.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterChipText, filter === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activities List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {loading ? (
          <Text style={styles.emptyText}>{t('home.components.allActivity.loadingActivities')}</Text>
        ) : filteredActivities.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>{t('home.components.allActivity.noActivities')}</Text>
            <Text style={styles.emptyText}>
              {filter === 'all' && t('home.components.allActivity.completeToSeeActivity')}
              {filter === 'quiz' && t('home.components.allActivity.noPracticeSessions')}
              {filter === 'exam' && t('home.components.allActivity.noExamAttempts')}
            </Text>
          </View>
        ) : (
          filteredActivities.map((activity, index) => (
            <FadeIn key={activity.id} delay={index * 60}>
            <TouchableOpacity
              style={styles.activityCard}
              onPress={() => handleActivityPress(activity)}
            >
              <View style={[styles.iconContainer, { backgroundColor: activity.color + '20' }]}>
                <Ionicons
                  name={getActivityIcon(activity.type) as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={activity.color}
                />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
                <Text style={styles.activityTime}>{activity.relativeTime}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
            </FadeIn>
          ))
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
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
  filterContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterContent: {
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs / 2,
  },
  activitySubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  activityTime: {
    fontSize: typography.fontSizes.xs,
    color: colors.textTertiary,
  },
});
