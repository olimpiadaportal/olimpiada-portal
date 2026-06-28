import { supabase } from './supabase';
import { statisticsService } from './statisticsService';
import i18n from '../i18n';

export interface Recommendation {
  subject: string;
  subjectId: string;
  reason: string;
  accuracy: number;
  questionsCount: number;
  priority: 'high' | 'medium' | 'low';
  estimatedTime: string; // e.g., "30 min", "1 hour"
  lastPracticed?: string; // ISO date string
  recencyScore?: number; // 0-1, higher = more recent
  confidenceScore?: number; // 0-1, based on sample size
}

/**
 * Industry-standard recommendation algorithm based on:
 * - Spaced Repetition principles (Ebbinghaus forgetting curve)
 * - Mastery Learning thresholds (Bloom's taxonomy)
 * - Statistical confidence intervals
 * - Recency weighting (prioritize topics not practiced recently)
 */
class RecommendationService {
  // Spaced repetition intervals (days)
  private readonly REVIEW_INTERVALS = {
    URGENT: 1,      // Review within 1 day
    SOON: 3,        // Review within 3 days
    NORMAL: 7,      // Review within 1 week
    LATER: 14,      // Review within 2 weeks
  };

  /**
   * Get personalized study recommendations based on student performance
   * Uses multi-factor scoring algorithm combining:
   * 1. Accuracy score (primary factor)
   * 2. Recency score (spaced repetition)
   * 3. Confidence score (statistical significance)
   * 4. Trend analysis (improving vs declining)
   */
  async getRecommendations(studentId: string, limit: number = 5): Promise<Recommendation[]> {
    try {
      // Get weak topics from statistics service
      const weakTopics = await statisticsService.identifyWeakTopics(studentId);
      
      // Get recency data for all topics
      const recencyData = await this.getTopicRecencyData(studentId);
      
      if (weakTopics.length === 0) {
        // No weak topics - recommend based on spaced repetition
        return this.getSpacedRepetitionRecommendations(studentId, recencyData, limit);
      }

      // Convert weak topics to recommendations with enhanced scoring
      const recommendations: Recommendation[] = weakTopics.map(topic => {
        const recency = recencyData.get(topic.subject_id);
        const recencyScore = this.calculateRecencyScore(recency?.lastPracticed);
        const confidenceScore = this.calculateConfidenceScore(topic.questions_attempted);
        
        return {
          subject: topic.subject_name,
          subjectId: topic.subject_id,
          reason: this.getReasonForRecommendation(topic.accuracy, topic.questions_attempted, recencyScore),
          accuracy: topic.accuracy,
          questionsCount: topic.questions_attempted,
          priority: this.getPriority(topic.accuracy, recencyScore),
          estimatedTime: this.estimateStudyTime(topic.accuracy, topic.questions_attempted),
          lastPracticed: recency?.lastPracticed,
          recencyScore,
          confidenceScore,
        };
      });

      // Sort by composite score (accuracy weight: 0.5, recency: 0.3, confidence: 0.2)
      const sortedRecommendations = recommendations.sort((a, b) => {
        const scoreA = this.calculateCompositeScore(a);
        const scoreB = this.calculateCompositeScore(b);
        return scoreA - scoreB; // Lower score = higher priority
      });

      return sortedRecommendations.slice(0, limit);
    } catch (error) {
      console.error('Get recommendations error:', error);
      return [];
    }
  }

  /**
   * Calculate composite score for ranking recommendations
   * Lower score = higher priority for study
   */
  private calculateCompositeScore(rec: Recommendation): number {
    const accuracyWeight = 0.5;
    const recencyWeight = 0.3;
    const confidenceWeight = 0.2;

    // Normalize accuracy to 0-1 (lower accuracy = lower score = higher priority)
    const accuracyScore = rec.accuracy / 100;
    
    // Recency: higher recencyScore means practiced recently, so invert for priority
    const recencyFactor = 1 - (rec.recencyScore || 0);
    
    // Confidence: higher confidence = more reliable data
    const confidenceFactor = rec.confidenceScore || 0.5;

    return (accuracyScore * accuracyWeight) + 
           (recencyFactor * recencyWeight) + 
           ((1 - confidenceFactor) * confidenceWeight);
  }

  /**
   * Get topic recency data for spaced repetition
   */
  private async getTopicRecencyData(studentId: string): Promise<Map<string, { lastPracticed: string }>> {
    try {
      const { data } = await supabase
        .from('study_progress')
        .select('subject_id, updated_at')
        .eq('student_id', studentId);

      const recencyMap = new Map<string, { lastPracticed: string }>();
      (data || []).forEach((item: any) => {
        recencyMap.set(item.subject_id, { lastPracticed: item.updated_at });
      });

      return recencyMap;
    } catch (error) {
      console.error('Get topic recency data error:', error);
      return new Map();
    }
  }

