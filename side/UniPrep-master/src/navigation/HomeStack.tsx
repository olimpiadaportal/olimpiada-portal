import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { HomeScreen } from '../screens/student/HomeScreen';
import { AllDeadlinesScreen } from '../screens/student/AllDeadlinesScreen';
import { AllActivityScreen } from '../screens/student/AllActivityScreen';
import { AllInsightsScreen } from '../screens/student/AllInsightsScreen';
import { GoalSettingScreen } from '../screens/student/GoalSettingScreen';
import { StudyPlanScreen } from '../screens/student/StudyPlanScreen';
import { ScorePredictionScreen } from '../screens/student/ScorePredictionScreen';

const Stack = createStackNavigator();

export const HomeStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={{ 
      headerShown: false,
      cardStyle: { backgroundColor: colors.background },
      cardOverlayEnabled: true,
      cardShadowEnabled: false,
    }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="AllDeadlines" component={AllDeadlinesScreen} />
      <Stack.Screen name="AllActivity" component={AllActivityScreen} />
      <Stack.Screen name="AllInsights" component={AllInsightsScreen} />
      <Stack.Screen name="GoalSetting" component={GoalSettingScreen} />
      <Stack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <Stack.Screen name="ScorePrediction" component={ScorePredictionScreen} />
    </Stack.Navigator>
  );
};
