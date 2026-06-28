/**
 * Notification Handler Integration Example
 * 
 * This shows how to integrate the notification handler in App.tsx
 * Copy the relevant parts to your actual App.tsx file
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { notificationHandler } from '../services/notificationHandlerService';
import { notificationService } from '../services/notificationService';

// NOTE: Replace with your actual auth context import
// import { useAuth } from '../contexts/AuthContext';
const useAuth = (): { user: any } => ({ user: null });

export function AppWithNotifications() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const { user } = useAuth();

  // Initialize notification handler when navigation is ready
  useEffect(() => {
    if (navigationRef.current) {
      notificationHandler.initialize(navigationRef.current);
      
      // Handle app launch from notification
      notificationHandler.handleAppLaunchFromNotification();
    }

    // Cleanup on unmount
    return () => {
      notificationHandler.cleanup();
    };
  }, []);

  // Register device for push notifications when user logs in
  useEffect(() => {
    if (user) {
      registerForNotifications();
    }
  }, [user]);

  const registerForNotifications = async () => {
    try {
      const success = await notificationService.registerDevice(user.id);
      if (success) {
        console.log('✅ Device registered for push notifications');
      }
    } catch (error) {
      console.error('❌ Failed to register device:', error);
    }
  };

  // Configure deep linking
  const linking = {
    prefixes: ['elmly://', 'https://elmly.app'],
    config: {
      screens: {
        // Main tabs
        Home: 'home',
        Practice: 'practice',
        Exams: 'exams',
        Teachers: 'teachers',
        Profile: 'profile',
        
        // Detail screens
        ExamDetail: 'exam/:examId',
        TeacherProfile: 'teacher/:teacherId',
        BookingDetail: 'booking/:bookingId',
        Chat: 'chat/:conversationId',
        
        // Practice screens
        ModeSelection: 'practice/modes',
        CompetitiveMode: 'practice/competitive',
        CompetitiveQuiz: 'practice/competitive/quiz',
        CompetitiveResults: 'practice/competitive/results',
      },
    },
    async getInitialURL() {
      // Check if app was opened from a deep link
      const url = await Linking.getInitialURL();
      if (url) {
        return url;
      }

      // Check if app was opened from a notification
      const response = await notificationHandler.getLastNotificationResponse();
      if (response) {
        const data = response.notification.request.content.data;
        // Convert notification data to deep link URL
        if (data?.screen) {
          return `elmly://${data.screen}`;
        }
      }

      return null;
    },
    subscribe(listener: (url: string) => void) {
      // Listen for deep links while app is running
      const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
        listener(url);
      });

      return () => {
        linkingSubscription.remove();
      };
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => {
        console.log('🧭 Navigation ready');
      }}
    >
      {/* Your navigation stack here */}
      <></>
    </NavigationContainer>
  );
}

/**
 * EXAMPLE: Sending notifications with navigation
 */
export const NotificationExamples = {
  // Exam reminder
  async sendExamReminder(examId: string, examName: string, daysUntil: number) {
    await notificationHandler.sendNotificationWithNavigation(
      `🎓 Exam in ${daysUntil} days`,
      `${examName} exam is coming up!`,
      {
        type: 'exam',
        examId,
        screen: 'ExamDetail',
        params: { examId },
      },
      {
        // Schedule for specific time
        type: 'calendar',
        hour: 9,
        minute: 0,
        repeats: false,
      } as Parameters<typeof Notifications.scheduleNotificationAsync>[0]['trigger']
    );
  },

  // Booking confirmation
  async sendBookingConfirmation(bookingId: string, teacherName: string) {
    await notificationHandler.sendNotificationWithNavigation(
      '✅ Booking Confirmed',
      `Your session with ${teacherName} is confirmed`,
      {
        type: 'booking',
        bookingId,
        screen: 'BookingDetail',
        params: { bookingId },
      }
    );
  },

  // New message
  async sendNewMessage(conversationId: string, senderName: string, preview: string) {
    await notificationHandler.sendNotificationWithNavigation(
      `💬 Message from ${senderName}`,
      preview,
      {
        type: 'message',
        conversationId,
        screen: 'Chat',
        params: { conversationId },
      }
    );
  },

  // Achievement
  async sendAchievement(title: string, description: string) {
    await notificationHandler.sendNotificationWithNavigation(
      `🏆 ${title}`,
      description,
      {
        type: 'achievement',
        screen: 'Profile',
      }
    );
  },

  // Study reminder
  async sendStudyReminder() {
    await notificationHandler.sendNotificationWithNavigation(
      '📚 Time to Study!',
      "Let's keep your streak going!",
      {
        type: 'study_reminder',
        screen: 'Practice',
      }
    );
  },
};

/**
 * EXAMPLE: Testing deep links
 */
export const DeepLinkExamples = {
  // Test deep links in development
  testDeepLinks() {
    // Open exam detail
    Linking.openURL('elmly://exam/123');
    
    // Open teacher profile
    Linking.openURL('elmly://teacher/456');
    
    // Open chat
    Linking.openURL('elmly://chat/789');
    
    // Open practice
    Linking.openURL('elmly://practice');
  },
};
