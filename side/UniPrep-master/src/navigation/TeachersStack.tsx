import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { TeachersListScreen } from '../screens/teachers/TeachersListScreen';
import { TeacherProfileScreen } from '../screens/teachers/TeacherProfileScreen';
import { BookingScreen } from '../screens/teachers/BookingScreen';
import { GlobalSearchScreen } from '../screens/search/GlobalSearchScreen';
import { BookingConfirmationScreen } from '../screens/teachers/BookingConfirmationScreen';
import { MyBookingsScreen } from '../screens/teachers/MyBookingsScreen';
import { LeaveReviewScreen } from '../screens/teachers/LeaveReviewScreen';
import { FavoriteTeachersScreen } from '../screens/teachers/FavoriteTeachersScreen';
import { RequestStatusScreen } from '../screens/teachers/RequestStatusScreen';
import { TeacherDashboardScreen } from '../screens/teachers/TeacherDashboardScreen';
import { TeacherBookingsScreen } from '../screens/teachers/TeacherBookingsScreen';
import { TeacherEarningsScreen } from '../screens/teachers/TeacherEarningsScreen';
import { TeacherReviewsScreen } from '../screens/teachers/TeacherReviewsScreen';

export type TeachersStackParamList = {
  TeachersList: undefined;
  GlobalSearch: undefined;
  TeacherProfile: { teacherId: string };
  Booking: { teacher: any };
  BookingConfirmation: { booking: any };
  MyBookings: undefined;
  LeaveReview: { booking: any; teacher: any };
  FavoriteTeachers: undefined;
  RequestStatus: { bookingId: string };
  TeacherDashboard: undefined;
  TeacherBookings: undefined;
  TeacherEarnings: undefined;
  TeacherReviews: undefined;
};

const Stack = createStackNavigator<TeachersStackParamList>();

export const TeachersStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
        cardOverlayEnabled: true,
        cardShadowEnabled: false,
      }}
    >
      {/* Student-side screens */}
      <Stack.Screen name="TeachersList" component={TeachersListScreen} />
      <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TeacherProfile" component={TeacherProfileScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="BookingConfirmation" component={BookingConfirmationScreen} />
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
      <Stack.Screen name="LeaveReview" component={LeaveReviewScreen} />
      <Stack.Screen name="FavoriteTeachers" component={FavoriteTeachersScreen} />
      <Stack.Screen name="RequestStatus" component={RequestStatusScreen} />
      
      {/* Teacher-side screens */}
      <Stack.Screen name="TeacherDashboard" component={TeacherDashboardScreen} />
      <Stack.Screen name="TeacherBookings" component={TeacherBookingsScreen} />
      <Stack.Screen name="TeacherEarnings" component={TeacherEarningsScreen} />
      <Stack.Screen name="TeacherReviews" component={TeacherReviewsScreen} />
    </Stack.Navigator>
  );
};
