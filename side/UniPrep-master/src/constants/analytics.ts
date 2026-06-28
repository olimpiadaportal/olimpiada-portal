/**
 * Analytics Thresholds - Industry Standards
 * 
 * These thresholds are used across all analytics features
 * to ensure consistency in weak/strong topic identification.
 * 
 * Based on educational psychology research and industry standards
 * (Khan Academy, Duolingo, Coursera, edX)
 */

export const ANALYTICS_THRESHOLDS = {
  // Weak topic threshold
  // <70% accuracy indicates need for improvement
  // Based on mastery learning principles
  WEAK_ACCURACY: 70,
  
  // Strong topic threshold
  // >=85% accuracy indicates mastery
  // Student can confidently move to advanced topics
  STRONG_ACCURACY: 85,
  
  // Minimum sample size for statistical significance
  // Need at least 5 questions to make reliable assessment
  // Prevents false positives from 1-2 lucky/unlucky attempts
  MIN_QUESTIONS: 5,
  
  // Confidence level thresholds
  // More questions = more confident in assessment
  HIGH_CONFIDENCE: 15,      // 15+ questions = high confidence
  MEDIUM_CONFIDENCE: 5,     // 5-14 questions = medium confidence
  // <5 questions = low confidence (don't show)
  
  // Competitive mode question distribution
  // 60% on weak topics, 40% general knowledge
  // Balances targeted practice with breadth
  COMPETITIVE_WEAK_RATIO: 0.6,
  COMPETITIVE_GENERAL_RATIO: 0.4,
};

/**
 * Get confidence level based on question count
 */
export const getConfidenceLevel = (questionCount: number): 'low' | 'medium' | 'high' => {
  if (questionCount < ANALYTICS_THRESHOLDS.MEDIUM_CONFIDENCE) return 'low';
  if (questionCount < ANALYTICS_THRESHOLDS.HIGH_CONFIDENCE) return 'medium';
  return 'high';
};

/**
 * Check if a topic is weak (needs improvement)
 * 
 * @param accuracy - Percentage correct (0-100)
 * @param questionCount - Number of questions attempted
 * @returns true if topic is weak
 */
export const isWeakTopic = (accuracy: number, questionCount: number): boolean => {
  return questionCount >= ANALYTICS_THRESHOLDS.MIN_QUESTIONS && 
         accuracy < ANALYTICS_THRESHOLDS.WEAK_ACCURACY;
};

/**
 * Check if a topic is strong (mastered)
 * 
 * @param accuracy - Percentage correct (0-100)
 * @param questionCount - Number of questions attempted
 * @returns true if topic is strong
 */
export const isStrongTopic = (accuracy: number, questionCount: number): boolean => {
  return questionCount >= ANALYTICS_THRESHOLDS.MIN_QUESTIONS && 
         accuracy >= ANALYTICS_THRESHOLDS.STRONG_ACCURACY;
};

/**
 * Get topic status
 * 
 * @param accuracy - Percentage correct (0-100)
 * @param questionCount - Number of questions attempted
 * @returns 'weak' | 'developing' | 'strong' | 'insufficient_data'
 */
export const getTopicStatus = (
  accuracy: number, 
  questionCount: number
): 'weak' | 'developing' | 'strong' | 'insufficient_data' => {
  if (questionCount < ANALYTICS_THRESHOLDS.MIN_QUESTIONS) {
    return 'insufficient_data';
  }
  
  if (accuracy < ANALYTICS_THRESHOLDS.WEAK_ACCURACY) {
    return 'weak';
  }
  
  if (accuracy >= ANALYTICS_THRESHOLDS.STRONG_ACCURACY) {
    return 'strong';
  }
  
  return 'developing';
};

/**
 * Get color for topic status
 * Useful for UI display
 */
export const getTopicStatusColor = (status: string): string => {
  switch (status) {
    case 'weak':
      return '#EF4444'; // Red
    case 'developing':
      return '#F59E0B'; // Amber
    case 'strong':
      return '#10B981'; // Green
    case 'insufficient_data':
      return '#6B7280'; // Gray
    default:
      return '#6B7280';
  }
};

/**
 * Get icon for topic status
 * Useful for UI display
 */
export const getTopicStatusIcon = (status: string): string => {
  switch (status) {
    case 'weak':
      return 'alert-circle';
    case 'developing':
      return 'trending-up';
    case 'strong':
      return 'checkmark-circle';
    case 'insufficient_data':
      return 'help-circle';
    default:
      return 'help-circle';
  }
};

/**
 * Get human-readable label for topic status
 */
export const getTopicStatusLabel = (status: string): string => {
  switch (status) {
    case 'weak':
      return 'Needs Improvement';
    case 'developing':
      return 'Developing';
    case 'strong':
      return 'Mastered';
    case 'insufficient_data':
      return 'Not Enough Data';
    default:
      return 'Unknown';
  }
};
