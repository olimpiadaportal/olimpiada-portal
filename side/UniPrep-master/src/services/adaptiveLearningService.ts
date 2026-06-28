/**
 * Adaptive Learning Service
 * 
 * Manages topic-level performance tracking and adaptive difficulty
 * for competitive mode questions.
 * 
 * Features:
 * - Track individual question results
 * - Detect weak topics from performance history
 * - Calculate recent accuracy for adaptive difficulty
 * - Determine if first session (diagnostic) or subsequent (personalized)
 */

import { supabase } from './supabase';

export interface QuestionResult {
  sessionId: string;
  studentId: string;
  subjectId: string;
  questionId: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  studentAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  timeSpent: number; // in seconds
}

export interface WeakTopic {
  topic: string;
  totalQuestions: number;
  correctQuestions: number;
  accuracy: number;
}

// Stage 7: subtopic-level weak area tracking
export interface WeakSubtopic {
  subtopicId: string;
  subtopicName: string;
  topic: string;
  totalQuestions: number;
  correctQuestions: number;
  accuracy: number;
}

export interface TopicPerformance {
  topic: string;
  totalQuestions: number;
  correctQuestions: number;
  accuracy: number;
  avgTimeSpent: number;
  lastAttempted: string;
}

export interface DifficultyMix {
  easy: number;
  medium: number;
  hard: number;
  description: string;
}

