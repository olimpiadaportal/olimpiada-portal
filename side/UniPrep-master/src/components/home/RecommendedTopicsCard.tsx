import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { Recommendation } from '../../services/recommendationService';
import { translateSubject } from '../../utils/subjectTranslation';

interface RecommendedTopicsCardProps {
  recommendations: Recommendation[];
  loading?: boolean;
  onTopicPress?: (subjectId: string, subjectName: string) => void;
  openingSubjectId?: string | null;
  hasPracticeData?: boolean; // true if user has practiced at least once
}

export const RecommendedTopicsCard: React.FC<RecommendedTopicsCardProps> = ({
  recommendations,
  loading = false,
  onTopicPress,
  openingSubjectId,
  hasPracticeData = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const getPriorityColor = (priority: 'high' | 'medium' | 'low'): string => {
    switch (priority) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const getPriorityIcon = (priority: 'high' | 'medium' | 'low'): keyof typeof Ionicons.glyphMap => {
    switch (priority) {
      case 'high':
        return 'alert-circle';
      case 'medium':
        return 'warning';
      case 'low':
        return 'information-circle';
      default:
        return 'information-circle';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.components.recommendedTopics.title')}
        </Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Analyzing your performance...
          </Text>
        </View>
      </View>
    );
  }

  if (recommendations.length === 0) {
    // Show different message based on whether user has practiced or not
    const hasData = hasPracticeData;
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.components.recommendedTopics.title')}
        </Text>
        <View style={styles.emptyContainer}>
          <Ionicons 
            name={hasData ? "checkmark-circle" : "bulb-outline"} 
            size={48} 
            color={hasData ? colors.success : colors.primary} 
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {hasData 
              ? t('home.components.recommendedTopics.greatJob')
              : t('home.components.recommendedTopics.noRecommendations')
            }
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {hasData 
              ? t('home.components.recommendedTopics.allGood')
              : t('home.components.recommendedTopics.startPracticing')
            }
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('home.components.recommendedTopics.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('home.components.recommendedTopics.subtitle')}
        </Text>
      </View>

      <View style={styles.topicsList}>
        {recommendations.map((rec, index) => {
          const isOpening = openingSubjectId === rec.subjectId;

          return (
            <TouchableOpacity
              key={index}
              activeOpacity={onTopicPress ? 0.82 : 1}
              disabled={!onTopicPress || !!openingSubjectId}
              onPress={() => onTopicPress?.(rec.subjectId, rec.subject)}
              style={[
                styles.topicItem,
                {
                  backgroundColor: colors.background,
                  borderLeftColor: getPriorityColor(rec.priority),
                },
                openingSubjectId && !isOpening && styles.disabledTopic,
              ]}
            >
              <View style={styles.topicHeader}>
                <View style={styles.topicTitleRow}>
                  <Ionicons
                    name={getPriorityIcon(rec.priority)}
                    size={20}
                    color={getPriorityColor(rec.priority)}
                  />
                  <Text style={[styles.topicName, { color: colors.text }]}>
                    {translateSubject(rec.subject, t)}
                  </Text>
                </View>
                <View style={[styles.accuracyBadge, {
                  backgroundColor: rec.accuracy >= 70 ? colors.success + '20' : colors.error + '20'
                }]}>
                  <Text style={[styles.accuracyText, {
                    color: rec.accuracy >= 70 ? colors.success : colors.error
                  }]}>
                    {rec.accuracy}%
                  </Text>
                </View>
              </View>

              <Text style={[styles.topicReason, { color: colors.textSecondary }]}>
                {rec.reason}
              </Text>

              <View style={styles.topicFooter}>
                {isOpening ? (
                  <View style={styles.topicMeta}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.topicMetaText, { color: colors.primary }]}>
                      {t('home.components.recommendedTopics.openingPractice')}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.topicMeta}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.topicMetaText, { color: colors.textSecondary }]}>
                        {rec.estimatedTime}
                      </Text>
                    </View>
                    <View style={styles.topicMeta}>
                      <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.topicMetaText, { color: colors.textSecondary }]}>
                        {rec.questionsCount} {t('home.components.recommendedTopics.questions')}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  topicsList: {
    gap: spacing.sm,
  },
  topicItem: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
  },
  disabledTopic: {
    opacity: 0.55,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topicName: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  accuracyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  accuracyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  topicReason: {
    fontSize: 13,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  topicFooter: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  topicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topicMetaText: {
    fontSize: 12,
  },
});
