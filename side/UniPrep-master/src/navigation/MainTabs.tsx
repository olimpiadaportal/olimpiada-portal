import React, { useCallback } from 'react';
import { AlertService } from '../components/AlertModal';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MainTabParamList } from '../types';
import { HomeStack } from './HomeStack';
import { AnalyticsStack } from './AnalyticsStack';
import { PracticeStack } from './PracticeStack';
import { ExamsStack } from './ExamsStack';
import { TeachersStack } from './TeachersStack';
import { TeacherDashboardStack } from './TeacherDashboardStack';
import { TeacherExamsStack } from './TeacherExamsStack';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { TeacherBookingsScreen } from '../screens/teachers/TeacherBookingsScreen';
import { ActivityStack } from './ActivityStack';
import { useAuthStore } from '../store/authStore';
import { useTheme } from '../contexts/ThemeContext';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { usePracticeStore } from '../store/practiceStore';
import { useExamStore } from '../store/examStore';
import { mockExamService } from '../services/mockExamService';
import { CustomTabBar, TAB_BAR_CONTENT_HEIGHT } from '../components/navigation/CustomTabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createBottomTabNavigator<MainTabParamList>();

type RouteWithNestedState = {
  key?: string;
  name?: string;
  state?: {
    key?: string;
    index?: number;
    routes?: RouteWithNestedState[];
  };
};

const getFocusedNestedRouteName = (route?: RouteWithNestedState): string | undefined => {
  let focusedRoute = route;

  while (focusedRoute?.state?.routes?.length) {
    const routes = focusedRoute.state.routes;
    const focusedIndex =
      typeof focusedRoute.state.index === 'number'
        ? focusedRoute.state.index
        : routes.length - 1;

    focusedRoute = routes[focusedIndex] ?? routes[routes.length - 1];
  }

  return focusedRoute?.name;
};

const resetNestedStack = (
  navigation: any,
  route: RouteWithNestedState | undefined,
  rootScreen: string
) => {
  const nestedKey = route?.state?.key;

  if (!nestedKey) {
    return;
  }

  navigation.dispatch({
    ...CommonActions.reset({
      index: 0,
      routes: [{ name: rootScreen }],
    }),
    target: nestedKey,
  });
};

