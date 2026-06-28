import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import { ModeSelectionScreen } from '../screens/practice/ModeSelectionScreen';
import { SubjectsListScreen } from '../screens/practice/SubjectsListScreen';
import { SubjectDetailScreen } from '../screens/practice/SubjectDetailScreen';
import { PracticeScreen } from '../screens/practice/PracticeScreen';
import { AnswerFeedbackScreen } from '../screens/practice/AnswerFeedbackScreen';
import { QuizResultScreen } from '../screens/practice/QuizResultScreen';
import { QuizReviewScreen } from '../screens/practice/QuizReviewScreen';
import { BookmarkedQuestionsScreen } from '../screens/practice/BookmarkedQuestionsScreen';
import { CompetitiveModeScreen } from '../screens/competitive/CompetitiveModeScreen';
import { CompetitiveQuizScreen } from '../screens/competitive/CompetitiveQuizScreen';
import { CompetitiveResultsScreen } from '../screens/competitive/CompetitiveResultsScreen';
import { CompetitiveHistoryScreen } from '../screens/competitive/CompetitiveHistoryScreen';
import { CompetitiveReviewScreen } from '../screens/competitive/CompetitiveReviewScreen';

export type PracticeStackParamList = {
  ModeSelection: undefined;
  SubjectsList: undefined;
  SubjectDetail: { subject: any };
  QuestionPractice: undefined;
  AnswerFeedback: {
    question: any;
    userAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
    isCorrect: boolean;
    timeSpent: number;
  };
  QuizResult: { sessionId: string; subjectId: string; mode?: 'practice' | 'quiz' };
  QuizReview: { sessionId: string };
  BookmarkedQuestions: undefined;
  CompetitiveMode: undefined;
  CompetitiveQuiz: {
    sessionId: string;
    questions: any[];
    subjectName: string;
  };
  CompetitiveResults: {
    sessionId: string;
    answers: any[];
    totalTime: number;
  };
  CompetitiveReview: {
    sessionId: string;
    answers: any[];
    questions: any[];
  };
  CompetitiveHistory: undefined;
};

const Stack = createStackNavigator<PracticeStackParamList>();

export const PracticeStack = () => {
  const { colors } = useTheme();
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
        cardOverlayEnabled: true,
        cardShadowEnabled: false,
      }}
      initialRouteName="ModeSelection"
    >
      <Stack.Screen name="ModeSelection" component={ModeSelectionScreen} />
      <Stack.Screen name="SubjectsList" component={SubjectsListScreen} />
      <Stack.Screen name="SubjectDetail" component={SubjectDetailScreen} />
      <Stack.Screen name="QuestionPractice" component={PracticeScreen} />
      <Stack.Screen name="AnswerFeedback" component={AnswerFeedbackScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
      <Stack.Screen name="QuizReview" component={QuizReviewScreen} />
      <Stack.Screen name="BookmarkedQuestions" component={BookmarkedQuestionsScreen} />
      <Stack.Screen name="CompetitiveMode" component={CompetitiveModeScreen} />
      <Stack.Screen name="CompetitiveQuiz" component={CompetitiveQuizScreen} />
      <Stack.Screen name="CompetitiveResults" component={CompetitiveResultsScreen} />
      <Stack.Screen name="CompetitiveReview" component={CompetitiveReviewScreen} />
      <Stack.Screen name="CompetitiveHistory" component={CompetitiveHistoryScreen} />
    </Stack.Navigator>
  );
};
