/**
 * AI Insights Section Component
 * 
 * Displays AI-powered study insights on the Home screen
 * Features: Caching, refresh, mark as read, error handling
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useTheme } from '../../contexts/ThemeContext';
import { useAIInsights } from '../../contexts/AIInsightsContext';
import { AIInsightCard } from './AIInsightCard';
import { spacing } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';

interface AIInsightsSectionProps {
  studentId: string;
  onViewAll?: () => void;
  refreshTrigger?: number;
}

export const AIInsightsSection: React.FC<AIInsightsSectionProps> = ({
  studentId,
  onViewAll,
  refreshTrigger,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { 
    insights, 
    loading, 
    error, 
    unreadCount,
    loadInsights, 
    refreshInsights, 
    markAsRead 
  } = useAIInsights();
  const [refreshing, setRefreshing] = React.useState(false);
  const hasLoadedRef = useRef(false);
  const lastStudentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (studentId) {
      if (lastStudentIdRef.current !== studentId) {
        hasLoadedRef.current = false;
        lastStudentIdRef.current = studentId;
      }
      loadInsights(studentId, false, !hasLoadedRef.current);
      hasLoadedRef.current = true;
    }
  }, [studentId, refreshTrigger, loadInsights]);

  const handleRefresh = async () => {
    if (!studentId) return;
    setRefreshing(true);
    await refreshInsights(studentId);
    setRefreshing(false);
  };

  const handleMarkAsRead = async (insightId: string) => {
    await markAsRead(insightId);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="sparkles" size={24} color="#6366F1" />
            <Text style={[styles.title, { color: colors.text }]}>
              {t('home.components.aiInsights.title')}
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('home.components.aiInsights.loading', 'Analyzing your progress...')}
          </Text>
        </View>
      </View>
    );
  }

  if (error && insights.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="sparkles" size={24} color="#6366F1" />
            <Text style={[styles.title, { color: colors.text }]}>
              {t('home.components.aiInsights.title')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={[styles.errorContainer, { backgroundColor: colors.card }]}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={[styles.errorText, { color: colors.text }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={handleRefresh}
          >
            <Text style={styles.retryButtonText}>{t('ai.maintenance.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Get unread insights and show only the first unread one
  const unreadInsights = insights.filter(i => !i.isRead);
  const displayInsights = unreadInsights.slice(0, 1); // Show only first unread insight

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles" size={24} color="#6366F1" />
          <Text style={[styles.title, { color: colors.text }]}>
            {t('home.components.aiInsights.title')}
          </Text>
          {unreadInsights.length > 1 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadInsights.length}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {onViewAll && insights.length > 0 && (
            <TouchableOpacity onPress={onViewAll} activeOpacity={0.7} style={styles.viewAllButton}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>
                {t('home.components.aiInsights.viewAll')}
              </Text>
            </TouchableOpacity>
          )}
          {/* DEV ONLY: Refresh button for testing */}
          {__DEV__ && (
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Insights List */}
      {displayInsights.length > 0 ? (
        <View>
          {displayInsights.map((insight, index) => (
            <AIInsightCard
              key={`${insight.id}-${index}`}
              insight={insight}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t('home.components.aiInsights.allCaughtUp.title')}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('home.components.aiInsights.allCaughtUp.description')}
          </Text>
          {onViewAll && insights.length > 0 && (
            <TouchableOpacity
              style={[styles.viewPreviousButton, { borderColor: colors.primary }]}
              onPress={onViewAll}
            >
              <Text style={[styles.viewPreviousText, { color: colors.primary }]}>
                {t('home.components.aiInsights.allCaughtUp.viewPrevious')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// Helper function to get relative time
function getRelativeTime(dateString: string): string {
  try {
    if (!dateString) return 'recently';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'recently';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatShortDate(date, i18n.language === 'az' ? 'az-AZ' : i18n.language === 'ru' ? 'ru-RU' : 'en-US');
  } catch (error) {
    return 'recently';
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  lastUpdated: {
    fontSize: 12,
    marginLeft: spacing.sm,
    marginTop: 2,
  },
  viewAllButton: {
    paddingVertical: spacing.xs,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  cachedText: {
    color: '#6B7280',
    fontSize: 11,
    marginLeft: 2,
  },
  refreshButton: {
    padding: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorText: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
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
    paddingHorizontal: spacing.md,
  },
  viewPreviousButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewPreviousText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
