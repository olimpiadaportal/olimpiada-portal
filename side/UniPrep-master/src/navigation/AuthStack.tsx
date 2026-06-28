import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStackParamList } from '../types';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { RoleSelectionScreen } from '../screens/auth/RoleSelectionScreen';
import { StudentSignupScreen } from '../screens/auth/StudentSignupScreen';
import { TeacherSignupScreen } from '../screens/auth/TeacherSignupScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ResendVerificationScreen } from '../screens/auth/ResendVerificationScreen';

const Stack = createStackNavigator<AuthStackParamList>();

export const AuthStack = () => {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);
  const { colors } = useTheme(); // Must be called before any early returns (Rules of Hooks)

  useEffect(() => {
    const checkOnboarding = async () => {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      setHasSeenOnboarding(seen === 'true');
    };
    checkOnboarding();
  }, []);

  // Wait until we know whether to show onboarding
  if (hasSeenOnboarding === null) return null;
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
        cardOverlayEnabled: true,
        cardShadowEnabled: false,
      }}
      initialRouteName={hasSeenOnboarding ? 'Login' : 'Welcome'}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
      <Stack.Screen name="StudentSignup" component={StudentSignupScreen} />
      <Stack.Screen name="TeacherSignup" component={TeacherSignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResendVerification" component={ResendVerificationScreen} />
    </Stack.Navigator>
  );
};
