import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { TeacherDashboardScreen } from '../screens/teachers/TeacherDashboardScreen';
import { TeacherReviewsScreen } from '../screens/teachers/TeacherReviewsScreen';
import { AvailabilityManagementScreen } from '../screens/teachers/AvailabilityManagementScreen';
import { TimeOffScreen } from '../screens/teachers/TimeOffScreen';
import { WalletScreen } from '../screens/teachers/WalletScreen';

export type TeacherDashboardStackParamList = {
  TeacherDashboardMain: undefined;
  TeacherReviews: undefined;
  AvailabilityManagement: undefined;
  TimeOff: undefined;
  Wallet: undefined;
};

const Stack = createStackNavigator<TeacherDashboardStackParamList>();

export const TeacherDashboardStack = () => {
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
      <Stack.Screen name="TeacherDashboardMain" component={TeacherDashboardScreen} />
      <Stack.Screen name="TeacherReviews" component={TeacherReviewsScreen} />
      <Stack.Screen name="AvailabilityManagement" component={AvailabilityManagementScreen} />
      <Stack.Screen name="TimeOff" component={TimeOffScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
    </Stack.Navigator>
  );
};