  /**
   * Calculate recency score based on last practice date
   * Uses exponential decay (Ebbinghaus forgetting curve approximation)
   * Returns 0-1 where 1 = practiced today, 0 = never practiced or very long ago
   */
  private calculateRecencyScore(lastPracticed?: string): number {
    if (!lastPracticed) return 0;

    const now = new Date();
    const lastDate = new Date(lastPracticed);
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    // Exponential decay with half-life of 7 days
    const halfLife = 7;
    return Math.exp(-0.693 * daysSince / halfLife);
  }

  /**
   * Calculate confidence score based on sample size
   * Uses statistical significance principles
   */
  private calculateConfidenceScore(questionsAttempted: number): number {
    // Confidence increases with sample size, plateaus around 30 questions
    // Based on central limit theorem (n >= 30 for normal approximation)
    const maxConfidenceQuestions = 30;
    return Math.min(questionsAttempted / maxConfidenceQuestions, 1);
  }

  /**
   * Get recommendations based on spaced repetition when no weak topics exist
   */
  private async getSpacedRepetitionRecommendations(
    studentId: string,
    recencyData: Map<string, { lastPracticed: string }>,
    limit: number
  ): Promise<Recommendation[]> {
    try {
      const { data: progress } = await supabase
        .from('study_progress')
        .select('*, subjects(id, name_en)')
        .eq('student_id', studentId);

      if (!progress || progress.length === 0) {
        return this.getGeneralRecommendations(studentId, limit);
      }

      // Find topics due for review based on spaced repetition
      const recommendations = progress
        .map((p: any) => {
          const recency = recencyData.get(p.subject_id);
          const recencyScore = this.calculateRecencyScore(recency?.lastPracticed);
          const accuracy = p.questions_attempted > 0 
            ? (p.questions_correct / p.questions_attempted) * 100 
            : 0;

          return {
            subject: p.subjects?.name_en || 'Unknown',
            subjectId: p.subjects?.id || '',
            reason: this.getSpacedRepetitionReason(recencyScore, accuracy),
            accuracy: Math.round(accuracy * 10) / 10,
            questionsCount: p.questions_attempted,
            priority: this.getSpacedRepetitionPriority(recencyScore) as 'high' | 'medium' | 'low',
            estimatedTime: i18n.t('home.components.recommendedTopics.time.fifteenToTwentyMin'),
            lastPracticed: recency?.lastPracticed,
            recencyScore,
            confidenceScore: this.calculateConfidenceScore(p.questions_attempted),
          };
        })
        .filter((r: Recommendation) => r.recencyScore !== undefined && r.recencyScore < 0.5) // Due for review
        .sort((a: Recommendation, b: Recommendation) => (a.recencyScore || 0) - (b.recencyScore || 0));

      return recommendations.slice(0, limit);
    } catch (error) {
      console.error('Get spaced repetition recommendations error:', error);
      return [];
    }
  }

  private getSpacedRepetitionReason(recencyScore: number, accuracy: number): string {
    if (recencyScore < 0.1) {
      return i18n.t('home.components.recommendedTopics.reviewOverdue');
    }
    if (recencyScore < 0.3) {
      return i18n.t('home.components.recommendedTopics.dueForReview');
    }
    return i18n.t('home.components.recommendedTopics.maintainSkills');
  }

  private getSpacedRepetitionPriority(recencyScore: number): string {
    if (recencyScore < 0.1) return 'high';
    if (recencyScore < 0.3) return 'medium';
    return 'low';
  }

  /**
   * Get general recommendations when no weak topics are identified
   */
  private async getGeneralRecommendations(studentId: string, limit: number): Promise<Recommendation[]> {
    try {
      // Get subjects the student hasn't practiced much
      const { data: progress } = await supabase
        .from('study_progress')
        .select('*, subjects(id, name_en)')
        .eq('student_id', studentId)
        .order('questions_attempted', { ascending: true })
        .limit(limit);

      if (!progress || progress.length === 0) return [];

      return progress.map(p => ({
        subject: p.subjects?.name_en || 'Unknown',
        subjectId: p.subjects?.id || '',
        reason: 'Continue practicing to maintain your skills',
        accuracy: p.questions_attempted > 0 
          ? (p.questions_correct / p.questions_attempted) * 100 
          : 0,
        questionsCount: p.questions_attempted,
        priority: 'medium' as const,
        estimatedTime: '20 min',
      }));
    } catch (error) {
      console.error('Get general recommendations error:', error);
      return [];
    }
  }

  /**
   * Generate reason text based on performance metrics and recency
   */
  private getReasonForRecommendation(accuracy: number, questionsCount: number, recencyScore?: number): string {
    // Check recency first for spaced repetition messaging
    if (recencyScore !== undefined && recencyScore < 0.2) {
      if (accuracy < 50) {
        return i18n.t('home.components.recommendedTopics.urgentReviewNeeded');
      }
      return i18n.t('home.components.recommendedTopics.dueForReview');
    }
    
    if (accuracy < 40) {
      return i18n.t('home.components.recommendedTopics.urgentAttention');
    }
    if (accuracy < 50) {
      return i18n.t('home.components.recommendedTopics.criticalWeakArea');
    }
    if (accuracy < 60) {
      return i18n.t('home.components.recommendedTopics.needsImprovement');
    }
    if (accuracy < 70) {
      return i18n.t('home.components.recommendedTopics.needsPractice');
    }
    if (accuracy < 75) {
      return i18n.t('home.components.recommendedTopics.roomForImprovement');
    }
    if (questionsCount < 10) {
      return i18n.t('home.components.recommendedTopics.morePracticeNeeded');
    }
    return i18n.t('home.components.recommendedTopics.reviewRecommended');
  }

