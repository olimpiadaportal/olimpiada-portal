import React, { useEffect, useState, useCallback } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../services/supabase';
import { spacing, typography, borderRadius } from '../../constants/theme';
import { Card } from '../../components/Card';
import { AnimatedNumber, AnimatedProgress, FadeIn, Stagger } from '../../components/animated';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ErrorState, SectionHeader, StatusBadge } from '../../components/ui';
import {
  scorePredictionService,
  PredictionResult,
  SubjectPrediction,
  UnlockSubjectStatus,
} from '../../services/scorePredictionService';

// ─── Confidence config ────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

export const ScorePredictionScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefreshing = false) => {
    if (!user?.id) return;
    try {
      if (isRefreshing) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Get student record
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (sErr || !student) throw new Error('Student record not found');
      setStudentId(student.id);

      const result = await scorePredictionService.predictScoreForUser(user.id, student.id);
      setPrediction(result);
    } catch (e: any) {
      console.error('ScorePredictionScreen load error:', e);
      setError(e.message ?? 'Failed to load prediction');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => load(true);
  const renderHeader = () => (
    <View style={styles.navHeader}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
        {t('scorePrediction.title')}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // ── Render helpers ──────────────────────────────────────────────────────────

  // Detect which subject_ids appear in BOTH stages (e.g. Mathematics for Group I)
  const dualStageIds = new Set(
    prediction?.subject_breakdown
      .filter((s) =>
        prediction.subject_breakdown.some(
          (o) => o.subject_id === s.subject_id && o.stage !== s.stage
        )
      )
      .map((s) => s.subject_id) ?? []
  );

  const renderSubjectBar = (subject: SubjectPrediction, index: number) => {
    const fillPct = subject.max_points > 0
      ? Math.min((subject.predicted_points / subject.max_points) * 100, 100)
      : 0;

    const stageColor = subject.stage === 'first' ? '#3B82F6' : '#8B5CF6';
    const isUnpracticed = subject.questions_attempted === 0;
    // Unique key: subject_id + stage (handles subjects in both stages)
    const rowKey = `${subject.subject_id}-${subject.stage}`;

    return (
      <View key={rowKey} style={[styles.subjectRow, { borderBottomColor: colors.border }]}>
        <View style={styles.subjectLeft}>
          <View style={styles.subjectNameRow}>
            <View style={[styles.stageDot, { backgroundColor: stageColor }]} />
            <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={1}>
              {subject.subject_name}
            </Text>
            {/* Show stage tag only when this subject appears in both stages */}
            {dualStageIds.has(subject.subject_id) && (
              <View style={[styles.dualStageTag, { backgroundColor: stageColor + '20' }]}>
                <Text style={[styles.dualStageTagText, { color: stageColor }]}>
                  {subject.stage === 'first' ? t('scorePrediction.stageI') : t('scorePrediction.stageII')}
                </Text>
              </View>
            )}
            {isUnpracticed && (
              <Ionicons name="alert-circle-outline" size={14} color="#F59E0B" />
            )}
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.barFill,
                { width: `${fillPct}%` as any, backgroundColor: isUnpracticed ? colors.border : stageColor },
              ]}
            />
          </View>
          <Text style={[styles.subjectAccuracy, { color: colors.textSecondary }]}>
            {isUnpracticed
              ? t('scorePrediction.noPracticeData')
              : `${t('scorePrediction.accuracy')}: ${subject.accuracy}% • ${t('scorePrediction.questionsAttempted', { count: subject.questions_attempted })}`
            }
          </Text>
        </View>
        <View style={styles.subjectRight}>
          <Text style={[styles.subjectPoints, { color: isUnpracticed ? colors.textSecondary : colors.text }]}>
            {subject.predicted_points}
          </Text>
          <Text style={[styles.subjectMaxPoints, { color: colors.textSecondary }]}>
            /{subject.max_points}
          </Text>
        </View>
      </View>
    );
  };

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {renderHeader()}
        <View style={styles.loadingContent}>
          <View style={[styles.skeletonHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LoadingSkeleton width={86} height={22} borderRadius={borderRadius.sm} />
            <LoadingSkeleton width={160} height={18} />
            <LoadingSkeleton width={190} height={72} />
            <LoadingSkeleton width="100%" height={8} borderRadius={4} />
            <LoadingSkeleton width={150} height={32} borderRadius={16} />
          </View>
          <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LoadingSkeleton width="45%" height={22} />
            <LoadingSkeleton width="100%" height={52} borderRadius={borderRadius.md} />
            <LoadingSkeleton width="100%" height={52} borderRadius={borderRadius.md} />
            <LoadingSkeleton width="100%" height={52} borderRadius={borderRadius.md} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  if (error || !prediction) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {renderHeader()}
        <ErrorState
          title={t('scorePrediction.noGroupTitle')}
          message={t('scorePrediction.noGroupDesc')}
          actionLabel={t('common.retry')}
          onAction={() => load()}
          style={styles.centered}
        />
      </SafeAreaView>
    );
  }

  // ── Unlock gate not passed — show progress checklist ─────────────────────────

  if (!prediction.has_sufficient_data) {
    const { unlock_progress } = prediction;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {renderHeader()}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {/* Unlock info card */}
          <FadeIn delay={100}>
            <Card style={styles.unlockCard}>
              <View style={styles.unlockIconWrap}>
                <Ionicons name="lock-closed" size={48} color={colors.primary} />
              </View>
              <Text style={[styles.unlockTitle, { color: colors.text }]}>
                {t('scorePrediction.unlockTitle')}
              </Text>
              <Text style={[styles.unlockDesc, { color: colors.textSecondary }]}>
                {t('scorePrediction.unlockDesc')}
              </Text>

              {/* Progress indicator */}
              <View style={styles.unlockProgressRow}>
                <Text style={[styles.unlockProgressText, { color: colors.primary }]}>
                  {unlock_progress.unlocked_count}/{unlock_progress.total_count} {t('scorePrediction.subjectsUnlocked')}
                </Text>
              </View>
            </Card>
          </FadeIn>

          {/* Subject checklist */}
          <FadeIn delay={200}>
            <Card style={styles.checklistCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scorePrediction.yourProgress')}
              </Text>
              <Stagger delay={50} initialDelay={0}>
                {unlock_progress.subjects_needed.map((subj: UnlockSubjectStatus) => {
                  const progressPct = Math.min((subj.questions_correct / subj.required_correct) * 100, 100);
                  return (
                    <View
                      key={subj.subject_id}
                      style={[styles.checklistRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.checklistLeft}>
                        {subj.is_unlocked ? (
                          <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                        ) : (
                          <Ionicons name="ellipse-outline" size={24} color={colors.border} />
                        )}
                        <View style={styles.checklistInfo}>
                          <Text
                            style={[
                              styles.checklistSubject,
                              { color: subj.is_unlocked ? colors.text : colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {subj.subject_name}
                          </Text>
                          <View style={[styles.checklistBarTrack, { backgroundColor: colors.border }]}>
                            <View
                              style={[
                                styles.checklistBarFill,
                                {
                                  width: `${progressPct}%` as any,
                                  backgroundColor: subj.is_unlocked ? '#10B981' : colors.primary,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.checklistCount,
                          { color: subj.is_unlocked ? '#10B981' : colors.textSecondary },
                        ]}
                      >
                        {Math.min(subj.questions_correct, subj.required_correct)}/{subj.required_correct}
                      </Text>
                    </View>
                  );
                })}
              </Stagger>
            </Card>
          </FadeIn>

          {/* Tip card */}
          <FadeIn delay={300}>
            <Card style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
                <Text style={[styles.infoTitle, { color: colors.text }]}>
                  {t('scorePrediction.unlockTip')}
                </Text>
              </View>
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {t('scorePrediction.unlockTipDesc')}
              </Text>
            </Card>
          </FadeIn>

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const stageISubjects = prediction.subject_breakdown.filter((s) => s.stage === 'first');
  const stageIISubjects = prediction.subject_breakdown.filter((s) => s.stage === 'second');

  const stageITotal = stageISubjects.reduce((sum, s) => sum + s.predicted_points, 0);
  const stageIITotal = stageIISubjects.reduce((sum, s) => sum + s.predicted_points, 0);
  const stageIMax = prediction.stage_i_max;
  const stageIIMax = prediction.stage_ii_max;
  const practicedSubjects = prediction.subject_breakdown.filter((s) => s.questions_attempted > 0).length;
  const confidenceVariant =
    prediction.confidence === 'high'
      ? 'success'
      : prediction.confidence === 'medium'
        ? 'info'
        : 'warning';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Nav header */}
      {renderHeader()}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Hero score card */}
        <FadeIn delay={100}>
          <Card style={styles.heroCard}>
            <View style={[styles.groupBadge, { backgroundColor: '#8B5CF620' }]}>
              <Text style={[styles.groupBadgeText, { color: '#8B5CF6' }]}>
                {t('scorePrediction.group')} {prediction.exam_group}
              </Text>
            </View>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
              {t('scorePrediction.predictedScore')}
            </Text>
            <View style={styles.heroScoreRow}>
              <AnimatedNumber
                value={prediction.predicted_score}
                duration={600}
                style={[styles.heroScore, { color: colors.text }]}
              />
              <Text style={[styles.heroMax, { color: colors.textSecondary }]}>
                /{prediction.max_possible_score}
              </Text>
            </View>

            {/* Progress bar */}
            <AnimatedProgress
              progress={prediction.predicted_percentage / 100}
              color="#8B5CF6"
              trackColor={colors.border}
              height={8}
              borderRadius={4}
              style={styles.heroProgress}
            />
            <Text style={[styles.heroPercent, { color: '#8B5CF6' }]}>
              {prediction.predicted_percentage}%
            </Text>

            {/* Confidence badge */}
            <StatusBadge
              label={`${t(`scorePrediction.confidence.${prediction.confidence}`)} ${t('scorePrediction.confidenceSuffix')}`}
              icon="analytics-outline"
              variant={confidenceVariant}
              style={styles.confBadge}
            />

            {/* Unpracticed subjects warning */}
            {prediction.unpracticed_subject_count > 0 && (
              <View style={[styles.unpracticedBanner, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#D97706" />
                <Text style={styles.unpracticedText}>
                  {t('scorePrediction.unpracticedWarning', { count: prediction.unpracticed_subject_count })}
                </Text>
              </View>
            )}

            {/* Disclaimer */}
            <Text style={[styles.disclaimerFull, { color: colors.textSecondary }]}>
              {t('scorePrediction.disclaimerFull')}
            </Text>
          </Card>
        </FadeIn>

        <FadeIn delay={180}>
          <Card style={styles.evidenceCard}>
            <SectionHeader
              title={t('scorePrediction.evidenceTitle')}
              subtitle={t('scorePrediction.evidenceSubtitle')}
              icon="shield-checkmark-outline"
              style={styles.evidenceHeader}
            />
            <View style={styles.evidenceRows}>
              <View style={[styles.evidenceRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.evidenceIcon, { backgroundColor: '#3B82F615' }]}>
                  <Ionicons name="checkmark-done-outline" size={18} color="#3B82F6" />
                </View>
                <View style={styles.evidenceTextBlock}>
                  <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>
                    {t('scorePrediction.answeredEvidence')}
                  </Text>
                  <Text style={[styles.evidenceValue, { color: colors.text }]}>
                    {prediction.total_questions_correct}/{prediction.total_questions_attempted}
                  </Text>
                </View>
              </View>
              <View style={[styles.evidenceRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.evidenceIcon, { backgroundColor: '#10B98115' }]}>
                  <Ionicons name="book-outline" size={18} color="#10B981" />
                </View>
                <View style={styles.evidenceTextBlock}>
                  <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>
                    {t('scorePrediction.practicedSubjects')}
                  </Text>
                  <Text style={[styles.evidenceValue, { color: colors.text }]}>
                    {practicedSubjects}/{prediction.subject_breakdown.length}
                  </Text>
                </View>
              </View>
              <View style={[styles.evidenceRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.evidenceIcon, { backgroundColor: '#F59E0B15' }]}>
                  <Ionicons name="trending-up-outline" size={18} color="#F59E0B" />
                </View>
                <View style={styles.evidenceTextBlock}>
                  <Text style={[styles.evidenceLabel, { color: colors.textSecondary }]}>
                    {t('scorePrediction.nextLift')}
                  </Text>
                  <Text style={[styles.evidenceValue, { color: colors.text }]} numberOfLines={2}>
                    {prediction.improvement_areas[0]?.subject_name ?? t('analytics.predictionEvidence.stable')}
                  </Text>
                </View>
              </View>
            </View>
          </Card>
        </FadeIn>

        {/* Stage breakdown summary */}
        <FadeIn delay={200}>
          <Card style={styles.stageCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('scorePrediction.stageSummary')}
            </Text>
            <View style={styles.stageRow}>
              <View style={styles.stageBlock}>
                <View style={[styles.stagePill, { backgroundColor: '#3B82F615' }]}>
                  <Text style={[styles.stagePillText, { color: '#3B82F6' }]}>
                    {t('scorePrediction.stageI')}
                  </Text>
                </View>
                <Text style={[styles.stageScore, { color: colors.text }]}>
                  {Math.round(stageITotal)}
                  <Text style={[styles.stageMax, { color: colors.textSecondary }]}>
                    {' '}/{stageIMax}
                  </Text>
                </Text>
              </View>
              {stageIISubjects.length > 0 && (
                <View style={styles.stageBlock}>
                  <View style={[styles.stagePill, { backgroundColor: '#8B5CF615' }]}>
                    <Text style={[styles.stagePillText, { color: '#8B5CF6' }]}>
                      {t('scorePrediction.stageII')}
                    </Text>
                  </View>
                  <Text style={[styles.stageScore, { color: colors.text }]}>
                    {Math.round(stageIITotal)}
                    <Text style={[styles.stageMax, { color: colors.textSecondary }]}>
                      {' '}/{stageIIMax}
                    </Text>
                  </Text>
                </View>
              )}
            </View>
          </Card>
        </FadeIn>

        {/* Subject breakdown */}
        <FadeIn delay={300}>
          <Card style={styles.breakdownCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('scorePrediction.subjectBreakdown')}
            </Text>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                  {t('scorePrediction.stageI')}
                </Text>
              </View>
              {stageIISubjects.length > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                    {t('scorePrediction.stageII')}
                  </Text>
                </View>
              )}
            </View>

            <Stagger delay={60} initialDelay={0}>
              {prediction.subject_breakdown.map((s, i) => renderSubjectBar(s, i))}
            </Stagger>
          </Card>
        </FadeIn>

        {/* Improvement areas */}
        {prediction.improvement_areas.length > 0 && (
          <FadeIn delay={400}>
            <Card style={styles.improvCard}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('scorePrediction.improvementAreas')}
              </Text>
              <Text style={[styles.improvSubtitle, { color: colors.textSecondary }]}>
                {t('scorePrediction.improvementSubtitle')}
              </Text>
              {prediction.improvement_areas.map((s, i) => (
                <View
                  key={`${s.subject_id}-${s.stage}`}
                  style={[styles.improvRow, { borderBottomColor: colors.border }]}
                >
                  <View style={[styles.improvRank, { backgroundColor: '#F59E0B20' }]}>
                    <Text style={styles.improvRankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.improvInfo}>
                    <Text style={[styles.improvSubject, { color: colors.text }]}>
                      {s.subject_name}{dualStageIds.has(s.subject_id) ? ` (${s.stage === 'first' ? t('scorePrediction.stageI') : t('scorePrediction.stageII')})` : ''}
                    </Text>
                    <Text style={[styles.improvDetail, { color: colors.textSecondary }]}>
                      {t('scorePrediction.currentAccuracy')}: {s.accuracy}%
                    </Text>
                  </View>
                  <View style={styles.improvGain}>
                    <Text style={styles.improvGainText}>
                      +{s.improvement_potential} {t('scorePrediction.pts')}
                    </Text>
                    <Text style={[styles.improvGainSub, { color: colors.textSecondary }]}>
                      {t('scorePrediction.ifAt80')}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </FadeIn>
        )}

        {/* How it works */}
        <FadeIn delay={500}>
          <Card style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.infoTitle, { color: colors.text }]}>
                {t('scorePrediction.howItWorks')}
              </Text>
            </View>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              {t('scorePrediction.howItWorksDesc')}
            </Text>
          </Card>
        </FadeIn>

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  navTitle: {
    flex: 1,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSizes.md,
  },
  loadingContent: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  skeletonHero: {
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.xl,
  },
  skeletonCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    padding: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Hero card
  heroCard: { marginBottom: spacing.md, alignItems: 'center', paddingVertical: spacing.xl },
  heroLabel: { fontSize: typography.fontSizes.sm, marginBottom: spacing.xs },
  heroScoreRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.md },
  heroScore: { fontSize: 64, fontWeight: '800', lineHeight: 72 },
  heroMax: { fontSize: typography.fontSizes.xl, fontWeight: '500', marginLeft: 4 },
  heroProgress: { alignSelf: 'stretch', marginBottom: spacing.xs },
  heroPercent: { fontSize: typography.fontSizes.xl, fontWeight: '700', marginBottom: spacing.md },
  confBadge: {
    marginBottom: spacing.sm,
  },
  confText: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
  disclaimerFull: { fontSize: typography.fontSizes.xs, textAlign: 'center', fontStyle: 'italic', lineHeight: 18 },

  // Evidence card
  evidenceCard: { marginBottom: spacing.md },
  evidenceHeader: { marginBottom: spacing.md },
  evidenceRows: { gap: spacing.sm },
  evidenceRow: {
    alignItems: 'center',
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    minHeight: 58,
    padding: spacing.sm,
  },
  evidenceIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    height: 36,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 36,
  },
  evidenceTextBlock: { flex: 1 },
  evidenceLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    marginBottom: 2,
  },
  evidenceValue: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
  },

  // Stage card
  stageCard: { marginBottom: spacing.md },
  stageRow: { flexDirection: 'row', gap: spacing.md },
  stageBlock: { flex: 1, alignItems: 'center' },
  stagePill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm, marginBottom: spacing.xs },
  stagePillText: { fontSize: typography.fontSizes.xs, fontWeight: '700' },
  stageScore: { fontSize: typography.fontSizes.xxl, fontWeight: '800' },
  stageMax: { fontSize: typography.fontSizes.sm, fontWeight: '400' },

  // Breakdown card
  breakdownCard: { marginBottom: spacing.md },
  sectionTitle: { fontSize: typography.fontSizes.md, fontWeight: typography.fontWeights.bold, marginBottom: spacing.sm },
  legend: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: typography.fontSizes.xs },

  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  subjectLeft: { flex: 1, marginRight: spacing.sm },
  subjectNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  subjectName: { fontSize: typography.fontSizes.sm, fontWeight: '600', flex: 1 },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFill: { height: '100%', borderRadius: 3 },
  subjectAccuracy: { fontSize: typography.fontSizes.xs },
  subjectRight: { alignItems: 'flex-end' },
  subjectPoints: { fontSize: typography.fontSizes.lg, fontWeight: '700' },
  subjectMaxPoints: { fontSize: typography.fontSizes.xs },

  // Improvement card
  improvCard: { marginBottom: spacing.md },
  improvSubtitle: { fontSize: typography.fontSizes.sm, marginBottom: spacing.md, lineHeight: 18 },
  improvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  improvRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  improvRankText: { fontSize: typography.fontSizes.sm, fontWeight: '700', color: '#F59E0B' },
  improvInfo: { flex: 1 },
  improvSubject: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
  improvDetail: { fontSize: typography.fontSizes.xs, marginTop: 2 },
  improvGain: { alignItems: 'flex-end' },
  improvGainText: { fontSize: typography.fontSizes.sm, fontWeight: '700', color: '#10B981' },
  improvGainSub: { fontSize: typography.fontSizes.xs, marginTop: 2 },

  // Info card
  infoCard: { marginBottom: spacing.md },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  infoTitle: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
  infoText: { fontSize: typography.fontSizes.sm, lineHeight: 20 },
  // Group badge
  groupBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  groupBadgeText: { fontSize: typography.fontSizes.xs, fontWeight: '700' },
  // Dual-stage inline tag
  dualStageTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dualStageTagText: { fontSize: 10, fontWeight: '700' },
  // Unpracticed banner
  unpracticedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  unpracticedText: { fontSize: typography.fontSizes.xs, color: '#D97706', flex: 1, lineHeight: 16 },

  // Unlock progress card
  unlockCard: {
    marginBottom: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  unlockIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8B5CF615',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  unlockTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  unlockDesc: {
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  unlockProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  unlockProgressText: {
    fontSize: typography.fontSizes.lg,
    fontWeight: '700',
  },

  // Checklist card
  checklistCard: { marginBottom: spacing.md },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  checklistLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checklistInfo: { flex: 1 },
  checklistSubject: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    marginBottom: 4,
  },
  checklistBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  checklistBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  checklistCount: {
    fontSize: typography.fontSizes.sm,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
});
