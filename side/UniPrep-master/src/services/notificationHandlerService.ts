/**
 * Notification Handler Service
 * Stage 10 - Phase 2.2: Notification Handler & Deep Linking
 * 
 * Manages notification events and deep linking navigation.
 * Features:
 * - Foreground notification handling
 * - Background notification handling
 * - Notification tap handling
 * - Deep linking to screens
 * - Notification data parsing
 */

import * as Notifications from 'expo-notifications';
import { NavigationContainerRef } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';

export type NotificationData = {
  type: 'exam' | 'booking' | 'booking_reminder' | 'payment' | 'message' | 'achievement' | 'study_reminder' | 'general' | 'reminder' | 'announcement';
  screen?: string;
  params?: Record<string, any>;
  examId?: string;
  bookingId?: string;
  conversationId?: string;
  teacherId?: string;
  studentId?: string;
  action_url?: string;
};

class NotificationHandlerService {
  private navigationRef: NavigationContainerRef<any> | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;
  private pendingDeepLink: string | null = null;

  private isTeacherUser() {
    return useAuthStore.getState().user?.user_type === 'teacher';
  }

  /**
   * Initialize notification handlers
   * Call this in App.tsx after navigation is ready
   */
  initialize(navigationRef: NavigationContainerRef<any>) {
    this.navigationRef = navigationRef;
    this.setupListeners();
    console.log('✅ Notification handler initialized');
    
    // Handle any pending deep link that was called before initialization
    if (this.pendingDeepLink) {
      console.log('🔗 Processing pending deep link:', this.pendingDeepLink);
      const link = this.pendingDeepLink;
      this.pendingDeepLink = null;
      this.handleDeepLink(link);
    }
  }

  /**
   * Setup notification listeners
   */
  private setupListeners() {
    // Handle notifications received while app is in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      this.handleNotificationReceived
    );

