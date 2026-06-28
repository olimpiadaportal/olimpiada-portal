import { supabase } from './supabase';
import i18n from '../i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PredictionConfidence = 'low' | 'medium' | 'high';

/**
 * A single subject-in-stage entry in the prediction breakdown.
 *
 * DUAL-STAGE SUBJECTS: A subject appearing in BOTH Stage I and Stage II
 * (e.g. Mathematics: 100 pts Stage I, 150 pts Stage II) produces TWO entries.
 * Both read from the SAME prediction evidence row but apply different max_points.
 * This is industry-standard: treat each stage-slot as its own prediction unit
 * sharing the same mastery signal (practice accuracy/volume).
 */
export interface SubjectPrediction {
  subject_id: string;
  subject_name: string;
  stage: 'first' | 'second';
  /** Raw practice accuracy 0–100 (displayed to user) */
  accuracy: number;
  questions_attempted: number;
  questions_correct: number;
  max_points: number;
  /**
   * Predicted points = volume_weight × bayesian_accuracy/100 × max_points × REGRESSION_FACTOR
   * volume_weight = sqrt(correct / VOLUME_SATURATION_CORRECT)
   * This prevents inflated predictions from tiny easy-question samples.
   */
  predicted_points: number;
  /** 0–1: combined accuracy+volume confidence */
  confidence_factor: number;
  improvement_potential: number;
  is_unlocked: boolean;
}

/** Per-subject unlock status for the gate UI */
export interface UnlockSubjectStatus {
  subject_id: string;
  subject_name: string;
  stage: 'first' | 'second';
  questions_correct: number;
  required_correct: number;
  is_unlocked: boolean;
}

/** Returned when predictions are not yet unlocked */
export interface UnlockProgress {
  exam_group: string;
  subjects_needed: UnlockSubjectStatus[];
  unlocked_count: number;
  total_count: number;
  is_fully_unlocked: boolean;
}

export interface PredictionResult {
  exam_group: string;
  predicted_score: number;
  stage_i_max: number;
  stage_ii_max: number;
  max_possible_score: number;
  predicted_percentage: number;
  confidence: PredictionConfidence;
  subject_breakdown: SubjectPrediction[];
  improvement_areas: SubjectPrediction[];
  has_sufficient_data: boolean;
  total_questions_attempted: number;
  total_questions_correct: number;
  unpracticed_subject_count: number;
  /** Unlock progress (always present, even when fully unlocked) */
  unlock_progress: UnlockProgress;
}

// ─── Algorithm Constants ──────────────────────────────────────────────────────

/**
 * UNLOCK GATE: Minimum correctly-answered questions per unique subject
 * before predictions are shown. Dual-stage subjects count once.
 * 15 correct = ~1 solid practice session worth of demonstrated mastery.
 */
const UNLOCK_CORRECT_PER_SUBJECT = 15;

/**
 * VOLUME SATURATION: At this many correct answers, volume_weight = 1.0.
 * Below: volume_weight = sqrt(correct / 60).
 * 15 correct → 0.50, 30 → 0.71, 45 → 0.87, 60 → 1.0.
 * This is the KEY anti-inflation mechanism.
 */
const VOLUME_SATURATION_CORRECT = 60;

/** Bayesian prior accuracy (%) — conservative 50% for 4-option MCQ */
const PRIOR_ACCURACY = 50;

/** Bayesian prior weight (pseudo-observations) */
const PRIOR_WEIGHT = 20;

/** Regression discount for real exam conditions (12% lower than practice) */
const REGRESSION_FACTOR = 0.88;

/** Target accuracy for improvement-potential calculation */
const TARGET_ACCURACY = 80;

/** Confidence thresholds based on total correct answers across all subjects */
const HIGH_CONFIDENCE_TOTAL_CORRECT = 200;
const MEDIUM_CONFIDENCE_TOTAL_CORRECT = 60;

// ─── Pure algorithm helpers ───────────────────────────────────────────────────

/**
 * Bayesian-adjusted accuracy.
 * With 0 attempts → 0 (no data = no score, not prior).
 * With n attempts → shrinks toward PRIOR_ACCURACY, diminishing as n grows.
 */
function bayesianAccuracy(questionsCorrect: number, questionsAttempted: number): number {
  if (questionsAttempted === 0) return 0;
  const observed = (questionsCorrect / questionsAttempted) * 100;
  return (PRIOR_WEIGHT * PRIOR_ACCURACY + questionsAttempted * observed) / (PRIOR_WEIGHT + questionsAttempted);
}