class AdaptiveLearningService {
  /**
   * Save question results to database for adaptive learning
   */
  async saveQuestionResults(results: QuestionResult[]): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`💾 Saving ${results.length} question results...`);

      const { error } = await supabase
        .from('competitive_question_results')
        .insert(
          results.map(r => ({
            session_id: r.sessionId,
            student_id: r.studentId,
            subject_id: r.subjectId,
            question_id: r.questionId,
            topic: r.topic,
            difficulty: r.difficulty,
            student_answer: r.studentAnswer,
            correct_answer: r.correctAnswer,
            is_correct: r.isCorrect,
            time_spent: r.timeSpent,
          }))
        );

      if (error) {
        console.error('❌ Failed to save question results:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Question results saved successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error saving question results:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get weak topics for a student in a subject
   * Topics with < 60% accuracy (minimum 3 questions)
   */
  async getWeakTopics(
    studentId: string,
    subjectId: string,
    limit: number = 10
  ): Promise<WeakTopic[]> {
    try {
      console.log('🔍 Fetching weak topics...');

      const { data, error } = await supabase.rpc('get_student_weak_topics', {
        p_student_id: studentId,
        p_subject_id: subjectId,
        p_limit: limit,
      });

      if (error) {
        console.error('❌ Failed to fetch weak topics:', error);
        return [];
      }

      const weakTopics: WeakTopic[] = (data || []).map((item: any) => ({
        topic: item.topic,
        totalQuestions: item.total_questions,
        correctQuestions: item.correct_questions,
        accuracy: parseFloat(item.accuracy),
      }));

      console.log(`✅ Found ${weakTopics.length} weak topics`);
      return weakTopics;
    } catch (error) {
      console.error('❌ Error fetching weak topics:', error);
      return [];
    }
  }

  /**
   * Stage 7: Get student's weak subtopics for adaptive practice
   * Queries competitive question results filtered to subtopic-level data
   */
  async getWeakSubtopics(
    studentId: string,
    subjectId: string,
    limit: number = 10
  ): Promise<WeakSubtopic[]> {
    try {
      const { data, error } = await supabase.rpc('get_student_weak_subtopics', {
        p_student_id: studentId,
        p_subject_id: subjectId,
        p_limit: limit,
      });

      if (error) {
        console.error('❌ Failed to fetch weak subtopics:', error);
        return [];
      }

      return (data || []).map((item: any) => ({
        subtopicId: item.subtopic_id,
        subtopicName: item.subtopic_name,
        topic: item.topic,
        totalQuestions: item.total_questions,
        correctQuestions: item.correct_questions,
        accuracy: parseFloat(item.accuracy),
      }));
    } catch (error) {
      console.error('❌ Error fetching weak subtopics:', error);
      return [];
    }
  }
  async getRecentAccuracy(
    studentId: string,
    subjectId: string,
    questionCount: number = 50
  ): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_student_recent_accuracy', {
        p_student_id: studentId,
        p_subject_id: subjectId,
        p_question_count: questionCount,
      });

      if (error) {
        console.error('❌ Failed to fetch recent accuracy:', error);
        return 0;
      }

      const accuracy = parseFloat(data || 0);
      console.log(`📊 Recent accuracy: ${accuracy}%`);
      return accuracy;
    } catch (error) {
      console.error('❌ Error fetching recent accuracy:', error);
      return 0;
    }
  }

  /**
   * Check if this is student's first session for a subject
   * Used to determine diagnostic vs personalized session
   */
  async isFirstSession(studentId: string, subjectId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('is_first_session', {
        p_student_id: studentId,
        p_subject_id: subjectId,
      });

      if (error) {
        console.error('❌ Failed to check first session:', error);
        return false;
      }

      const isFirst = data === true;
      console.log(`🎯 First session: ${isFirst ? 'Yes (Diagnostic)' : 'No (Personalized)'}`);
      return isFirst;
    } catch (error) {
      console.error('❌ Error checking first session:', error);
      return false;
    }
  }

  /**
   * Get adaptive difficulty mix based on student's recent performance
   * 
   * Performance Levels:
   * - Struggling (< 40%): More easy questions
   * - Balanced (40-80%): Standard mix
   * - Excelling (> 80%): More hard questions
   */
  async getAdaptiveDifficultyMix(
    studentId: string,
    subjectId: string
  ): Promise<DifficultyMix> {
    try {
      const accuracy = await this.getRecentAccuracy(studentId, subjectId, 50);

      // Default balanced mix
      let mix: DifficultyMix = {
        easy: 30,
        medium: 50,
        hard: 20,
        description: 'Balanced difficulty',
      };

      if (accuracy < 40) {
        // Struggling - more easy questions
        mix = {
          easy: 50,
          medium: 40,
          hard: 10,
          description: 'Easier questions to build confidence',
        };
      } else if (accuracy > 80) {
        // Excelling - more hard questions
        mix = {
          easy: 10,
          medium: 40,
          hard: 50,
          description: 'Challenging questions for growth',
        };
      }

      console.log(`🎯 Adaptive difficulty: ${mix.description} (${mix.easy}% easy, ${mix.medium}% medium, ${mix.hard}% hard)`);
      return mix;
    } catch (error) {
      console.error('❌ Error getting adaptive difficulty:', error);
      // Return balanced mix as fallback
      return {
        easy: 30,
        medium: 50,
        hard: 20,
        description: 'Balanced difficulty (fallback)',
      };
    }
  }

  /**
   * Get comprehensive topic performance summary
   */
  async getTopicPerformanceSummary(
    studentId: string,
    subjectId: string
  ): Promise<TopicPerformance[]> {
    try {
      console.log('📊 Fetching topic performance summary...');

      const { data, error } = await supabase.rpc('get_topic_performance_summary', {
        p_student_id: studentId,
        p_subject_id: subjectId,
      });

      if (error) {
        console.error('❌ Failed to fetch topic performance:', error);
        return [];
      }

      const performance: TopicPerformance[] = (data || []).map((item: any) => ({
        topic: item.topic,
        totalQuestions: item.total_questions,
        correctQuestions: item.correct_questions,
        accuracy: parseFloat(item.accuracy),
        avgTimeSpent: parseFloat(item.avg_time_spent),
        lastAttempted: item.last_attempted,
      }));

      console.log(`✅ Found performance data for ${performance.length} topics`);
      return performance;
    } catch (error) {
      console.error('❌ Error fetching topic performance:', error);
      return [];
    }
  }

  /**
   * Get adaptive learning insights for a student
   * Combines weak topics, recent accuracy, and difficulty recommendations
   */
  async getAdaptiveInsights(studentId: string, subjectId: string): Promise<{
    isFirstSession: boolean;
    weakTopics: WeakTopic[];
    recentAccuracy: number;
    difficultyMix: DifficultyMix;
    recommendation: string;
  }> {
    try {
      console.log('🧠 Generating adaptive learning insights...');

      const [isFirst, weakTopics, accuracy, difficultyMix] = await Promise.all([
        this.isFirstSession(studentId, subjectId),
        this.getWeakTopics(studentId, subjectId, 5),
        this.getRecentAccuracy(studentId, subjectId, 50),
        this.getAdaptiveDifficultyMix(studentId, subjectId),
      ]);

      let recommendation = '';
      if (isFirst) {
        recommendation = 'This is your first session! We\'ll assess your baseline knowledge across all topics.';
      } else if (weakTopics.length > 0) {
        const topicNames = weakTopics.slice(0, 3).map(t => t.topic).join(', ');
        recommendation = `Focus on: ${topicNames}. These topics need more practice.`;
      } else if (accuracy > 80) {
        recommendation = 'Excellent work! You\'re ready for more challenging questions.';
      } else {
        recommendation = 'Keep practicing! Consistency is key to improvement.';
      }

      const insights = {
        isFirstSession: isFirst,
        weakTopics,
        recentAccuracy: accuracy,
        difficultyMix,
        recommendation,
      };

      console.log('✅ Adaptive insights generated:', insights);
      return insights;
    } catch (error) {
      console.error('❌ Error generating adaptive insights:', error);
      return {
        isFirstSession: false,
        weakTopics: [],
        recentAccuracy: 0,
        difficultyMix: {
          easy: 30,
          medium: 50,
          hard: 20,
          description: 'Balanced difficulty',
        },
        recommendation: 'Practice regularly to improve your skills.',
      };
    }
  }
}

// Export singleton instance
export const adaptiveLearningService = new AdaptiveLearningService();
