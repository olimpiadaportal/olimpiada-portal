import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { TeacherMyExamsScreen } from '../screens/teachers/TeacherMyExamsScreen';
import { TeacherBuildExamScreen } from '../screens/teachers/TeacherBuildExamScreen';
import { TeacherAddQuestionScreen } from '../screens/teachers/TeacherAddQuestionScreen';

export type TeacherExamsStackParamList = {
  TeacherExamsMain: undefined;
  TeacherBuildExam: undefined;
  TeacherAddQuestion: undefined;
};

const Stack = createStackNavigator<TeacherExamsStackParamList>();

export const TeacherExamsStack = () => {
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
      <Stack.Screen name="TeacherExamsMain" component={TeacherMyExamsScreen} />
      <Stack.Screen name="TeacherBuildExam" component={TeacherBuildExamScreen} />
      <Stack.Screen name="TeacherAddQuestion" component={TeacherAddQuestionScreen} />
    </Stack.Navigator>
  );
};