export const MainTabs = () => {
  const { t } = useTranslation();
  const { user, isSigningOut } = useAuthStore();
  const { colors, activeTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { flags, loading: flagsLoading } = useFeatureFlags();

  // CRITICAL: Use a ref to preserve the user type during logout.
  // When signing out, user becomes null which would change isTeacher from true to false,
  // causing the entire tab navigator structure to change (teacher tabs → student tabs).
  // This structural change during logout triggers React Navigation's internal state
  // reconciliation, which combined with other state updates creates a cascading
  // re-render loop that exceeds React's maximum update depth.
  // By preserving the last known user type during logout, we prevent this structural change.
  const lastUserTypeRef = React.useRef(user?.user_type);
  if (user?.user_type && !isSigningOut) {
    lastUserTypeRef.current = user.user_type;
  }
  const isTeacher = isSigningOut ? lastUserTypeRef.current === 'teacher' : user?.user_type === 'teacher';
  
  // Session stores for checking active sessions
  const practiceStore = usePracticeStore();
  const examStore = useExamStore();
  
  // Helper to check if user is in an active practice session
  const isInActivePracticeSession = useCallback(() => {
    const state = practiceStore;
    // Has active session if there's a sessionId and questions loaded
    return state.sessionId !== null && state.questions.length > 0;
  }, [practiceStore]);

  // Helper to check if user is in an active exam session
  const isInActiveExamSession = useCallback(() => {
    const state = examStore;
    // Has active session if there's a sessionId
    return state.sessionId !== null;
  }, [examStore]);

  // Handle exit from practice with confirmation
  const handlePracticeExit = useCallback((navigation: any, targetTab: string) => {
    AlertService.confirm(
      t('practice.session.exitPractice'),
      t('practice.session.exitPracticeMessage'),
      () => {
        practiceStore.clearSession();
        navigation.navigate(targetTab);
      },
      undefined,
      t('practice.session.exit'),
      t('practice.session.cancel')
    );
  }, [t, practiceStore]);

  // Handle exit from exam with confirmation
  const handleExamExit = useCallback((
    navigation: any,
    targetTab: string,
    attemptId: string | null,
    currentRoute?: RouteWithNestedState
  ) => {
    AlertService.confirm(
      t('exams.session.exitExam'),
      t('exams.session.exitExamMessage'),
      async () => {
        // Abandon the exam attempt
        if (attemptId) {
          await mockExamService.abandonExamAttempt(attemptId);
        }
        examStore.clearSession();
        resetNestedStack(navigation, currentRoute, 'ExamsHub');
        navigation.navigate(targetTab);
      },
      undefined,
      t('common.exit'),
      t('common.cancel')
    );
  }, [t, examStore]);

  // Handle exit from competitive quiz with confirmation
  const handleCompetitiveExit = useCallback((
    navigation: any,
    targetTab: string,
    currentRoute?: RouteWithNestedState
  ) => {
    AlertService.confirm(
      t('competitive.exitQuiz'),
      t('competitive.exitQuizWarning'),
      () => {
        resetNestedStack(navigation, currentRoute, 'ModeSelection');
        navigation.navigate(targetTab);
      },
      undefined,
      t('common.exit'),
      t('common.cancel')
    );
  }, [t]);

  // Handle exit from competitive AND reset to ModeSelection (for same-tab press)
  const handleCompetitiveExitAndReset = useCallback((navigation: any, currentRoute?: RouteWithNestedState) => {
    AlertService.confirm(
      t('competitive.exitQuiz'),
      t('competitive.exitQuizWarning'),
      () => {
        resetNestedStack(navigation, currentRoute, 'ModeSelection');
        navigation.navigate('Practice');
      },
      undefined,
      t('common.exit'),
      t('common.cancel')
    );
  }, [t]);

  // Handle exit from practice AND reset to ModeSelection (for same-tab press)
  const handlePracticeExitAndReset = useCallback((navigation: any) => {
    AlertService.confirm(
      t('practice.session.exitPractice'),
      t('practice.session.exitPracticeMessage'),
      () => {
        practiceStore.clearSession();
        // Reset to ModeSelection within Practice tab
        navigation.navigate('Practice', { screen: 'ModeSelection' });
      },
      undefined,
      t('practice.session.exit'),
      t('practice.session.cancel')
    );
  }, [t, practiceStore]);

  // Handle exit from exam AND reset to MockExamsList (for same-tab press)
  const handleExamExitAndReset = useCallback((
    navigation: any,
    attemptId: string | null,
    currentRoute?: RouteWithNestedState
  ) => {
    AlertService.confirm(
      t('exams.session.exitExam'),
      t('exams.session.exitExamMessage'),
      async () => {
        // Abandon the exam attempt
        if (attemptId) {
          await mockExamService.abandonExamAttempt(attemptId);
        }
        examStore.clearSession();
        resetNestedStack(navigation, currentRoute, 'ExamsHub');
        navigation.navigate('MockExams');
      },
      undefined,
      t('common.exit'),
      t('common.cancel')
    );
  }, [t, examStore]);

  // Create tab press handler that checks for active sessions
  const createSessionAwareTabPressHandler = useCallback((targetTab: string, currentTab: string) => {
    return ({ navigation }: any) => ({
      tabPress: (e: any) => {
        // Get current navigation state to check which screen is active
        const state = navigation.getState();
        const currentRoute = state.routes[state.index];
        
        // Check if navigating away from Practice tab with active session
        if (currentRoute.name === 'Practice' && targetTab !== 'Practice') {
          const focusedRouteName = getFocusedNestedRouteName(currentRoute);
          const isOnPracticeScreen = focusedRouteName === 'QuestionPractice';
          
          if (isOnPracticeScreen && isInActivePracticeSession()) {
            e.preventDefault();
            handlePracticeExit(navigation, targetTab);
            return;
          }
          
          // Check if in active competitive quiz session
          const isOnCompetitiveQuiz = focusedRouteName === 'CompetitiveQuiz';
          
          if (isOnCompetitiveQuiz) {
            e.preventDefault();
            handleCompetitiveExit(navigation, targetTab, currentRoute);
            return;
          }
        }
        
        // Check if navigating away from MockExams tab with active session
        if (currentRoute.name === 'MockExams' && targetTab !== 'MockExams') {
          // Check if in active exam session (on MockExam screen)
          const isOnExamScreen = getFocusedNestedRouteName(currentRoute) === 'MockExam';
          
          if (isOnExamScreen && isInActiveExamSession()) {
            e.preventDefault();
            handleExamExit(navigation, targetTab, examStore.sessionId, currentRoute);
            return;
          }
        }
        
        // For same-tab press, handle reset behavior (only for tabs with stacks)
        if (targetTab === currentTab && currentRoute.name === targetTab) {
          // Only prevent default for tabs that need special handling
          if (targetTab === 'Practice') {
            e.preventDefault();
            const focusedRouteName = getFocusedNestedRouteName(currentRoute);
            const isOnPracticeScreen = focusedRouteName === 'QuestionPractice';
            
            if (isOnPracticeScreen && isInActivePracticeSession()) {
              handlePracticeExitAndReset(navigation);
              return;
            }
            
            // Check for active competitive quiz
            const isOnCompetitiveQuiz = focusedRouteName === 'CompetitiveQuiz';
            
            if (isOnCompetitiveQuiz) {
              handleCompetitiveExitAndReset(navigation, currentRoute);
              return;
            }
            
            // Reset to ModeSelection
            navigation.navigate('Practice', { screen: 'ModeSelection' });
          } else if (targetTab === 'MockExams') {
            e.preventDefault();
            const isOnExamScreen = getFocusedNestedRouteName(currentRoute) === 'MockExam';
            
            if (isOnExamScreen && isInActiveExamSession()) {
              // Show exit alert, then reset to ExamsHub
              handleExamExitAndReset(navigation, examStore.sessionId, currentRoute);
              return;
            }
            // Reset to ExamsHub
            navigation.navigate('MockExams', { screen: 'ExamsHub' });
          } else if (targetTab === 'Analytics') {
            e.preventDefault();
            navigation.navigate('Analytics', { screen: 'AnalyticsMain' });
          } else if (targetTab === 'Home') {
            e.preventDefault();
            navigation.navigate('Home', { screen: 'HomeMain' });
          } else if (targetTab === 'Teachers') {
            e.preventDefault();
            navigation.navigate('Teachers', { screen: 'TeachersList' });
          }
          // For Profile and other simple screens, don't prevent default - let normal behavior happen
        }
      },
    });
  }, [isInActivePracticeSession, isInActiveExamSession, handlePracticeExit, handleExamExit, handlePracticeExitAndReset, handleExamExitAndReset, handleCompetitiveExit, handleCompetitiveExitAndReset, examStore.sessionId]);

  // CRITICAL: All hooks must be called before any conditional return (Rules of Hooks).
  // Wait for feature flags so the tab structure is stable from the first render,
  // preventing the structural Tab.Screen change that freezes navigation on iPad/Android.
  if (flagsLoading) {
    return null;
  }

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} isTeacher={isTeacher} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          paddingBottom: TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8),
          backgroundColor: colors.background,
        },
      }}
    >
      {isTeacher ? (
        // Teacher Tabs
        <>
          <Tab.Screen 
            name="TeacherDashboard"
            component={TeacherDashboardStack}
            options={{
              tabBarLabel: t('tabs.dashboard'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="grid" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="TeacherBookings"
            component={TeacherBookingsScreen}
            options={{
              tabBarLabel: t('tabs.bookings'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="TeacherExams"
            component={TeacherExamsStack}
            options={{
              tabBarLabel: t('tabs.exams'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="document-text" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="TeacherActivity"
            component={ActivityStack}
            options={{
              tabBarLabel: t('tabs.activity'),
              tabBarIcon: ({ color, size}) => (
                <Ionicons name="pulse" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen 
            name="Profile" 
            component={ProfileScreen}
            options={{
              tabBarLabel: t('profile.title'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="person" size={size} color={color} />
              ),
            }}
          />
        </>
      ) : (
        // Student Tabs
        <>
          <Tab.Screen 
            name="Home" 
            component={HomeStack}
            options={{
              tabBarLabel: t('tabs.home'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home" size={size} color={color} />
              ),
            }}
            listeners={createSessionAwareTabPressHandler('Home', 'Home')}
          />
          <Tab.Screen 
            name="Practice" 
            component={PracticeStack}
            options={{
              tabBarLabel: t('tabs.practice'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="book" size={size} color={color} />
              ),
            }}
            listeners={createSessionAwareTabPressHandler('Practice', 'Practice')}
          />
          <Tab.Screen 
            name="MockExams" 
            component={ExamsStack}
            options={{
              tabBarLabel: t('tabs.exams'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="document-text" size={size} color={color} />
              ),
            }}
            listeners={createSessionAwareTabPressHandler('MockExams', 'MockExams')}
          />
          {/* Teachers Tab - Controlled by teacher_marketplace feature flag */}
          {flags.teacher_marketplace && (
            <Tab.Screen 
              name="Teachers" 
              component={TeachersStack}
              options={{
                tabBarLabel: t('tabs.teachers'),
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people" size={size} color={color} />
                ),
              }}
              listeners={createSessionAwareTabPressHandler('Teachers', 'Teachers')}
            />
          )}
          <Tab.Screen 
            name="Analytics" 
            component={AnalyticsStack}
            options={{
              tabBarLabel: t('tabs.analytics'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="analytics" size={size} color={color} />
              ),
            }}
            listeners={createSessionAwareTabPressHandler('Analytics', 'Analytics')}
          />
          <Tab.Screen 
            name="Profile" 
            component={ProfileScreen}
            options={{
              tabBarLabel: t('profile.title'),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="person" size={size} color={color} />
              ),
            }}
            listeners={createSessionAwareTabPressHandler('Profile', 'Profile')}
          />
        </>
      )}
    </Tab.Navigator>
  );
};
