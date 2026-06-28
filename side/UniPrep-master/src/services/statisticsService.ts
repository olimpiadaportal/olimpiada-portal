import { supabase } from './supabase';
import i18n from '../i18n';
import {
  SubjectAnalytics,
  WeakTopic,
  StrongTopic,
  PerformanceInsight,
} from '../types/analytics';
import { ANALYTICS_THRESHOLDS, isWeakTopic } from '../constants/analytics';

/**
 * Get translated subject name based on current language
 */
const getTranslatedSubjectName = (subject: { name_en?: string; name_az?: string } | null): string => {
  if (!subject) return 'Unknown';
  const lang = i18n.language;
  if (lang === 'az' && subject.name_az) return subject.name_az;
  // Note: subjects table doesn't have name_ru, fallback to name_az for Russian users
  if (lang === 'ru' && subject.name_az) return subject.name_az;
  return subject.name_en || 'Unknown';
};

class StatisticsService {
  /**
   * Identify weak topics that need improvement
   * Uses industry-standard threshold: <70% accuracy, min 5 questions
   */
  async identifyWeakTopics(
    studentId: string,
    minQuestions: number = ANALYTICS_THRESHOLDS.MIN_QUESTIONS
  ): Promise<WeakTopic[]> {
    try {
      // Fetch study progress
      const { data: progressData, error } = await supabase
        .from('study_progress')
        .select(`
          *,
          subjects (
            id,
            name_en,
            name_az
          )
        `)
        .eq('student_id', studentId)
        .gte('questions_attempted', minQuestions);

      if (error) throw error;

      // Calculate weak topics using industry-standard threshold
      const weakTopics: WeakTopic[] = (progressData || [])
        .map((progress: any) => {
          const accuracy =
            progress.questions_attempted > 0
              ? (progress.questions_correct / progress.questions_attempted) * 100
              : 0;

          return {
            subject_id: progress.subject_id,
            subject_name: getTranslatedSubjectName(progress.subjects),
            accuracy: Math.round(accuracy * 10) / 10,
            questions_attempted: progress.questions_attempted,
            priority: this.calculatePriority(accuracy, progress.questions_attempted),
          };
        })
        .filter((topic: WeakTopic) => 
          isWeakTopic(topic.accuracy, topic.questions_attempted)
        );

      // Remove duplicates by subject_id
      const uniqueTopics = weakTopics.filter(
        (topic, index, self) =>
          index === self.findIndex((t) => t.subject_id === topic.subject_id)
      );

      // Sort by priority (high first) and then by accuracy (lowest first)
      return uniqueTopics.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.accuracy - b.accuracy;
      });
    } catch (error) {
      console.error('Error identifying weak topics:', error);
      return [];
    }
  }

  /**
   * Identify strong topics (strengths)
   * Uses industry-standard threshold: >=85% accuracy, min 5 questions
   */
  async identifyStrongTopics(
    studentId: string,
    minQuestions: number = ANALYTICS_THRESHOLDS.MIN_QUESTIONS
  ): Promise<StrongTopic[]> {
    try {
      // Fetch study progress
      const { data: progressData, error } = await supabase
        .from('study_progress')
        .select(`
          *,
          subjects (
            id,
            name_en,
            name_az
          )
        `)
        .eq('student_id', studentId)
        .gte('questions_attempted', minQuestions);

      if (error) throw error;

      // Calculate strong topics using industry-standard threshold
      const strongTopics: StrongTopic[] = (progressData || [])
        .map((progress: any) => {
          const accuracy =
            progress.questions_attempted > 0
              ? (progress.questions_correct / progress.questions_attempted) * 100
              : 0;

          return {
            subject_id: progress.subject_id,
            subject_name: getTranslatedSubjectName(progress.subjects),
            accuracy: Math.round(accuracy * 10) / 10,
            questions_attempted: progress.questions_attempted,
          };
        })
        .filter((topic: StrongTopic) => 
          topic.accuracy >= ANALYTICS_THRESHOLDS.STRONG_ACCURACY
        );

      // Remove duplicates by subject_id
      const uniqueTopics = strongTopics.filter(
        (topic, index, self) =>
          index === self.findIndex((t) => t.subject_id === topic.subject_id)
      );

      // Sort by accuracy (highest first)
      return uniqueTopics.sort((a, b) => b.accuracy - a.accuracy);
    } catch (error) {
      console.error('Error identifying strong topics:', error);
      return [];
    }
  }

  /**
   * Calculate priority for weak topics
   */
  private calculatePriority(
    accuracy: number,
    questionsAttempted: number
  ): 'high' | 'medium' | 'low' {
    // High priority: Very low accuracy or many questions with low accuracy
    if (accuracy < 50 || (accuracy < 60 && questionsAttempted > 30)) {
      return 'high';
    }
    // Medium priority: Moderate accuracy issues
    if (accuracy < 65) {
      return 'medium';
    }
    // Low priority: Slightly below target
    return 'low';
  }

  /**
   * Generate performance insights
   */
  async generateInsights(
    studentId: string,
    overallAccuracy: number,
    currentStreak: number,
    totalQuestionsAttempted: number
  ): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    try {
      // Insight 1: Overall performance
      if (overallAccuracy >= 85) {
        insights.push({
          type: 'strength',
          title: i18n.t('analytics.insightMessages.excellentPerformance.title'),
          description: i18n.t('analytics.insightMessages.excellentPerformance.description', { accuracy: overallAccuracy.toFixed(1) }),
          icon: '🌟',
          priority: 'high',
        });
      } else if (overallAccuracy >= 70) {
        insights.push({
          type: 'improvement',
          title: i18n.t('analytics.insightMessages.goodProgress.title'),
          description: i18n.t('analytics.insightMessages.goodProgress.description', { accuracy: overallAccuracy.toFixed(1) }),
          icon: '📈',
          priority: 'medium',
        });
      } else if (overallAccuracy < 70 && totalQuestionsAttempted > 50) {
        insights.push({
          type: 'weakness',
          title: i18n.t('analytics.insightMessages.needsImprovement.title'),
          description: i18n.t('analytics.insightMessages.needsImprovement.description', { accuracy: overallAccuracy.toFixed(1) }),
          icon: '⚠️',
          priority: 'high',
        });
      }

      // Insight 2: Streak motivation
      if (currentStreak >= 7) {
        insights.push({
          type: 'strength',
          title: i18n.t('analytics.insightMessages.amazingStreak.title'),
          description: i18n.t('analytics.insightMessages.amazingStreak.description', { streak: currentStreak }),
          icon: '🔥',
          priority: 'high',
        });
      } else if (currentStreak >= 3) {
        insights.push({
          type: 'improvement',
          title: i18n.t('analytics.insightMessages.buildingMomentum.title'),
          description: i18n.t('analytics.insightMessages.buildingMomentum.description', { streak: currentStreak }),
          icon: '💪',
          priority: 'medium',
        });
      } else if (currentStreak === 0) {
        insights.push({
          type: 'recommendation',
          title: i18n.t('analytics.insightMessages.startYourStreak.title'),
          description: i18n.t('analytics.insightMessages.startYourStreak.description'),
          icon: '🎯',
          priority: 'medium',
        });
      }

      // Insight 3: Practice volume
      if (totalQuestionsAttempted < 50) {
        insights.push({
          type: 'recommendation',
          title: i18n.t('analytics.insightMessages.practiceMore.title'),
          description: i18n.t('analytics.insightMessages.practiceMore.description'),
          icon: '📚',
          priority: 'medium',
        });
      } else if (totalQuestionsAttempted >= 200) {
        insights.push({
          type: 'strength',
          title: i18n.t('analytics.insightMessages.greatPracticeVolume.title'),
          description: i18n.t('analytics.insightMessages.greatPracticeVolume.description', { count: totalQuestionsAttempted }),
          icon: '🎓',
          priority: 'medium',
        });
      }

      // Insight 4: Weak topics with enhanced recommendations
      // This integrates with the Recommended Topics algorithm from Home screen
      const weakTopics = await this.identifyWeakTopics(studentId);
      if (weakTopics.length > 0) {
        // Show top 2 weak topics for more actionable insights
        const topWeakTopics = weakTopics.slice(0, 2);
        
        topWeakTopics.forEach((topic, index) => {
          const isHighPriority = topic.priority === 'high';
          insights.push({
            type: 'recommendation',
            title: index === 0 
              ? i18n.t('analytics.insightMessages.focusArea.title')
              : i18n.t('analytics.insightMessages.secondaryFocus.title'),
            description: i18n.t('analytics.insightMessages.focusArea.description', { 
              subject: topic.subject_name, 
              accuracy: topic.accuracy.toFixed(1) 
            }),
            icon: isHighPriority ? '🚨' : '🎯',
            priority: topic.priority,
          });
        });

        // Add spaced repetition insight if topics haven't been practiced recently
        if (weakTopics.length >= 3) {
          insights.push({
            type: 'recommendation',
            title: i18n.t('analytics.insightMessages.multipleWeakAreas.title'),
            description: i18n.t('analytics.insightMessages.multipleWeakAreas.description', {
              count: weakTopics.length
            }),
            icon: '📋',
            priority: 'medium',
          });
        }
      }

      // Insight 5: Strong topics
      const strongTopics = await this.identifyStrongTopics(studentId);
      if (strongTopics.length > 0) {
        const topStrong = strongTopics[0];
        insights.push({
          type: 'strength',
          title: i18n.t('analytics.insightMessages.yourStrength.title'),
          description: i18n.t('analytics.insightMessages.yourStrength.description', {
            subject: topStrong.subject_name,
            accuracy: topStrong.accuracy.toFixed(1)
          }),
          icon: '⭐',
          priority: 'low',
        });
      }

      // Insight 6: Balanced study recommendation
      // Encourage students to maintain strong areas while improving weak ones
      if (strongTopics.length > 0 && weakTopics.length > 0) {
        insights.push({
          type: 'recommendation',
          title: i18n.t('analytics.insightMessages.balancedStudy.title'),
          description: i18n.t('analytics.insightMessages.balancedStudy.description'),
          icon: '⚖️',
          priority: 'low',
        });
      }

      return insights;
    } catch (error) {
      console.error('Error generating insights:', error);
      return insights;
    }
  }

  /**
   * Calculate improvement rate (compare current vs previous period)
   */
  async calculateImprovementRate(
    studentId: string,
    currentPeriodDays: number = 7
  ): Promise<number> {
    try {
      const today = new Date();
      const currentStart = new Date(today);
      currentStart.setDate(today.getDate() - currentPeriodDays);

      const previousStart = new Date(currentStart);
      previousStart.setDate(currentStart.getDate() - currentPeriodDays);

      // Fetch current period stats
      const { data: currentStats, error: currentError } = await supabase
        .from('daily_stats')
        .select('questions_attempted, questions_correct')
        .eq('student_id', studentId)
        .gte('date', currentStart.toISOString().split('T')[0])
        .lte('date', today.toISOString().split('T')[0]);

      if (currentError) throw currentError;

      // Fetch previous period stats
      const { data: previousStats, error: previousError } = await supabase
        .from('daily_stats')
        .select('questions_attempted, questions_correct')
        .eq('student_id', studentId)
        .gte('date', previousStart.toISOString().split('T')[0])
        .lt('date', currentStart.toISOString().split('T')[0]);

      if (previousError) throw previousError;

      // Calculate accuracies
      const currentAccuracy = this.calculateAccuracyFromStats(currentStats || []);
      const previousAccuracy = this.calculateAccuracyFromStats(previousStats || []);

      // Calculate improvement rate
      if (previousAccuracy === 0) return 0;
      const improvementRate = ((currentAccuracy - previousAccuracy) / previousAccuracy) * 100;

      return Math.round(improvementRate * 10) / 10;
    } catch (error) {
      console.error('Error calculating improvement rate:', error);
      return 0;
    }
  }

  /**
   * Helper: Calculate accuracy from stats array
   */
  private calculateAccuracyFromStats(stats: any[]): number {
    const totalAttempted = stats.reduce((sum, s) => sum + (s.questions_attempted || 0), 0);
    const totalCorrect = stats.reduce((sum, s) => sum + (s.questions_correct || 0), 0);

    return totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;
  }

  /**
   * Get subject-wise performance comparison
   */
  async getSubjectComparison(
    studentId: string,
    subjectIds: string[]
  ): Promise<SubjectAnalytics[]> {
    try {
      const { data: progressData, error } = await supabase
        .from('study_progress')
        .select(`
          *,
          subjects (
            id,
            name_en,
            name_az
          )
        `)
        .eq('student_id', studentId)
        .in('subject_id', subjectIds);

      if (error) throw error;

      return (progressData || []).map((progress: any) => {
        const accuracy =
          progress.questions_attempted > 0
            ? (progress.questions_correct / progress.questions_attempted) * 100
            : 0;

        return {
          subject_id: progress.subject_id,
          subject_name: getTranslatedSubjectName(progress.subjects),
          questions_attempted: progress.questions_attempted || 0,
          questions_correct: progress.questions_correct || 0,
          accuracy: Math.round(accuracy * 10) / 10,
          study_time_minutes: progress.study_time_minutes || 0,
          last_practiced: progress.last_practiced_at,
        };
      });
    } catch (error) {
      console.error('Error getting subject comparison:', error);
      return [];
    }
  }

  /**
   * Calculate percentile rank (for comparison with other students)
   */
  async calculatePercentileRank(
    studentId: string,
    metric: 'accuracy' | 'questions' | 'study_time'
  ): Promise<number> {
    try {
      // This would require comparing with other students
      // For now, return a placeholder
      // TODO: Implement when leaderboard/comparison features are added
      return 0;
    } catch (error) {
      console.error('Error calculating percentile rank:', error);
      return 0;
    }
  }
}

export const statisticsService = new StatisticsService();
export default statisticsService;
