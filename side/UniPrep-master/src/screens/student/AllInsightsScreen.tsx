/**
 * All Insights Screen
 * 
 * Displays all AI insights for the student
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { useAIInsights } from '../../contexts/AIInsightsContext';
import { AIInsightCard } from '../../components/home/AIInsightCard';
import { spacing } from '../../constants/theme';
import { supabase } from '../../services/supabase';

export const AllInsightsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { 
    insights, 
    loading, 
    error, 
    loadInsights, 
    refreshInsights, 
    markAsRead 
  } = useAIInsights();
  
  const [refreshing, setRefreshing] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    loadStudentId();
  }, [user]);

  useEffect(() => {
    if (studentId) {
      // Load insights using shared context
      loadInsights(studentId);
    }
  }, [studentId, loadInsights]);

  const loadStudentId = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (data) {
        setStudentId(data.id);
      }
    } catch (err) {
      console.error('Failed to load student ID:', err);
    }
  };

  const handleRefresh = async () => {
    if (!studentId) return;
    setRefreshing(true);
    await refreshInsights(studentId);
    setRefreshing(false);
  };

  const handleMarkAsRead = async (insightId: string) => {
    await markAsRead(insightId);
  };

  const unreadInsights = insights.filter(i => !i.isRead);
  const readInsights = insights.filter(i => i.isRead);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('home.components.aiInsights.allInsights.title')}
          </Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('home.components.aiInsights.loading', 'Loading insights...')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('home.components.aiInsights.allInsights.title')}
        </Text>
        {/* DEV ONLY: Refresh button for testing */}
        {__DEV__ ? (
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="refresh" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={styles.stats}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: '#6366F1' }]}>
              {insights.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('home.components.aiInsights.allInsights.totalInsights')}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>
              {unreadInsights.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('home.components.aiInsights.allInsights.unread')}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: '#6B7280' }]}>
              {readInsights.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {t('home.components.aiInsights.allInsights.read')}
            </Text>
          </View>
        </View>

        {/* Unread Insights */}
        {unreadInsights.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('home.components.aiInsights.allInsights.unreadSection', { count: unreadInsights.length })}
            </Text>
            {unreadInsights.map((insight, index) => (
              <AIInsightCard
                key={`${insight.id}-${index}`}
                insight={insight}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
          </View>
        )}

        {/* Read Insights */}
        {readInsights.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('home.components.aiInsights.allInsights.readSection', { count: readInsights.length })}
            </Text>
            {readInsights.map((insight, index) => (
              <AIInsightCard
                key={`${insight.id}-read-${index}`}
                insight={insight}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
          </View>
        )}

        {/* Error State */}
        {error && (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle" size={64} color="#EF4444" />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              <Text style={styles.retryButtonText}>{t('ai.maintenance.tryAgain')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {!error && insights.length === 0 && (
          <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
            <Ionicons name="sparkles-outline" size={64} color="#6B7280" />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('home.components.aiInsights.empty.title', 'No Insights Yet')}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('home.components.aiInsights.empty.description', 'Practice more questions to get personalized AI insights')}
            </Text>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  refreshButton: {
    padding: spacing.xs,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