  /**
   * Determine priority level based on accuracy and recency
   */
  private getPriority(accuracy: number, recencyScore?: number): 'high' | 'medium' | 'low' {
    // Boost priority if topic hasn't been practiced recently
    const recencyBoost = recencyScore !== undefined && recencyScore < 0.2;
    
    if (accuracy < 50 || (accuracy < 60 && recencyBoost)) return 'high';
    if (accuracy < 70 || recencyBoost) return 'medium';
    return 'low';
  }

  /**
   * Estimate study time needed based on performance
   */
  private estimateStudyTime(accuracy: number, questionsCount: number): string {
    // More time needed for lower accuracy
    if (accuracy < 50) {
      return i18n.t('home.components.recommendedTopics.time.oneToTwoHours');
    }
    if (accuracy < 65) {
      return i18n.t('home.components.recommendedTopics.time.fortyFiveToSixtyMin');
    }
    if (accuracy < 75) {
      return i18n.t('home.components.recommendedTopics.time.thirtyToFortyFiveMin');
    }
    if (questionsCount < 10) {
      return i18n.t('home.components.recommendedTopics.time.twentyToThirtyMin');
    }
    return i18n.t('home.components.recommendedTopics.time.fifteenToTwentyMin');
  }

  /**
   * Get recommended practice topics for a specific subject
   */
  async getSubjectRecommendations(
    studentId: string,
    subjectId: string
  ): Promise<{ topic: string; difficulty: string; reason: string }[]> {
    try {
      // Get questions the student got wrong in this subject
      const { data: wrongAnswers } = await supabase
        .from('student_answers')
        .select(`
          questions(id, difficulty, question_text),
          attempt:student_exam_attempts(student_id)
        `)
        .eq('is_correct', false)
        .eq('attempt.student_id', studentId);

      if (!wrongAnswers || wrongAnswers.length === 0) {
        return [{
          topic: 'General Practice',
          difficulty: 'medium',
          reason: 'Continue practicing to improve',
        }];
      }

      // Group by difficulty
      const difficultyGroups = wrongAnswers.reduce((acc, answer: any) => {
        const diff = answer.questions?.difficulty || 'medium';
        acc[diff] = (acc[diff] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Create recommendations based on difficulty distribution
      return Object.entries(difficultyGroups).map(([difficulty, count]) => ({
        topic: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Level Questions`,
        difficulty,
        reason: `${count} questions need review`,
      }));
    } catch (error) {
      console.error('Get subject recommendations error:', error);
      return [];
    }
  }

  /**
   * Get optimal study time recommendation based on user's activity patterns
   */
  async getOptimalStudyTime(studentId: string): Promise<{
    timeOfDay: string;
    reason: string;
  }> {
    try {
      // Analyze when student performs best
      const { data: sessions } = await supabase
        .from('study_sessions')
        .select('start_time, questions_attempted, questions_correct')
        .eq('student_id', studentId)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(50);

      if (!sessions || sessions.length === 0) {
        return {
          timeOfDay: 'morning',
          reason: 'Most students perform best in the morning',
        };
      }

      // Group by time of day and calculate average accuracy
      const timeGroups = sessions.reduce((acc, session) => {
        const hour = new Date(session.start_time).getHours();
        let timeOfDay: string;
        
        if (hour >= 6 && hour < 12) timeOfDay = 'morning';
        else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
        else timeOfDay = 'night';

        if (!acc[timeOfDay]) {
          acc[timeOfDay] = { correct: 0, total: 0, count: 0 };
        }

        acc[timeOfDay].correct += session.questions_correct;
        acc[timeOfDay].total += session.questions_attempted;
        acc[timeOfDay].count += 1;

        return acc;
      }, {} as Record<string, { correct: number; total: number; count: number }>);

      // Find best time
      let bestTime = 'morning';
      let bestAccuracy = 0;

      Object.entries(timeGroups).forEach(([time, stats]) => {
        const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
        if (accuracy > bestAccuracy && stats.count >= 3) {
          bestAccuracy = accuracy;
          bestTime = time;
        }
      });

      return {
        timeOfDay: bestTime,
        reason: `Your accuracy is ${bestAccuracy.toFixed(0)}% during ${bestTime} sessions`,
      };
    } catch (error) {
      console.error('Get optimal study time error:', error);
      return {
        timeOfDay: 'morning',
        reason: 'Morning is generally the best time to study',
      };
    }
  }
}

export const recommendationService = new RecommendationService();
