import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { TeacherEarningsScreen } from '../screens/teachers/TeacherEarningsScreen';
import { WalletScreen } from '../screens/teachers/WalletScreen';
import { TeacherSubscribersScreen } from '../screens/teachers/TeacherSubscribersScreen';

export type ActivityStackParamList = {
  ActivityMain: undefined;
  Wallet: undefined;
  Subscribers: undefined;
};

const Stack = createStackNavigator<ActivityStackParamList>();

export const ActivityStack = () => {
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
      <Stack.Screen name="ActivityMain" component={TeacherEarningsScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Subscribers" component={TeacherSubscribersScreen} />
    </Stack.Navigator>
  );
};
