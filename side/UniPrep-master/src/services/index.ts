/**
 * Services Index
 * 
 * Central export point for all services
 */

// Existing services
export { supabase } from './supabase';
export { analyticsService } from './analyticsService';
export { authService } from './authService';
export { practiceService } from './practiceService';
export { profileService } from './profileService';
export { studentService } from './studentService';
export { teacherService } from './teacherService';
export { bookingService } from './bookingService';
export { leaderboardService } from './leaderboardService';
export { mockExamService } from './mockExamService';
export { reviewService } from './reviewService';
export { statisticsService } from './statisticsService';
export { notificationService } from './notificationService';
export { settingsService} from './settingsService';
export { referenceDataService } from './referenceDataService';
export { recommendationService } from './recommendationService';
export { activityService } from './activityService';
export { motivationService } from './motivationService';
export { deadlineService } from './deadlineService';
export { accountService } from './accountService';
export { imageUploadService } from './imageUploadService';
export { offlineService } from './offlineService';
export { analyticsUpdateService } from './analyticsUpdateService';

// NEW: AI Services (Phase 3)
export { aiInsightsService } from './aiInsightsService';
export { aiExplanationService } from './aiExplanationService';
export { competitiveModeService } from './competitiveModeService';

// NEW: Stage 6 - System Settings Services (Phase 3)
export { systemSettingsService } from './systemSettingsService';
export { featureFlagService } from './featureFlagService';
export { maintenanceModeService } from './maintenanceModeService';
export { passwordPolicyService } from './passwordPolicyService';
export { notificationSettingsService } from './notificationSettingsService';

// NEW: Stage 6 - Offline Mode Services (Week 3)
export { networkService } from './networkService';
export { offlineSyncService } from './offlineSyncService';
