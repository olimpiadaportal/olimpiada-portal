import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { NavigationContainer, NavigationContainerRef, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../types';
import { useAuthStore } from '../store/authStore';
import { useMessagingStore } from '../store/messagingStore';
import { supabase, setupAppStateListener, removeAppStateListener } from '../services/supabase';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { colors as themeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { notificationHandler } from '../services/notificationHandlerService';
import { notificationService } from '../services/notificationService';
import { notificationRealtimeService } from '../services/notificationRealtimeService';
import { OfflineBanner } from '../components/OfflineBanner';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { offlineService } from '../services/offlineService';
import { practiceService } from '../services/practiceService';
import { DeepLinkHandler } from '../components/DeepLinkHandler';
import NetInfo from '@react-native-community/netinfo';

// Stage 9: Profile & Settings Screens
import { StudentProfileScreen } from '../screens/profile/StudentProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { MyTeachersScreen } from '../screens/profile/MyTeachersScreen';
import { TeacherOwnProfileScreen } from '../screens/teachers/TeacherOwnProfileScreen';
import { AvailabilityManagementScreen } from '../screens/teachers/AvailabilityManagementScreen';
import { MyBookingsScreen } from '../screens/teachers/MyBookingsScreen';
import { MySubscriptionsScreen } from '../screens/teachers/MySubscriptionsScreen';
import { TeacherProfileScreen } from '../screens/teachers/TeacherProfileScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { NotificationPreferencesScreen } from '../screens/settings/NotificationPreferencesScreen';
import { ChangePasswordScreen } from '../screens/account/ChangePasswordScreen';
import { AccountManagementScreen } from '../screens/account/AccountManagementScreen';
import { HelpSupportScreen } from '../screens/support/HelpSupportScreen';
import { AboutScreen } from '../screens/support/AboutScreen';
import { PrivacyPolicyScreen } from '../screens/legal/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '../screens/legal/TermsOfServiceScreen';
import { ConversationsListScreen } from '../screens/messages/ConversationsListScreen';
import { ChatScreenNew as ChatScreen } from '../screens/messages/ChatScreenNew';

// Notification Center
import { NotificationCenterScreen } from '../screens/notifications/NotificationCenterScreen';

// Teacher Exam Features
import { TeacherMyExamsScreen } from '../screens/teachers/TeacherMyExamsScreen';
import { TeacherAddQuestionScreen } from '../screens/teachers/TeacherAddQuestionScreen';
import { TeacherBuildExamScreen } from '../screens/teachers/TeacherBuildExamScreen';

// Phase 2: Onboarding Personalization
import { PersonalizationQuizScreen } from '../screens/onboarding/PersonalizationQuizScreen';
import { TeacherOnboardingQuizScreen } from '../screens/onboarding/TeacherOnboardingQuizScreen';

const Stack = createStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { isAuthenticated, isLoading, onboardingCompleted, setUser, setSession, setLoading, setStudentData } = useAuthStore();
  const { initialize: initializeMessaging } = useMessagingStore();
  const isProcessingRef = React.useRef(false);
  const lastEventTimeRef = React.useRef(0);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const user = useAuthStore((state) => state.user);
  const { isOnline } = useNetworkStatus();
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  useEffect(() => {
    let isSubscribed = true; // Prevent updates after unmount
    let initialCheckDone = false;

    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      if (!isSubscribed) return;
      const state = useAuthStore.getState();
      if (state.isLoading) {
        console.warn('⚠️ Loading timeout - forcing loading to false');
        setLoading(false);
      }
      // Also resolve stuck onboarding state (null = never fetched)
      if (state.onboardingCompleted === null && state.isAuthenticated && state.user) {
        console.warn('⚠️ Onboarding status timeout - defaulting to true');
        useAuthStore.getState().setOnboardingCompleted(true);
      }
    }, 5000); // 5 second timeout

    // Check active session on mount
    const checkSession = async () => {
      try {
        // Check network status first
        const networkState = await NetInfo.fetch();
        const isCurrentlyOnline = !!(networkState.isConnected && networkState.isInternetReachable);
        
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Session check:', session ? 'Found session' : 'No session', 'Online:', isCurrentlyOnline);
        
        if (!isSubscribed) return;
        
        setSession(session);
        
        if (session?.user) {
          // Fetch user profile - with offline fallback
          await fetchUserProfile(session.user.id, isCurrentlyOnline);
        } else {
          // No session - check if we have cached profile for offline use
          if (!isCurrentlyOnline) {
            const cachedProfile = await offlineService.getCachedUserProfile();
            if (cachedProfile) {
              console.log('📴 Offline - using cached profile');
              setUser(cachedProfile);
              useAuthStore.getState().setOnboardingCompleted(true);
              setLoading(false);
              initialCheckDone = true;
              return;
            }
          }
          setLoading(false);
        }
        
        initialCheckDone = true;
      } catch (error) {
        console.error('Session check error:', error);
        
        // On error (likely offline), try to use cached profile
        if (isSubscribed) {
          const cachedProfile = await offlineService.getCachedUserProfile();
          if (cachedProfile) {
            console.log('📴 Error during session check - using cached profile');
            setUser(cachedProfile);
            useAuthStore.getState().setOnboardingCompleted(true);
          }
          setLoading(false);
        }
        initialCheckDone = true;
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isSubscribed) return; // Prevent updates after unmount
      
      // Skip auth events until initial check is done
      if (!initialCheckDone) {
        console.log('Auth change ignored - initial check not done yet');
        return;
      }
      
      // CRITICAL: Handle isSigningOut flag properly.
      // When the user explicitly logs out, ProfileScreen sets isSigningOut=true
      // BEFORE calling supabase.auth.signOut(). This prevents the onAuthStateChange
      // handler from firing setSession/setUser/setLoading (3 separate renders)
      // which, combined with the authStore.signOut() call, creates a cascading
      // state update loop that exceeds React's maximum update depth.
      // 
      // HOWEVER: If a new SIGNED_IN event arrives with a valid session, we MUST
      // reset isSigningOut to allow the login to proceed. This happens when user
      // logs out and then logs back in.
      const currentIsSigningOut = useAuthStore.getState().isSigningOut;
      if (currentIsSigningOut) {
        // If we have a valid session with SIGNED_IN event, reset the flag and proceed
        if (session?.user && (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION')) {
          console.log('🔓 New login detected - resetting isSigningOut flag');
          useAuthStore.getState().setSigningOut(false);
          // Continue processing this event
        } else {
          // No session or SIGNED_OUT event - skip during logout
          console.log('🔒 Auth change ignored - explicit logout in progress');
          isProcessingRef.current = false;
          return;
        }
      }
      
      // Debounce: Ignore events that happen within 100ms of each other
      // Reduced from 500ms to ensure SIGNED_IN events are processed quickly
      const now = Date.now();
      if (now - lastEventTimeRef.current < 100) {
        console.log('Auth change ignored - too soon after previous event');
        return;
      }
      lastEventTimeRef.current = now;
      
      // Prevent concurrent processing
      if (isProcessingRef.current) {
        console.log('Auth change ignored - already processing');
        return;
      }
      
      isProcessingRef.current = true;
      
      console.log('Auth state changed:', _event, session ? 'Has session' : 'No session');
      
      // Log detailed info for debugging unexpected logouts
      if (_event === 'SIGNED_OUT') {
        console.log('⚠️ SIGNED_OUT event received - investigating cause...');
        console.log('📊 Session details:', session ? 'Session exists' : 'No session');
        console.log('📊 Current user in store:', useAuthStore.getState().user?.id || 'None');
        console.log('📊 Timestamp:', new Date().toISOString());
      }
      
      try {
        if (session?.user) {
          setSession(session);
          
          // Check if user is already set (auth screens may have already handled this)
          const currentUser = useAuthStore.getState().user;
          const currentOnboarding = useAuthStore.getState().onboardingCompleted;
          
          // Skip fetch if:
          // 1. Token refresh with existing user data
          // 2. User already set with onboarding status (auth screen handled it)
          if (_event === 'TOKEN_REFRESHED' && currentUser) {
            console.log('Token refreshed - keeping existing user data');
            setLoading(false);
          } else if (currentUser && currentUser.id === session.user.id && currentOnboarding !== null) {
            // Auth screen already set user and onboarding status - skip duplicate fetch
            console.log('User already set by auth screen - skipping duplicate fetch');
            setLoading(false);
          } else {
            // New sign in, initial session, or user data missing - fetch profile
            console.log('Fetching profile for event:', _event);
            await fetchUserProfile(session.user.id);
            // fetchUserProfile sets loading to false
          }
        } else {
          // Sign out - batch state updates
          // Only clear state if this is a genuine sign out, not a temporary network issue
          if (_event === 'SIGNED_OUT') {
            const hadUser = useAuthStore.getState().user !== null;
            console.log('🔒 Processing sign out - had user:', hadUser);
            
            // If user was logged in, attempt silent re-authentication
            if (hadUser) {
              console.log('🔐 Attempting silent re-authentication...');
              const hasStoredCreds = false;
              
              if (hasStoredCreds) {
                // Try silent re-auth without biometric (background operation)
                const reAuthResult: { success: boolean; session: any } = { success: false, session: null };
                
                if (reAuthResult.success && reAuthResult.session) {
                  console.log('✅ Silent re-authentication successful!');
                  setSession(reAuthResult.session);
                  await fetchUserProfile(reAuthResult.session.user.id);
                  return; // Don't clear state - we recovered!
                } else {
                  console.log('❌ Silent re-auth failed - showing user message');
                  // Show user-friendly message about being signed out
                  Alert.alert(
                    t('auth.sessionExpired', 'Session Expired'),
                    t('auth.signedInElsewhere', 'You have been signed in on another device. Please sign in again to continue.'),
                    [{ text: t('common.ok', 'OK') }]
                  );
                }
              } else {
                console.log('📱 No stored credentials - normal sign out');
              }
            }
            
            // Clear state if re-auth failed or wasn't attempted
            // Use atomic signOut() to avoid cascading renders
            useAuthStore.getState().signOut();
          } else {
            // For other events without session, try to recover
            console.log('⚠️ No session but event is:', _event, '- attempting recovery');
            const { data: { session: recoveredSession } } = await supabase.auth.getSession();
            if (recoveredSession?.user) {
              console.log('✅ Session recovered from storage');
              setSession(recoveredSession);
              await fetchUserProfile(recoveredSession.user.id);
            } else {
              console.log('❌ No session found in storage - signing out');
              // Use atomic signOut() to avoid cascading renders
              useAuthStore.getState().signOut();
            }
          }
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        if (isSubscribed) {
          setLoading(false);
        }
      } finally {
        // Reset processing flag after a delay (matches debounce time)
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 100);
      }
    });

    return () => {
      isSubscribed = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // Remove dependencies to prevent re-subscription

  // Initialize notification handler when navigation is ready
  const handleNavigationReady = () => {
    console.log('🧭 Navigation ready');
    if (navigationRef.current) {
      notificationHandler.initialize(navigationRef.current);
      notificationHandler.handleAppLaunchFromNotification();
      console.log('✅ Notification handler initialized with navigation ref');
    } else {
      console.error('❌ Navigation ref is null in onReady');
    }
  };

  // Setup app state listener for Supabase-owned auto-refresh.
  useEffect(() => {
    setupAppStateListener();
    
    return () => {
      removeAppStateListener();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      notificationHandler.cleanup();
    };
  }, []);

  // Handle initial navigation based on onboarding status
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    
    // Skip during logout transition — user is being cleared
    if (!user || useAuthStore.getState().isSigningOut) return;
    
    // Wait for navigation to be ready
    if (!navigationRef.current) return;
    
    const currentRoute = navigationRef.current.getCurrentRoute()?.name;
    const isOnboardingScreen = currentRoute === 'PersonalizationQuiz' || currentRoute === 'TeacherOnboardingQuiz';
    
    // Determine which onboarding screen to show (if any)
    if (onboardingCompleted === false) {
      if (user.user_type === 'student' && currentRoute !== 'PersonalizationQuiz') {
        navigationRef.current.navigate('PersonalizationQuiz' as never);
      } else if (user.user_type === 'teacher' && currentRoute !== 'TeacherOnboardingQuiz') {
        navigationRef.current.navigate('TeacherOnboardingQuiz' as never);
      }
    } else if (isOnboardingScreen && onboardingCompleted === true) {
      navigationRef.current.navigate('Main' as never);
    }
  }, [isAuthenticated, isLoading, onboardingCompleted, user?.user_type]);

  // Initialize messaging store and register for notifications when user logs in
  useEffect(() => {
    if (user?.id) {
      initializeMessagingForUser();
      registerForNotifications();
      // Subscribe to real-time notifications
      notificationRealtimeService.subscribe(user.id);
    } else {
      // Unsubscribe when user logs out
      notificationRealtimeService.unsubscribe();
    }

    return () => {
      notificationRealtimeService.unsubscribe();
    };
  }, [user?.id]);

  // Update unsynced count periodically
  useEffect(() => {
    const updateUnsyncedCount = async () => {
      const count = await offlineService.getUnsyncedCount();
      setUnsyncedCount(count);
    };

    updateUnsyncedCount();
    const interval = setInterval(updateUnsyncedCount, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Background download questions when online and user is authenticated.
  // Offline sync is owned by OfflineProvider/offlineSyncService to avoid duplicate writes.
  useEffect(() => {
    let hasDownloaded = false;

    const performBackgroundTasks = async () => {
      if (!isOnline || !user?.id || hasDownloaded) return;

      try {
        // Get student ID for smart download
        const { data: studentData } = await supabase
          .from('students')
          .select('id, target_group')
          .eq('user_id', user.id)
          .maybeSingle();

        // Then, download questions for offline use (only once per session)
        console.log('📥 Starting background question download...');
        hasDownloaded = true;
        
        // Use smart download if we have student ID (prioritizes weak topics)
        // Otherwise fall back to regular download
        if (studentData?.id) {
          const downloadResult = await practiceService.smartBackgroundDownload(studentData.id, 30, 60, undefined, studentData.target_group);
          if (downloadResult.success) {
            console.log(`✅ Smart download complete: ${downloadResult.subjectsDownloaded} subjects, ${downloadResult.totalQuestions} questions, ${downloadResult.weakSubjectsPrioritized} weak subjects prioritized`);
          }
        } else {
          const downloadResult = await practiceService.backgroundDownloadAllSubjects(30, undefined);
          if (downloadResult.success) {
            console.log(`✅ Background download complete: ${downloadResult.subjectsDownloaded} subjects, ${downloadResult.totalQuestions} questions`);
          }
        }
      } catch (error) {
        console.error('Background tasks error:', error);
      }
    };

    // Delay background tasks to not interfere with app startup
    const timeout = setTimeout(performBackgroundTasks, 3000);

    return () => clearTimeout(timeout);
  }, [isOnline, user?.id]);

  const initializeMessagingForUser = async () => {
    try {
      // Check if student
      const { data: studentData } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (studentData) {
        console.log('💬 Initializing messaging for student:', studentData.id);
        initializeMessaging(studentData.id, 'student');
        return;
      }

      // Check if teacher
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (teacherData) {
        console.log('💬 Initializing messaging for teacher:', teacherData.id);
        initializeMessaging(teacherData.id, 'teacher');
      }
    } catch (error) {
      console.error('Error initializing messaging:', error);
    }
  };

  const registerForNotifications = async () => {
    try {
      const success = await notificationService.registerDevice(user!.id);
      if (success) {
        console.log('✅ Device registered for push notifications');
      }
    } catch (error) {
      console.error('❌ Failed to register device:', error);
    }
  };

  // Pre-fetch student data (studentId and scoreData) for Profile tab
  const fetchStudentData = async (userId: string) => {
    try {
      console.log('🔍 Fetching student data for userId:', userId);
      
      // Fetch student ID and score data
      const { data: student, error } = await supabase
        .from('students')
        .select('id, elo_rating, monthly_score, activity_multiplier, bonus_points, current_streak, best_streak, onboarding_completed')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching student data:', error);
        // Default to NOT completed so quiz is shown (safe fallback)
        useAuthStore.getState().setOnboardingCompleted(false);
        return;
      }

      if (student) {
        const scoreData = {
          eloRating: student.elo_rating || 1200,
          monthlyScore: student.monthly_score || 0,
          activityMultiplier: student.activity_multiplier || 1.0,
          bonusPoints: student.bonus_points || 0,
          currentStreak: Math.max(student.current_streak || 0, 0),
          bestStreak: Math.max(student.best_streak || 0, 0),
        };
        setStudentData(student.id, scoreData);
        
        // Phase 2: Track onboarding completion status
        // Must be explicitly true to be considered completed (null/undefined/false = not completed)
        const isOnboardingDone = student.onboarding_completed === true;
        console.log('📊 Student onboarding_completed from DB:', student.onboarding_completed, '-> isOnboardingDone:', isOnboardingDone);
        useAuthStore.getState().setOnboardingCompleted(isOnboardingDone);
        console.log('✅ Pre-fetched student data:', student.id, 'onboarding_completed:', isOnboardingDone);
      } else {
        console.warn('⚠️ No student record found for userId:', userId);
        useAuthStore.getState().setOnboardingCompleted(false);
      }
    } catch (error) {
      console.error('❌ Exception pre-fetching student data:', error);
      useAuthStore.getState().setOnboardingCompleted(false);
    }
  };

  // Pre-fetch teacher data and onboarding status
  const fetchTeacherData = async (userId: string) => {
    try {
      console.log('🔍 Fetching teacher data for userId:', userId);
      
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select('id, onboarding_completed')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching teacher data:', error);
        useAuthStore.getState().setOnboardingCompleted(false);
        return;
      }

      if (teacher) {
        const isOnboardingDone = teacher.onboarding_completed === true;
        console.log('📊 Teacher onboarding_completed from DB:', teacher.onboarding_completed, '-> isOnboardingDone:', isOnboardingDone);
        useAuthStore.getState().setOnboardingCompleted(isOnboardingDone);
        console.log('✅ Pre-fetched teacher data:', teacher.id, 'onboarding_completed:', isOnboardingDone);
      } else {
        console.warn('⚠️ No teacher record found for userId:', userId);
        useAuthStore.getState().setOnboardingCompleted(false);
      }
    } catch (error) {
      console.error('❌ Exception pre-fetching teacher data:', error);
      useAuthStore.getState().setOnboardingCompleted(false);
    }
  };

  const fetchUserProfile = async (userId: string, isCurrentlyOnline: boolean = true) => {
    try {
      console.log('Fetching profile for user:', userId, 'Online:', isCurrentlyOnline);
      
      // If offline, try to use cached profile first
      if (!isCurrentlyOnline) {
        const cachedProfile = await offlineService.getCachedUserProfile();
        if (cachedProfile && cachedProfile.id === userId) {
          console.log('📴 Offline - using cached profile:', cachedProfile.full_name);
          setUser(cachedProfile);
          // Offline — assume onboarding completed to avoid blocking
          useAuthStore.getState().setOnboardingCompleted(true);
          setLoading(false);
          return;
        }
      }
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Profile doesn't exist or network error
        console.log('Profile fetch error:', error.message);
        
        // Check if this is a "not found" error (user was deleted)
        // PGRST116 = "JSON object requested, multiple (or no) rows returned"
        const isUserDeleted = error.code === 'PGRST116' || 
                              error.message?.includes('no rows') ||
                              error.message?.includes('0 rows');
        
        if (isUserDeleted && isCurrentlyOnline) {
          // User was deleted - clear all cached data and sign out
          console.log('🗑️ User profile not found - account may have been deleted');
          await offlineService.clearCachedUserProfile();
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        
        // Try cached profile as fallback (only if offline or network error)
        if (!isCurrentlyOnline) {
          const cachedProfile = await offlineService.getCachedUserProfile();
          if (cachedProfile && cachedProfile.id === userId) {
            console.log('📴 Using cached profile after error:', cachedProfile.full_name);
            setUser(cachedProfile);
            useAuthStore.getState().setOnboardingCompleted(true);
            setLoading(false);
            return;
          }
        }
        
        setUser(null);
        setLoading(false);
        return;
      }
      
      console.log('Profile found:', data.full_name);

      // Block admin users from accessing the mobile app
      if (data.user_type !== 'student' && data.user_type !== 'teacher') {
        console.log('🚫 Admin user detected in mobile app - signing out');
        await offlineService.clearCachedUserProfile();
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      
      // Merge auth email into profile data (profiles table doesn't store email)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const authEmail = authUser?.email || '';
      const userWithEmail = { ...data, email: data.email || authEmail };
      
      // Cache the profile for offline use
      await offlineService.cacheUserProfile(userWithEmail);
      
      setUser(userWithEmail);
      
      // Pre-fetch role-specific data and onboarding status
      // IMPORTANT: Await these to ensure onboarding status is set before navigation
      if (data.user_type === 'student') {
        await fetchStudentData(userId);
      } else if (data.user_type === 'teacher') {
        await fetchTeacherData(userId);
      } else {
        // Safety: unknown user_type — skip onboarding
        useAuthStore.getState().setOnboardingCompleted(true);
      }
      
      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      
      // Check if this might be an auth error (deleted user trying to access)
      if (error?.message?.includes('JWT') || error?.message?.includes('token') || 
          error?.code === 'PGRST301') {
        console.log('🗑️ Auth error - clearing session');
        await offlineService.clearCachedUserProfile();
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      
      // Try cached profile as fallback for other errors
      const cachedProfile = await offlineService.getCachedUserProfile();
      if (cachedProfile && cachedProfile.id === userId) {
        console.log('📴 Using cached profile after exception:', cachedProfile.full_name);
        setUser(cachedProfile);
        // Cached profile — skip onboarding to avoid blocking
        useAuthStore.getState().setOnboardingCompleted(true);
        setLoading(false);
        return;
      }
      
      setUser(null);
      setLoading(false);
    }
  };

  // Show loading screen while checking session or waiting for onboarding status
  // onboardingCompleted === null means we haven't fetched from DB yet
  if (isLoading || (isAuthenticated && user && onboardingCompleted === null)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      {!isOnline && <OfflineBanner unsyncedCount={unsyncedCount} />}
      <NavigationContainer 
        ref={navigationRef}
        onReady={handleNavigationReady}
        theme={{
          dark: isDark,
          colors: {
            ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            primary: colors.primary,
          },
          fonts: DefaultTheme.fonts,
        }}
      >
        <DeepLinkHandler />
        <Stack.Navigator 
          initialRouteName={
            isAuthenticated 
              ? (onboardingCompleted === true ? 'Main' : (user?.user_type === 'teacher' ? 'TeacherOnboardingQuiz' : 'PersonalizationQuiz'))
              : 'Auth'
          }
          screenOptions={{ 
            headerShown: false,
            cardStyle: { backgroundColor: colors.background },
            cardOverlayEnabled: true,
            cardShadowEnabled: false,
          }}>
        {isAuthenticated ? (
          <>
            {/* Phase 2: Onboarding quizzes for new students/teachers - shown first if not completed */}
            {!onboardingCompleted && user?.user_type === 'student' && (
              <Stack.Screen 
                name="PersonalizationQuiz" 
                component={PersonalizationQuizScreen}
                options={{ headerShown: false }}
              />
            )}
            {!onboardingCompleted && user?.user_type === 'teacher' && (
              <Stack.Screen 
                name="TeacherOnboardingQuiz" 
                component={TeacherOnboardingQuizScreen}
                options={{ headerShown: false }}
              />
            )}
            <Stack.Screen name="Main" component={MainTabs} />
            {/* Keep onboarding screens available for navigation even after completion (for edge cases) */}
            {onboardingCompleted && (
              <>
                <Stack.Screen 
                  name="PersonalizationQuiz" 
                  component={PersonalizationQuizScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen 
                  name="TeacherOnboardingQuiz" 
                  component={TeacherOnboardingQuizScreen}
                  options={{ headerShown: false }}
                />
              </>
            )}
            <Stack.Screen 
              name="Profile" 
              component={ProfileScreen}
              options={{
                presentation: 'modal',
                headerShown: true,
                headerTitle: 'Profile',
              }}
            />
            
            {/* Stage 9: Profile Screens */}
            <Stack.Screen name="StudentProfile" component={StudentProfileScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="TeacherOwnProfile" component={TeacherOwnProfileScreen} />
            <Stack.Screen name="AvailabilityManagement" component={AvailabilityManagementScreen} />
            
            {/* Stage 10.2: Teacher Management */}
            <Stack.Screen 
              name="MyTeachers" 
              component={MyTeachersScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="MyBookings"
              component={MyBookingsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="MySubscriptions"
              component={MySubscriptionsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="SubscriptionTeacherProfile"
              component={TeacherProfileScreen as React.ComponentType<any>}
              options={{ headerShown: false }}
            />
            
            {/* Stage 9: Settings Screens */}
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
            
            {/* Notification Center */}
            <Stack.Screen
              name="NotificationCenter"
              component={NotificationCenterScreen}
              options={{ headerShown: false }}
            />

            {/* Teacher Exam Features */}
            <Stack.Screen
              name="TeacherMyExams"
              component={TeacherMyExamsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TeacherAddQuestion"
              component={TeacherAddQuestionScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TeacherBuildExam"
              component={TeacherBuildExamScreen}
              options={{ headerShown: false }}
            />
            
            {/* Stage 9: Account Screens */}
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="AccountManagement" component={AccountManagementScreen} />
            
            {/* Stage 9: Support Screens */}
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            
            {/* Stage 9: Legal Screens */}
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
            
            {/* Stage 10: Messaging Screens */}
            <Stack.Screen 
              name="ConversationsList" 
              component={ConversationsListScreen}
              options={{
                headerShown: true,
                headerTitle: t('messaging.conversations.title'),
                headerStyle: {
                  backgroundColor: colors.surface,
                },
                headerTintColor: colors.text,
                headerTitleStyle: {
                  color: colors.text,
                },
              }}
            />
            <Stack.Screen 
              name="Chat" 
              component={ChatScreen}
              options={{
                headerShown: true,
                headerBackTitle: 'Back',
                headerStyle: {
                  backgroundColor: colors.surface,
                },
                headerTintColor: colors.text,
                headerTitleStyle: {
                  color: colors.text,
                },
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.background,
  },
});
