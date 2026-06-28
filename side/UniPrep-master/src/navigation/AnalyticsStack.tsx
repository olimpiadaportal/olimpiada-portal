import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { AnalyticsScreen } from '../screens/student/AnalyticsScreen';
import { LeaderboardScreen } from '../screens/student/LeaderboardScreen';
import { ScorePredictionScreen } from '../screens/student/ScorePredictionScreen';

export type AnalyticsStackParamList = {
  AnalyticsMain: undefined;
  Leaderboard: undefined;
  ScorePrediction: undefined;
};

const Stack = createStackNavigator<AnalyticsStackParamList>();

export const AnalyticsStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={{ 
      headerShown: false,
      cardStyle: { backgroundColor: colors.background },
      cardOverlayEnabled: true,
      cardShadowEnabled: false,
    }}>
      <Stack.Screen name="AnalyticsMain" component={AnalyticsScreen} />
      <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Stack.Screen name="ScorePrediction" component={ScorePredictionScreen} />
    </Stack.Navigator>
  );
};