/**
 * Volume weight: how much to trust the accuracy signal.
 * sqrt(correct / 60), capped at 1.0.
 * A student with 5 correct at 100% gets 0.29 weight → 71% discount.
 * A student with 60 correct at 80% gets 1.0 weight → full trust.
 */
function volumeWeight(questionsCorrect: number): number {
  return Math.min(Math.sqrt(questionsCorrect / VOLUME_SATURATION_CORRECT), 1.0);
}

// ─── Localised name helper ────────────────────────────────────────────────────

function localSubjectName(subject: { name_en: string; name_az: string | null }): string {
  const lang = i18n.language;
  if ((lang === 'az' || lang === 'ru') && subject.name_az) return subject.name_az;
  return subject.name_en;
}

// ─── Internal slot type ───────────────────────────────────────────────────────

interface ExamSlot {
  subject_id: string;
  subject_name_en: string;
  subject_name_az: string | null;
  stage: 'first' | 'second';
  max_points: number;
}

interface PredictionEvidence {
  subject_id: string;
  attempted: number;
  correct: number;
  effectiveAttempted: number;
  effectiveCorrect: number;
  coverageTopics: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ScorePredictionService {
  private async fetchPredictionEvidence(
    studentId: string,
    subjectIds: string[]
  ): Promise<Map<string, PredictionEvidence>> {
    if (subjectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabase.rpc('get_score_prediction_evidence', {
      p_student_id: studentId,
      p_subject_ids: subjectIds,
    });

    if (!error && data) {
      return new Map(
        (data as any[]).map((row) => {
          const attempted = Number(row.questions_attempted ?? 0);
          const correct = Number(row.questions_correct ?? 0);
          const effectiveAttempted = Number(row.weighted_attempted ?? attempted);
          const effectiveCorrect = Number(row.weighted_correct ?? correct);

          return [
            row.subject_id as string,
            {
              subject_id: row.subject_id as string,
              attempted,
              correct,
              effectiveAttempted,
              effectiveCorrect,
              coverageTopics: Number(row.coverage_topics ?? 0),
            },
          ];
        })
      );
    }

    console.warn('Prediction evidence RPC unavailable, falling back to study_progress:', error);

    const { data: progressRows, error: progressError } = await supabase
      .from('study_progress')
      .select('subject_id, questions_attempted, questions_correct')
      .eq('student_id', studentId)
      .in('subject_id', subjectIds);

    if (progressError) {
      console.warn('Legacy study_progress lookup failed during prediction:', progressError);
    }

    return new Map(
      (progressRows ?? []).map((row: any) => {
        const attempted = Number(row.questions_attempted ?? 0);
        const correct = Number(row.questions_correct ?? 0);

        return [
          row.subject_id as string,
          {
            subject_id: row.subject_id as string,
            attempted,
            correct,
            effectiveAttempted: attempted,
            effectiveCorrect: correct,
            coverageTopics: 0,
          },
        ];
      })
    );
  }

  /**
   * Core prediction algorithm v2 — volume-weighted with unlock gate.
   *
   * KEY CHANGES FROM v1:
   * 1. UNLOCK GATE: Predictions hidden until ALL unique subjects have ≥15 correct answers.
   * 2. VOLUME-WEIGHTED: predicted_points = volume_weight × bayesian_accuracy × max_points × regression
   *    This prevents inflated predictions from tiny easy-question samples.
   * 3. DUAL-STAGE SHARING: Same subject in Stage I + II shares one prediction evidence row.
   */
  async predictScore(studentId: string, groupCode: string): Promise<PredictionResult> {
    // ── 1. Fetch exam group + subjects from DB ────────────────────────────────
    const { data: groupData, error: groupError } = await supabase
      .from('exam_groups')
      .select(`
        code,
        first_stage_max_points,
        second_stage_max_points,
        has_second_stage,
        exam_group_subjects (
          subject_id,
          stage,
          coefficient,
          is_active,
          subjects ( id, name_en, name_az )
        )
      `)
      .eq('code', groupCode)
      .eq('is_active', true)
      .single();

    if (groupError || !groupData) {
      throw new Error(`Exam group '${groupCode}' not found in database`);
    }

    const stageIMax: number = (groupData as any).first_stage_max_points;
    const stageIIMax: number = (groupData as any).second_stage_max_points;
    const maxPossibleScore = stageIMax + stageIIMax;

    // ── 2. Build exam slots with computed max_points ──────────────────────────
    const activeSlots: any[] = ((groupData as any).exam_group_subjects ?? [])
      .filter((gs: any) => gs.is_active);

    const stageICoeffTotal = activeSlots
      .filter((gs: any) => gs.stage === 'first')
      .reduce((sum: number, gs: any) => sum + Number(gs.coefficient), 0);

    const stageIICoeffTotal = activeSlots
      .filter((gs: any) => gs.stage === 'second')
      .reduce((sum: number, gs: any) => sum + Number(gs.coefficient), 0);

    const examSlots: ExamSlot[] = activeSlots.map((gs: any) => {
      const subj = gs.subjects as { id: string; name_en: string; name_az: string | null } | null;
      const stageMax = gs.stage === 'first' ? stageIMax : stageIIMax;
      const coeffTotal = gs.stage === 'first' ? stageICoeffTotal : stageIICoeffTotal;
      const maxPoints = coeffTotal > 0
        ? Math.round((Number(gs.coefficient) / coeffTotal) * stageMax)
        : 0;
      return {
        subject_id: gs.subject_id as string,
        subject_name_en: subj?.name_en ?? '',
        subject_name_az: subj?.name_az ?? null,
        stage: gs.stage as 'first' | 'second',
        max_points: maxPoints,
      };
    });

    // Dual-stage subjects share one evidence row (same subject_id).
    const uniqueSubjectIds = Array.from(new Set(examSlots.map((s) => s.subject_id)));
    const evidenceById = await this.fetchPredictionEvidence(studentId, uniqueSubjectIds);

    // ── 4. Build unlock progress (per unique subject) ─────────────────────────
    // For dual-stage subjects, we only check unlock once (by unique subject_id).
    const unlockStatuses: UnlockSubjectStatus[] = [];
    const seenForUnlock = new Set<string>();

    for (const slot of examSlots) {
      if (seenForUnlock.has(slot.subject_id)) continue;
      seenForUnlock.add(slot.subject_id);

      const evidence = evidenceById.get(slot.subject_id);
      const correct = evidence?.correct ?? 0;
      const isUnlocked = correct >= UNLOCK_CORRECT_PER_SUBJECT;

      unlockStatuses.push({
        subject_id: slot.subject_id,
        subject_name: localSubjectName({ name_en: slot.subject_name_en, name_az: slot.subject_name_az }),
        stage: slot.stage, // first occurrence's stage (for display grouping)
        questions_correct: correct,
        required_correct: UNLOCK_CORRECT_PER_SUBJECT,
        is_unlocked: isUnlocked,
      });
    }

    const unlockedCount = unlockStatuses.filter((s) => s.is_unlocked).length;
    // A group with no subjects should NOT be considered "fully unlocked"
    // It means the group hasn't been configured yet
    const hasSubjects = unlockStatuses.length > 0;
    const isFullyUnlocked = hasSubjects && unlockedCount === unlockStatuses.length;

    const unlockProgress: UnlockProgress = {
      exam_group: groupCode,
      subjects_needed: unlockStatuses,
      unlocked_count: unlockedCount,
      total_count: unlockStatuses.length,
      is_fully_unlocked: isFullyUnlocked,
    };

    // ── 5. Build SubjectPrediction for each slot ──────────────────────────────
    const subjectPredictions: SubjectPrediction[] = [];
    let unpracticedCount = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;

    for (const slot of examSlots) {
      const evidence = evidenceById.get(slot.subject_id);
      const attempted = evidence?.attempted ?? 0;
      const correct = evidence?.correct ?? 0;
      const effectiveAttempted = evidence?.effectiveAttempted ?? attempted;
      const effectiveCorrect = evidence?.effectiveCorrect ?? correct;
      const observedAccuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

      // Subject is "unlocked" if it meets the gate threshold
      const subjectUnlocked = correct >= UNLOCK_CORRECT_PER_SUBJECT;
      if (attempted === 0) unpracticedCount++;

      // ── Volume-weighted Bayesian prediction ─────────────────────────────────
      // adjAccuracy: Bayesian-shrunk accuracy (0 if no attempts)
      const adjAccuracy = bayesianAccuracy(effectiveCorrect, effectiveAttempted);

      // volWeight: sqrt(correct / 60), capped at 1.0
      // This is the KEY anti-inflation mechanism.
      const volWeight = volumeWeight(effectiveCorrect);

      // predictedPoints = volWeight × (adjAccuracy/100) × maxPoints × regression
      // If gate not passed globally, we still compute but UI won't show.
      const predictedPoints = volWeight * (adjAccuracy / 100) * slot.max_points * REGRESSION_FACTOR;

      // Improvement potential: gap to 80% accuracy × max_points × regression
      const improvementPotential =
        adjAccuracy < TARGET_ACCURACY
          ? ((TARGET_ACCURACY - adjAccuracy) / 100) * slot.max_points * REGRESSION_FACTOR
          : 0;

      // Confidence factor for this slot: volume weight itself (0–1)
      const confidenceFactor = volWeight;

      subjectPredictions.push({
        subject_id: slot.subject_id,
        subject_name: localSubjectName({ name_en: slot.subject_name_en, name_az: slot.subject_name_az }),
        stage: slot.stage,
        accuracy: Math.round(observedAccuracy * 10) / 10,
        questions_attempted: attempted,
        questions_correct: correct,
        max_points: slot.max_points,
        predicted_points: Math.round(predictedPoints * 10) / 10,
        confidence_factor: Math.round(confidenceFactor * 100) / 100,
        improvement_potential: Math.round(improvementPotential * 10) / 10,
        is_unlocked: subjectUnlocked,
      });

      // Aggregate totals (count each unique subject only once)
      // But for slots, we want total across all slots for display.
      // Actually, for dual-stage we should NOT double-count.
      // We'll aggregate unique subjects separately below.
    }

    // Aggregate totals from unique subjects (not slots)
    for (const status of unlockStatuses) {
      const evidence = evidenceById.get(status.subject_id);
      totalAttempted += evidence?.attempted ?? 0;
      totalCorrect += evidence?.correct ?? 0;
    }

    // ── 6. Aggregate prediction ───────────────────────────────────────────────
    const predictedScore = Math.round(
      subjectPredictions.reduce((sum, s) => sum + s.predicted_points, 0)
    );
    const predictedPercentage = maxPossibleScore > 0
      ? Math.round((predictedScore / maxPossibleScore) * 100)
      : 0;

    // Overall confidence: based on total correct answers across all subjects
    let confidence: PredictionConfidence = 'low';
    if (totalCorrect >= HIGH_CONFIDENCE_TOTAL_CORRECT) confidence = 'high';
    else if (totalCorrect >= MEDIUM_CONFIDENCE_TOTAL_CORRECT) confidence = 'medium';

    // has_sufficient_data: true only if gate is fully unlocked
    const hasSufficientData = isFullyUnlocked;

    // Top 3 improvement areas
    const improvementAreas = [...subjectPredictions]
      .filter((s) => s.accuracy < TARGET_ACCURACY)
      .sort((a, b) => b.improvement_potential - a.improvement_potential)
      .slice(0, 3);

    // Sort: Stage I first, then Stage II; within stage by accuracy ascending
    const sortedBreakdown = [...subjectPredictions].sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === 'first' ? -1 : 1;
      return a.accuracy - b.accuracy;
    });

    return {
      exam_group: groupCode,
      predicted_score: predictedScore,
      stage_i_max: stageIMax,
      stage_ii_max: stageIIMax,
      max_possible_score: maxPossibleScore,
      predicted_percentage: predictedPercentage,
      confidence,
      subject_breakdown: sortedBreakdown,
      improvement_areas: improvementAreas,
      has_sufficient_data: hasSufficientData,
      total_questions_attempted: totalAttempted,
      total_questions_correct: totalCorrect,
      unpracticed_subject_count: unpracticedCount,
      unlock_progress: unlockProgress,
    };
  }

