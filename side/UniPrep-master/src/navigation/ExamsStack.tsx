import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { ExamsHubScreen } from '../screens/exams/ExamsHubScreen';
import { OfficialExamsListScreen } from '../screens/exams/OfficialExamsListScreen';
import { TeacherExamListScreen } from '../screens/exams/TeacherExamListScreen';
import { MockExamsListScreen } from '../screens/exams/MockExamsListScreen';
import { MockExamDetailsScreen } from '../screens/exams/MockExamDetailsScreen';
import { ExamInstructionsScreen } from '../screens/exams/ExamInstructionsScreen';
import { MockExamScreen } from '../screens/exams/MockExamScreen';
import { ExamGradingScreen } from '../screens/exams/ExamGradingScreen';
import { ExamResultsScreen } from '../screens/exams/ExamResultsScreen';
import { ExamReviewScreen } from '../screens/exams/ExamReviewScreen';

export type ExamsStackParamList = {
  ExamsHub: undefined;
  OfficialExamsList: undefined;
  TeacherExamList: {
    teacherId: string;
    teacherName: string;
    teacherAvatar?: string;
  };
  MockExamsList: undefined;
  MockExamDetails: { examId: string };
  ExamInstructions: {
    examId: string;
    examTitle: string;
    duration: number;
    totalQuestions: number;
  };
  MockExam: { attemptId: string };
  ExamGrading: {
    attemptId: string;
    mcqCount: number;
    codableCount: number;
    writtenCount: number;
  };
  ExamResults: { attemptId: string };
  ExamReview: { attemptId: string };
};

const Stack = createStackNavigator<ExamsStackParamList>();

export const ExamsStack = () => {
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
      <Stack.Screen name="ExamsHub" component={ExamsHubScreen} />
      <Stack.Screen name="OfficialExamsList" component={OfficialExamsListScreen} />
      <Stack.Screen name="TeacherExamList" component={TeacherExamListScreen} />
      <Stack.Screen name="MockExamsList" component={MockExamsListScreen} />
      <Stack.Screen name="MockExamDetails" component={MockExamDetailsScreen} />
      <Stack.Screen
        name="ExamInstructions"
        component={ExamInstructionsScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="MockExam"
        component={MockExamScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="ExamGrading"
        component={ExamGradingScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="ExamResults" component={ExamResultsScreen} />
      <Stack.Screen name="ExamReview" component={ExamReviewScreen} />
    </Stack.Navigator>
  );
};

