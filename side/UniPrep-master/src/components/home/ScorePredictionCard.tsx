import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography, borderRadius } from '../../constants/theme';
import {
  scorePredictionService,
  PredictionResult,
  PredictionConfidence,
} from '../../services/scorePredictionService';

interface Props {
  userId: string;
  studentId: string;
  onViewDetails: () => void;
  refreshTrigger?: number;
}

const CONFIDENCE_COLOR: Record<PredictionConfidence, string> = {
  low: '#F59E0B',
  medium: '#3B82F6',
  high: '#10B981',
};

const CONFIDENCE_ICON: Record<PredictionConfidence, keyof typeof Ionicons.glyphMap> = {
  low: 'alert-circle-outline',
  medium: 'stats-chart-outline',
  high: 'checkmark-circle-outline',
};

export const ScorePredictionCard: React.FC<Props> = ({
  userId,
  studentId,
  onViewDetails,
  refreshTrigger,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  const load = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const result = await scorePredictionService.predictScoreForUser(userId, studentId);
      setPrediction(result);
    } catch (e) {
      console.error('ScorePredictionCard load error:', e);
      setPrediction(null);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [userId, studentId]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('scorePrediction.calculating')}
          </Text>
        </View>
      </View>
    );
  }

  // Case 1: No prediction at all - user hasn't selected a group
  if (!prediction) {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onViewDetails}
        activeOpacity={0.85}
      >
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('scorePrediction.title')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('scorePrediction.noGroupDesc')}
        </Text>
        <View style={[styles.selectGroupRow, { backgroundColor: '#F59E0B15' }]}>
          <Ionicons name="person-circle-outline" size={16} color="#F59E0B" />
          <Text style={[styles.selectGroupText, { color: '#F59E0B' }]}>
            {t('scorePrediction.selectGroupFromProfile', 'Select your exam group from Profile to activate')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Case 2: Has prediction but not enough data yet - show unlock progress
  if (!prediction.has_sufficient_data) {
    const unlockProgress = prediction.unlock_progress;
    const hasSubjectsConfigured = unlockProgress && unlockProgress.total_count > 0;
    const progressText = hasSubjectsConfigured
      ? `${unlockProgress.unlocked_count}/${unlockProgress.total_count} ${t('scorePrediction.subjectsUnlocked')}`
      : null;

    // Case 2a: Group has no subjects configured yet
    if (!hasSubjectsConfigured) {
      return (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={onViewDetails}
          activeOpacity={0.85}
        >
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="construct-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>
              {t('scorePrediction.title')}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('scorePrediction.groupNotConfigured', 'This exam group is being set up. Subjects will be available soon.')}
          </Text>
        </TouchableOpacity>
      );
    }

    // Case 2b: Group has subjects, but user needs to practice more
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onViewDetails}
        activeOpacity={0.85}
      >
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: '#8B5CF620' }]}>
            <Ionicons name="lock-closed-outline" size={20} color="#8B5CF6" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('scorePrediction.title')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('scorePrediction.notEnoughData')}
        </Text>
        {progressText && (
          <View style={styles.unlockProgressRow}>
            <Text style={[styles.unlockProgressText, { color: colors.primary }]}>
              {progressText}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  const confColor = CONFIDENCE_COLOR[prediction.confidence];
  const confIcon = CONFIDENCE_ICON[prediction.confidence];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onViewDetails}
      activeOpacity={0.85}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: '#8B5CF620' }]}>
          <Ionicons name="trending-up-outline" size={20} color="#8B5CF6" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('scorePrediction.title')}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreValue, { color: colors.text }]}>
            {prediction.predicted_score}
          </Text>
          <Text style={[styles.scoreMax, { color: colors.textSecondary }]}>
            {t('scorePrediction.outOf', { max: prediction.max_possible_score })}
          </Text>
        </View>

        {/* Progress arc / percentage */}
        <View style={[styles.percentBadge, { backgroundColor: '#8B5CF615' }]}>
          <Text style={[styles.percentValue, { color: '#8B5CF6' }]}>
            {prediction.predicted_percentage}%
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${Math.min(prediction.predicted_percentage, 100)}%` as any,
              backgroundColor: '#8B5CF6',
            },
          ]}
        />
      </View>

      {/* Confidence badge */}
      <View style={styles.footer}>
        <View style={[styles.confidenceBadge, { backgroundColor: confColor + '18' }]}>
          <Ionicons name={confIcon} size={13} color={confColor} />
          <Text style={[styles.confidenceText, { color: confColor }]}>
            {t(`scorePrediction.confidence.${prediction.confidence}`)}
          </Text>
        </View>
        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          {t('scorePrediction.disclaimer')}
        </Text>
      </View>

      {/* Top improvement area */}
      {prediction.improvement_areas.length > 0 && (
        <View style={[styles.tipRow, { borderTopColor: colors.border }]}>
          <Ionicons name="bulb-outline" size={14} color="#F59E0B" />
          <Text style={[styles.tipText, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('scorePrediction.improveTip', {
              subject: prediction.improvement_areas[0].subject_name,
            })}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    fontSize: typography.fontSizes.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
  },
  emptyText: {
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  scoreMax: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '500',
  },
  percentBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full ?? 999,
  },
  percentValue: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  confidenceText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: typography.fontSizes.xs,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  tipText: {
    fontSize: typography.fontSizes.xs,
    flex: 1,
  },
  unlockProgressRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#8B5CF620',
  },
  selectGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  selectGroupText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    flex: 1,
  },
  unlockProgressText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
  },
});
