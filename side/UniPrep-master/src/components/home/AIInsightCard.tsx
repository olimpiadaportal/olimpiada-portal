/**
 * AI Insight Card Component
 * 
 * Displays individual AI-generated study insights with priority badges
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useTheme } from '../../contexts/ThemeContext';
import { AIInsight, InsightType, InsightPriority } from '../../types/ai';
import { spacing } from '../../constants/theme';
import { formatShortDate } from '../../utils/dateFormatting';
import { translateSubjectNamesInText } from '../../utils/subjectTranslation';

interface AIInsightCardProps {
  insight: AIInsight;
  onMarkAsRead: (id: string) => Promise<void>;
  onPress?: () => void;
  onDismiss?: () => void;
}

export const AIInsightCard: React.FC<AIInsightCardProps> = ({
  insight,
  onPress,
  onMarkAsRead,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState(false);

  const handleMarkAsRead = async () => {
    if (insight.isRead || marking) return;

    try {
      setMarking(true);
      await onMarkAsRead(insight.id);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    } finally {
      setMarking(false);
    }
  };

  const getInsightIcon = (type: InsightType): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'recommendation':
        return 'bulb';
      case 'weak_area':
        return 'alert-circle';
      case 'strength':
        return 'trophy';
      case 'study_tip':
        return 'book';
      default:
        return 'information-circle';
    }
  };

  const getInsightColor = (type: InsightType): string => {
    switch (type) {
      case 'recommendation':
        return '#6366F1'; // Indigo
      case 'weak_area':
        return '#F59E0B'; // Amber
      case 'strength':
        return '#10B981'; // Green
      case 'study_tip':
        return '#3B82F6'; // Blue
      default:
        return colors.text;
    }
  };

  const getPriorityBadge = (priority: InsightPriority) => {
    const config = {
      high: { color: '#EF4444', label: t('home.components.aiInsights.priority.high') },
      medium: { color: '#F59E0B', label: t('home.components.aiInsights.priority.medium') },
      low: { color: '#6B7280', label: t('home.components.aiInsights.priority.low') },
    };

    const { color, label } = config[priority];

    return (
      <View style={[styles.priorityBadge, { backgroundColor: color + '20' }]}>
        <Text style={[styles.priorityText, { color }]}>{label}</Text>
      </View>
    );
  };

  const insightColor = getInsightColor(insight.type);
  const displayTitle = translateSubjectNamesInText(insight.title, t);
  const displayContent = translateSubjectNamesInText(insight.content, t);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: insight.isRead ? 0.6 : 1,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: insightColor + '20' }]}>
            <Ionicons
              name={getInsightIcon(insight.type)}
              size={20}
              color={insightColor}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {displayTitle}
            </Text>
            {getPriorityBadge(insight.priority)}
          </View>
        </View>
        {!insight.isRead && (
          <View style={styles.unreadDot} />
        )}
      </View>

      {/* Content */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpanded(!expanded)}
      >
        <Text
          style={[styles.content, { color: colors.text }]}
          numberOfLines={expanded ? undefined : 2}
        >
          {displayContent}
        </Text>
        {displayContent.length > 100 && (
          <Text style={[styles.expandText, { color: insightColor }]}>
            {expanded ? t('home.components.aiInsights.allInsights.showLess') : t('home.components.aiInsights.allInsights.showMore')}
          </Text>
        )}
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
          {getRelativeTime(insight.generatedAt)}
        </Text>
        {!insight.isRead && !isTemporaryInsight(insight.id) && (
          <TouchableOpacity
            style={[styles.markButton, { borderColor: colors.border }]}
            onPress={handleMarkAsRead}
            disabled={marking}
          >
            {marking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.markButtonText, { color: colors.primary }]}>
                  {t('home.components.aiInsights.allInsights.markAsRead')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Helper function to check if insight is temporary (not in database)
function isTemporaryInsight(id: string): boolean {
  return !id || id.startsWith('temp-') || id.startsWith('fallback-') || id.startsWith('default-');
}

// Helper function to get relative time
function getRelativeTime(dateString: string): string {
  try {
    if (!dateString) return i18n.t('common.recently');
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return i18n.t('common.justNow');
    if (diffMins < 60) return `${diffMins}${i18n.t('common.minAgo')}`;
    if (diffHours < 24) return `${diffHours}${i18n.t('common.hourAgo')}`;
    if (diffDays < 7) return `${diffDays}${i18n.t('common.dayAgo')}`;
    return formatShortDate(date, i18n.t('common.locale'));
  } catch (error) {
    return i18n.t('common.recently');
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
    marginTop: 4,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  expandText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  timestamp: {
    fontSize: 12,
  },
  markButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  markButtonText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 4,
  },
});