    // Handle notification taps (user interaction)
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      this.handleNotificationResponse
    );
  }

  /**
   * Handle notification received in foreground
   */
  private handleNotificationReceived = (notification: Notifications.Notification) => {
    console.log('📬 Notification received (foreground):', notification.request.content.title);
    
    // You can show a custom in-app notification here if desired
    // For now, the default banner will show
  };

  /**
   * Handle notification tap (user clicked on notification)
   */
  private handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    console.log('👆 Notification tapped:', response.notification.request.content.title);
    
    const data = response.notification.request.content.data as NotificationData;
    
    if (data) {
      this.navigateFromNotification(data);
    }
  };

  /**
   * Navigate to appropriate screen based on notification data
   */
  private navigateFromNotification(data: NotificationData) {
    if (!this.navigationRef) {
      console.warn('⚠️ Navigation ref not set, cannot navigate');
      return;
    }

    console.log('🧭 Navigating from notification:', data.type);

    try {
      switch (data.type) {
        case 'exam':
          this.navigateToExam(data);
          break;
        case 'booking':
        case 'booking_reminder':
        case 'payment':
          this.navigateToBooking(data);
          break;
        case 'message':
          this.navigateToMessage(data);
          break;
        case 'achievement':
          this.navigateToProfile();
          break;
        case 'study_reminder':
          this.navigateToPractice();
          break;
        case 'general':
        case 'reminder':
        case 'announcement':
        default:
          // Navigate to notification center for general notifications
          this.navigateToNotifications();
          break;
      }
    } catch (error) {
      console.error('❌ Error navigating from notification:', error);
    }
  }

  /**
   * Navigate to exam screen
   */
  private navigateToExam(data: NotificationData) {
    if (data.examId) {
      this.navigationRef?.navigate('ExamDetail', { examId: data.examId });
    } else {
      // Navigate to exams list
      this.navigationRef?.navigate('Exams');
    }
  }

  /**
   * Navigate to booking screen
   */
  private navigateToBooking(data: NotificationData) {
    if (this.isTeacherUser()) {
      this.navigationRef?.navigate('Main', {
        screen: 'TeacherBookings',
        params: { initialTab: data.bookingId ? 'upcoming' : 'all' },
      });
      return;
    }

    if (data.bookingId) {
      this.navigationRef?.navigate('Main', {
        screen: 'Teachers',
        params: {
          screen: 'BookingDetail',
          params: { bookingId: data.bookingId },
        },
      });
    } else {
      this.navigationRef?.navigate('Main', {
        screen: 'Teachers',
        params: { screen: 'MyBookings' },
      });
    }
  }

  /**
   * Navigate to message/chat screen
   */
  private navigateToMessage(data: NotificationData) {
    if (data.conversationId) {
      this.navigationRef?.navigate('Chat', { 
        conversationId: data.conversationId,
        teacherId: data.teacherId,
        studentId: data.studentId,
      });
    } else {
      // Navigate to conversations list
      this.navigationRef?.navigate('Conversations');
    }
  }

  /**
   * Navigate to profile screen (for achievements)
   */
  private navigateToProfile() {
    this.navigationRef?.navigate('Profile');
  }

  /**
   * Navigate to practice screen (for study reminders)
   */
  private navigateToPractice() {
    this.navigationRef?.navigate('Practice');
  }

  /**
   * Navigate to notification center screen
   */
  private navigateToNotifications() {
    this.navigationRef?.navigate('NotificationCenter');
  }

  /**
   * Send a notification with navigation data
   */
  async sendNotificationWithNavigation(
    title: string,
    body: string,
    data: NotificationData,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string | null> {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          data,
        },
        trigger: trigger || null, // null = immediate
      });

      console.log('✅ Notification scheduled with navigation data:', id);
      return id;
    } catch (error) {
      console.error('❌ Error sending notification with navigation:', error);
      return null;
    }
  }

  /**
   * Handle deep link URL
   * Format: elmly://screen/params
   */
  handleDeepLink(url: string) {
    console.log('🔗 Deep link received:', url);

    if (!this.navigationRef) {
      console.warn('⚠️ Navigation ref not ready yet, queuing deep link for later');
      this.pendingDeepLink = url;
      return;
    }

    try {
      // Parse URL: elmly://exam/123 or elmly://mock-exam/123
      const urlObj = new URL(url);
      // For elmly://mock-exam/123, host is "mock-exam" and pathname is "/123"
      const host = urlObj.host; // e.g., "mock-exam"
      const pathname = urlObj.pathname.replace(/^\//, ''); // e.g., "123"
      
      // The screen is the host, and the id is the first part of pathname
      const screen = host;
      const id = pathname || undefined;
      
      console.log('🔗 Parsed deep link - screen:', screen, 'id:', id);

      switch (screen) {
        case 'exam':
          // Navigate to exams list: Main → MockExams tab → MockExamsList
          this.navigationRef?.navigate('Main', { 
            screen: 'MockExams', 
            params: { screen: 'MockExamsList' } 
          });
          break;
        case 'mock-exam':
          // Navigate to specific mock exam: Main → MockExams tab → MockExamDetails
          if (id) {
            console.log('🔗 Navigating to MockExamDetails with examId:', id);
            this.navigationRef?.navigate('Main', { 
              screen: 'MockExams', 
              params: { 
                screen: 'MockExamDetails', 
                params: { examId: id } 
              } 
            });
          } else {
            this.navigationRef?.navigate('Main', { 
              screen: 'MockExams', 
              params: { screen: 'MockExamsList' } 
            });
          }
          break;
        case 'subject':
          // Navigate to specific subject: Main → Practice tab → SubjectDetail
          // SubjectDetail expects { subject: { id, name, ... } }
          if (id) {
            console.log('🔗 Navigating to SubjectDetail with subject id:', id);
            this.navigationRef?.navigate('Main', { 
              screen: 'Practice', 
              params: { 
                screen: 'SubjectDetail', 
                params: { subject: { id: id } } 
              } 
            });
          } else {
            this.navigationRef?.navigate('Main', { screen: 'Practice' });
          }
          break;
        case 'practice':
          // Navigate to Practice tab
          this.navigationRef?.navigate('Main', { screen: 'Practice' });
          break;
        case 'booking':
        case 'bookings':
          if (this.isTeacherUser()) {
            this.navigationRef?.navigate('Main', {
              screen: 'TeacherBookings',
              params: { initialTab: id ? 'upcoming' : 'all' },
            });
            break;
          }
          // Navigate to bookings: Main → Teachers tab → BookingDetail/MyBookings
          if (id) {
            this.navigationRef?.navigate('Main', { 
              screen: 'Teachers', 
              params: { 
                screen: 'BookingDetail', 
                params: { bookingId: id } 
              } 
            });
          } else {
            this.navigationRef?.navigate('Main', { 
              screen: 'Teachers', 
              params: { screen: 'MyBookings' } 
            });
          }
          break;
        case 'chat':
        case 'message':
          // Navigate to chat: Root level Chat screen
          if (id) {
            this.navigationRef?.navigate('Chat', { conversationId: id });
          } else {
            this.navigationRef?.navigate('ConversationsList');
          }
          break;
        case 'teacher':
          // Navigate to teacher profile: Main → Teachers tab → TeacherProfile
          if (id) {
            this.navigationRef?.navigate('Main', { 
              screen: 'Teachers', 
              params: { 
                screen: 'TeacherProfile', 
                params: { teacherId: id } 
              } 
            });
          } else {
            this.navigationRef?.navigate('Main', { 
              screen: 'Teachers', 
              params: { screen: 'TeachersList' } 
            });
          }
          break;
        case 'profile':
          // Navigate to Profile tab
          this.navigationRef?.navigate('Main', { screen: 'Profile' });
          break;
        case 'notifications':
          // Navigate to NotificationCenter (root level)
          this.navigationRef?.navigate('NotificationCenter');
          break;
        case 'leaderboard':
          // Navigate to leaderboard: Main → Analytics tab → Leaderboard
          this.navigationRef?.navigate('Main', { 
            screen: 'Analytics', 
            params: { screen: 'Leaderboard' } 
          });
          break;
        case 'analytics':
          // Navigate to Analytics tab
          this.navigationRef?.navigate('Main', { screen: 'Analytics' });
          break;
        case 'settings':
          // Navigate to Settings (root level)
          this.navigationRef?.navigate('Settings');
          break;
        case 'home':
          // Navigate to Home tab
          this.navigationRef?.navigate('Main', { screen: 'Home' });
          break;
        default:
          console.warn('⚠️ Unknown deep link screen:', screen);
          // Default to notifications
          this.navigationRef?.navigate('NotificationCenter');
      }
    } catch (error) {
      console.error('❌ Error handling deep link:', error);
    }
  }

  /**
   * Get last notification response (for app launch from notification)
   */
  async getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
    try {
      return await Notifications.getLastNotificationResponseAsync();
    } catch (error) {
      console.error('❌ Error getting last notification response:', error);
      return null;
    }
  }

  /**
   * Handle app launch from notification
   * Call this in App.tsx useEffect
   */
  async handleAppLaunchFromNotification() {
    const response = await this.getLastNotificationResponse();
    
    if (response) {
      console.log('🚀 App launched from notification');
      const data = response.notification.request.content.data as NotificationData;
      
      if (data) {
        // Wait a bit for navigation to be ready
        setTimeout(() => {
          this.navigateFromNotification(data);
        }, 1000);
      }
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    if (this.notificationListener) {
      this.notificationListener.remove();
    }
    if (this.responseListener) {
      this.responseListener.remove();
    }
    console.log('🧹 Notification handler cleaned up');
  }
}

// Export singleton instance
export const notificationHandler = new NotificationHandlerService();
export const notificationHandlerService = notificationHandler;