  /**
   * Fetch the student's exam group code from their profile.
   * Handles both raw codes ('IV') and display names ('IV qrup', 'Group IV').
   */
  async getStudentGroupCode(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('students')
      .select('target_group')
      .eq('user_id', userId)
      .single();
    if (error || !data?.target_group) return null;
    
    const rawValue = data.target_group as string;
    
    // If it's already a valid code, return as-is
    const validCodes = ['I', 'II', 'III', 'IV', 'V'];
    if (validCodes.includes(rawValue)) {
      return rawValue;
    }
    
    // Extract Roman numeral from display names like 'IV qrup', 'Group IV', 'Qrup IV', etc.
    const romanMatch = rawValue.match(/\b(I{1,3}|IV|V)\b/i);
    if (romanMatch) {
      return romanMatch[1].toUpperCase();
    }
    
    // Fallback: try to find by querying exam_groups table
    const { data: groupData } = await supabase
      .from('exam_groups')
      .select('code')
      .or(`code.eq.${rawValue},name_en.ilike.%${rawValue}%,name_az.ilike.%${rawValue}%`)
      .single();
    
    return groupData?.code || null;
  }

  /**
   * Convenience: fetch group code + predict in one call.
   */
  async predictScoreForUser(userId: string, studentId: string): Promise<PredictionResult | null> {
    const groupCode = await this.getStudentGroupCode(userId);
    if (!groupCode) return null;
    return this.predictScore(studentId, groupCode);
  }
}

export const scorePredictionService = new ScorePredictionService();
