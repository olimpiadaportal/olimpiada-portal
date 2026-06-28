/**
 * Walkthrough Service
 * Stage 10.3: App Walkthrough Tooltips
 * 
 * Manages walkthrough state persistence and step definitions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WalkthroughStep,
  WALKTHROUGH_STORAGE_KEYS,
  WALKTHROUGH_VERSION,
  WALKTHROUGH_TARGET_IDS,
} from '../types/walkthrough';

/**
 * Student walkthrough steps configuration
 * These define the 5-step onboarding flow for new students
 * Focused on the Quick Actions buttons which are always visible
 */
const STUDENT_WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'quick-actions',
    targetId: WALKTHROUGH_TARGET_IDS.QUICK_ACTIONS,
    title: 'Quick Actions',
    titleKey: 'walkthrough.quickActions.title',
    description: 'Start practice, take exams, or find teachers instantly',
    descriptionKey: 'walkthrough.quickActions.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'flash',
    delay: 500,
  },
  {
    id: 'practice-button',
    targetId: WALKTHROUGH_TARGET_IDS.PRACTICE_BUTTON,
    title: 'Practice Mode',
    titleKey: 'walkthrough.practice.title',
    description: 'Practice questions by subject to improve your skills',
    descriptionKey: 'walkthrough.practice.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'book',
  },
  {
    id: 'exam-button',
    targetId: WALKTHROUGH_TARGET_IDS.EXAM_BUTTON,
    title: 'Mock Exams',
    titleKey: 'walkthrough.exams.title',
    description: 'Take full mock exams to test your readiness',
    descriptionKey: 'walkthrough.exams.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'document-text',
  },
  {
    id: 'teachers-button',
    targetId: WALKTHROUGH_TARGET_IDS.TEACHERS_BUTTON,
    title: 'Find Teachers',
    titleKey: 'walkthrough.teachers.title',
    description: 'Connect with verified teachers for personalized help',
    descriptionKey: 'walkthrough.teachers.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'people',
  },
  {
    id: 'progress-button',
    targetId: WALKTHROUGH_TARGET_IDS.PROGRESS_BUTTON,
    title: 'Your Progress',
    titleKey: 'walkthrough.profile.title',
    description: 'Track your performance and view detailed analytics',
    descriptionKey: 'walkthrough.profile.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'stats-chart',
  },
];

/**
 * Teacher walkthrough steps configuration
 * These define the 4-step onboarding flow for new teachers
 */
const TEACHER_WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 'teacher-stats',
    targetId: WALKTHROUGH_TARGET_IDS.TEACHER_STATS,
    title: 'Your Dashboard',
    titleKey: 'walkthrough.teacher.dashboard.title',
    description: 'View your students, bookings, and earnings at a glance',
    descriptionKey: 'walkthrough.teacher.dashboard.description',
    placement: 'bottom',
    screen: 'Home',
    icon: 'grid',
    delay: 500,
  },
  {
    id: 'teacher-bookings',
    targetId: WALKTHROUGH_TARGET_IDS.TEACHER_BOOKINGS,
    title: 'Manage Bookings',
    titleKey: 'walkthrough.teacher.bookings.title',
    description: 'Accept or decline student booking requests',
    descriptionKey: 'walkthrough.teacher.bookings.description',
    placement: 'top',
    screen: 'Home',
    icon: 'calendar',
  },
  {
    id: 'teacher-earnings',
    targetId: WALKTHROUGH_TARGET_IDS.TEACHER_EARNINGS,
    title: 'Track Earnings',
    titleKey: 'walkthrough.teacher.earnings.title',
    description: 'Monitor your earnings and payment history',
    descriptionKey: 'walkthrough.teacher.earnings.description',
    placement: 'top',
    screen: 'Home',
    icon: 'cash',
  },
  {
    id: 'teacher-profile',
    targetId: WALKTHROUGH_TARGET_IDS.TEACHER_PROFILE,
    title: 'Your Profile',
    titleKey: 'walkthrough.teacher.profile.title',
    description: 'Update your profile, subjects, and availability',
    descriptionKey: 'walkthrough.teacher.profile.description',
    placement: 'top',
    screen: 'Home',
    icon: 'person-circle',
  },
];

export type UserType = 'student' | 'teacher';

