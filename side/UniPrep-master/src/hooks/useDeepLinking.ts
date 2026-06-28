import { useEffect, useRef } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { deepLinkService, DeepLink } from '../services/deepLinkService';

export const useDeepLinking = () => {
  const navigation = useNavigation<any>();
  const hasHandledInitialUrl = useRef(false);

  useEffect(() => {
    // Handle initial URL (app opened via deep link)
    const handleInitialUrl = async () => {
      if (hasHandledInitialUrl.current) return;

      const url = await deepLinkService.getInitialUrl();
      if (url) {
        console.log('📱 Initial deep link:', url);
        hasHandledInitialUrl.current = true;
        handleDeepLink(url);
      }
    };

    handleInitialUrl();

    // Subscribe to deep link events (app already open)
    const subscription = deepLinkService.addEventListener((url) => {
      console.log('📱 Deep link received:', url);
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    const link = deepLinkService.parseUrl(url);
    
    if (!link || link.type === 'unknown') {
      console.warn('Invalid deep link:', url);
      return;
    }

    console.log('🔗 Handling deep link:', link);
    navigateToDeepLink(link);
  };

  const navigateToDeepLink = (link: DeepLink) => {
    try {
      switch (link.type) {
        case 'confirm-email':
          // Navigate to email confirmation screen
          console.log('🔗 Navigating to EmailConfirmation with tokens');
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [
                {
                  name: 'Auth',
                  state: {
                    routes: [
                      {
                        name: 'EmailConfirmation',
                        params: {
                          accessToken: link.accessToken,
                          refreshToken: link.refreshToken,
                        },
                      },
                    ],
                  },
                },
              ],
            })
          );
          break;

        case 'reset-password':
          // Navigate to reset password screen
          console.log('🔗 Navigating to ResetPassword with tokens');
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [
                {
                  name: 'Auth',
                  state: {
                    routes: [
                      {
                        name: 'ResetPassword',
                        params: {
                          accessToken: link.accessToken,
                          refreshToken: link.refreshToken,
                        },
                      },
                    ],
                  },
                },
              ],
            })
          );
          break;

        case 'teacher':
          if (link.id) {
            navigation.navigate('TeacherProfile' as never, { 
              teacherId: link.id 
            } as never);
          }
          break;

        case 'exam':
          if (link.id) {
            navigation.navigate('MockExams' as never, {
              screen: 'MockExamDetails',
              params: { examId: link.id }
            } as never);
          }
          break;

        case 'subject':
          if (link.id) {
            navigation.navigate('Practice' as never, {
              screen: 'SubjectDetail',
              params: { 
                subject: { 
                  id: link.id, 
                  name_en: link.params?.name || 'Subject' 
                } 
              }
            } as never);
          }
          break;

        case 'chat':
          if (link.id) {
            navigation.navigate('Chat' as never, {
              conversationId: link.id
            } as never);
          }
          break;

        case 'profile':
          if (link.id) {
            navigation.navigate('StudentProfile' as never, {
              userId: link.id
            } as never);
          }
          break;

        default:
          console.warn('Unhandled deep link type:', link.type);
      }
    } catch (error) {
      console.error('Deep link navigation error:', error);
    }
  };

  return {
    handleDeepLink,
    navigateToDeepLink,
  };
};