class WalkthroughService {
  /**
   * Check if the walkthrough has been completed for the current version
   */
  async isWalkthroughCompleted(): Promise<boolean> {
    try {
      const [completed, version] = await Promise.all([
        AsyncStorage.getItem(WALKTHROUGH_STORAGE_KEYS.COMPLETED),
        AsyncStorage.getItem(WALKTHROUGH_STORAGE_KEYS.VERSION),
      ]);

      // If completed and version matches, walkthrough is done
      if (completed === 'true' && version === WALKTHROUGH_VERSION) {
        return true;
      }

      // If version changed, show walkthrough again
      if (version && version !== WALKTHROUGH_VERSION) {
        console.log('📱 Walkthrough version changed, will show again');
        return false;
      }

      return completed === 'true';
    } catch (error) {
      console.error('Error checking walkthrough status:', error);
      return false;
    }
  }

  /**
   * Check if the walkthrough was skipped (not completed fully)
   */
  async wasWalkthroughSkipped(): Promise<boolean> {
    try {
      const skipped = await AsyncStorage.getItem(WALKTHROUGH_STORAGE_KEYS.SKIPPED);
      return skipped === 'true';
    } catch (error) {
      console.error('Error checking walkthrough skipped status:', error);
      return false;
    }
  }

  /**
   * Mark the walkthrough as completed
   */
  async markWalkthroughCompleted(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.COMPLETED, 'true'),
        AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.VERSION, WALKTHROUGH_VERSION),
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.SKIPPED),
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.LAST_STEP),
      ]);
      console.log('✅ Walkthrough marked as completed');
    } catch (error) {
      console.error('Error marking walkthrough as completed:', error);
    }
  }

  /**
   * Mark the walkthrough as skipped
   */
  async markWalkthroughSkipped(lastStepIndex: number): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.SKIPPED, 'true'),
        AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.LAST_STEP, lastStepIndex.toString()),
        AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.VERSION, WALKTHROUGH_VERSION),
      ]);
      console.log('⏭️ Walkthrough marked as skipped at step', lastStepIndex);
    } catch (error) {
      console.error('Error marking walkthrough as skipped:', error);
    }
  }

  /**
   * Reset the walkthrough (for testing or re-showing)
   */
  async resetWalkthrough(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.COMPLETED),
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.VERSION),
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.SKIPPED),
        AsyncStorage.removeItem(WALKTHROUGH_STORAGE_KEYS.LAST_STEP),
      ]);
      console.log('🔄 Walkthrough reset successfully');
    } catch (error) {
      console.error('Error resetting walkthrough:', error);
    }
  }

  /**
   * Get the last step index if walkthrough was interrupted
   */
  async getLastStepIndex(): Promise<number> {
    try {
      const lastStep = await AsyncStorage.getItem(WALKTHROUGH_STORAGE_KEYS.LAST_STEP);
      return lastStep ? parseInt(lastStep, 10) : 0;
    } catch (error) {
      console.error('Error getting last step index:', error);
      return 0;
    }
  }

  /**
   * Save the current step index (for resuming if app closes)
   */
  async saveCurrentStep(stepIndex: number): Promise<void> {
    try {
      await AsyncStorage.setItem(WALKTHROUGH_STORAGE_KEYS.LAST_STEP, stepIndex.toString());
    } catch (error) {
      console.error('Error saving current step:', error);
    }
  }

  /**
   * Get walkthrough steps based on user type
   */
  getWalkthroughSteps(userType: UserType = 'student'): WalkthroughStep[] {
    return userType === 'teacher' ? TEACHER_WALKTHROUGH_STEPS : STUDENT_WALKTHROUGH_STEPS;
  }

  /**
   * Get a specific step by index
   */
  getStepByIndex(index: number, userType: UserType = 'student'): WalkthroughStep | null {
    const steps = this.getWalkthroughSteps(userType);
    if (index < 0 || index >= steps.length) {
      return null;
    }
    return steps[index];
  }

  /**
   * Get a specific step by ID
   */
  getStepById(id: string, userType: UserType = 'student'): WalkthroughStep | null {
    const steps = this.getWalkthroughSteps(userType);
    return steps.find((step: WalkthroughStep) => step.id === id) || null;
  }

  /**
   * Get total number of steps
   */
  getTotalSteps(userType: UserType = 'student'): number {
    return this.getWalkthroughSteps(userType).length;
  }

  /**
   * Check if this is the last step
   */
  isLastStep(index: number, userType: UserType = 'student'): boolean {
    return index === this.getWalkthroughSteps(userType).length - 1;
  }

  /**
   * Check if this is the first step
   */
  isFirstStep(index: number): boolean {
    return index === 0;
  }
}

// Export singleton instance
export const walkthroughService = new WalkthroughService();
