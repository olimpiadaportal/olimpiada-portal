import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../services/supabase';
import { practiceService } from '../../services/practiceService';
import { competitiveModeService } from '../../services/competitiveModeService';
import { competitiveCache } from '../../services/competitiveCache';
import { MaintenanceModal } from '../../components/MaintenanceModal';
import { CompetitiveTopicModal } from '../../components/CompetitiveTopicModal';
import { SubjectWithWeakTopics, CompetitiveQuestion } from '../../types/competitive';
import { typography, spacing, borderRadius } from '../../constants/theme';
import { QuestionGenerationLoading } from '../../components/QuestionGenerationLoading';
import { checkCompetitiveGenerateRateLimit } from '../../utils/rateLimiter';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { OfflineScreen } from '../../components/OfflineScreen';
import { useAlert } from '../../components/AlertProvider';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ActionCard, SectionHeader } from '../../components/ui';
import { FadeIn } from '../../components/animated';

const COMPETITIVE_SUBJECT_CACHE_TTL_MS = 10 * 60 * 1000;

// Helper to get localized subject name from database values
// Note: subjects table only has name_en and name_az, Russian falls back to name_az
const getLocalizedSubjectName = (subject: SubjectWithWeakTopics | null, currentLang: string): string => {
  if (!subject) return '';
  if (currentLang === 'az' || currentLang === 'ru') return subject.name_az || subject.name_en;
  return subject.name_en;
};

export const CompetitiveModeScreen = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const { showSuccess, showError } = useAlert();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [subjects, setSubjects] = useState<SubjectWithWeakTopics[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectWithWeakTopics | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [canGenerate, setCanGenerate] = useState(true);
  const [timeUntilNext, setTimeUntilNext] = useState(0);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<any>(null);
  const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);

  const subjectCacheKey = React.useMemo(
    () => user?.id ? `competitive_subjects:${user.id}:group_I` : null,
    [user?.id]
  );

  useEffect(() => {
    if (!user?.id) return;

    loadSubjectsWithWeakTopics();
    getStudentId();
  }, [user?.id]);

  useEffect(() => {
    if (subjects.length === 0) return;

    restoreGenerationState();
  }, [subjects.length]);

  // Monitor app state changes to handle backgrounding
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [generating, selectedSubject, studentId]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active' && generating) {
      // App came back to foreground while generating
      console.log('📱 App returned to foreground during generation, checking for completion...');
      await checkForCompletedGeneration();
    } else if (nextAppState.match(/inactive|background/) && generating) {
      // App going to background while generating - save state
      console.log('📱 App going to background, persisting generation state...');
      await persistGenerationState();
    }
  };

  const persistGenerationState = async () => {
    if (!selectedSubject || !studentId) return;
    
    try {
      const state = {
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        studentId: studentId,
        startTime: generationStartTime || Date.now(),
        timestamp: Date.now(),
      };
      
      await AsyncStorage.setItem('competitive_generation_state', JSON.stringify(state));
      console.log('💾 Generation state persisted');
    } catch (error) {
      console.error('❌ Failed to persist generation state:', error);
    }
  };

  const restoreGenerationState = async () => {
    try {
      const stateStr = await AsyncStorage.getItem('competitive_generation_state');
      if (!stateStr) return;
      
      const state = JSON.parse(stateStr);
      const timeSinceStart = Date.now() - state.timestamp;
      
      // If less than 2 minutes since backgrounding, check for completion
      if (timeSinceStart < 2 * 60 * 1000) {
        console.log('🔄 Restoring generation state from background...');
        setGenerationStartTime(state.startTime);
        
        // Find the subject
        const subject = subjects.find(s => s.id === state.subjectId);
        if (subject) {
          setSelectedSubject(subject);
          setGenerating(true);
          
          // Check if generation completed while in background
          await checkForCompletedGeneration();
        }
      } else {
        // Too old, clear it
        await AsyncStorage.removeItem('competitive_generation_state');
      }
    } catch (error) {
      console.error('❌ Failed to restore generation state:', error);
    }
  };

  const checkForCompletedGeneration = async () => {
    if (!selectedSubject || !studentId) return;
    
    try {
      console.log('🔍 Checking if generation completed in background...');
      
      // Check if a new session was created in the last 2 minutes
      const { data: recentSession, error } = await supabase
        .from('competitive_sessions')
        .select('id, questions_data, subject_name, cache_expires_at, created_at')
        .eq('student_id', studentId)
        .eq('subject_id', selectedSubject.id)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (recentSession && recentSession.questions_data) {
        console.log('✅ Found completed generation from background!');
        
        // Cache the session locally
        const questions = recentSession.questions_data as CompetitiveQuestion[];
        await competitiveCache.cacheSession(
          {
            questions,
            generatedAt: new Date(recentSession.created_at).getTime(),
            expiresAt: new Date(recentSession.cache_expires_at).getTime(),
            sessionId: recentSession.id,
            weakTopics: [],
            subjectId: selectedSubject.id,
            subjectName: recentSession.subject_name,
          },
          selectedSubject.id,
          studentId
        );
        
        // Shuffle and prepare for navigation
        const shuffledQuestions = competitiveCache.shuffleSessionQuestions(questions);
        await competitiveCache.setTempQuestions(recentSession.id, shuffledQuestions);
        
        setPendingNavigation({
          sessionId: recentSession.id,
          subjectName: selectedSubject.name,
          isCached: false,
        });
        
        setGenerationComplete(true);
        await AsyncStorage.removeItem('competitive_generation_state');
        await checkCacheStatus();
      } else {
        console.log('⏳ Generation still in progress or failed');
        setGenerating(false);
        await AsyncStorage.removeItem('competitive_generation_state');
      }
    } catch (error) {
      console.error('❌ Failed to check for completed generation:', error);
      setGenerating(false);
      await AsyncStorage.removeItem('competitive_generation_state');
    }
  };

  useEffect(() => {
    if (selectedSubject && studentId) {
      checkCacheStatus();
    }
  }, [selectedSubject, studentId]);

  // Refresh cache status when screen comes into focus (e.g., returning from quiz)
  useFocusEffect(
    React.useCallback(() => {
      if (selectedSubject && studentId) {
        checkCacheStatus();
      }
    }, [selectedSubject, studentId])
  );

  const getStudentId = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (data) {
      setStudentId(data.id);
    }
  };

  const checkCacheStatus = async () => {
    if (!selectedSubject || !studentId) return;

    const canGen = await competitiveCache.canGenerateNew(
      selectedSubject.id,
      studentId
    );
    
    setCanGenerate(canGen);

    if (!canGen) {
      const timeRemaining = await competitiveCache.getTimeUntilNextGeneration(
        selectedSubject.id,
        studentId
      );
      setTimeUntilNext(timeRemaining);
    }
  };

  const loadCachedSubjects = async (): Promise<'fresh' | 'stale' | 'miss'> => {
    if (!subjectCacheKey) return 'miss';

    try {
      const cached = await AsyncStorage.getItem(subjectCacheKey);
      if (!cached) return 'miss';

      const parsed = JSON.parse(cached) as {
        timestamp: number;
        subjects: SubjectWithWeakTopics[];
      };

      if (!Array.isArray(parsed.subjects) || parsed.subjects.length === 0) {
        return 'miss';
      }

      setSubjects(parsed.subjects);
      setLoading(false);
      return Date.now() - parsed.timestamp <= COMPETITIVE_SUBJECT_CACHE_TTL_MS
        ? 'fresh'
        : 'stale';
    } catch (error) {
      console.warn('Failed to read competitive subject cache:', error);
      return 'miss';
    }
  };

  const cacheSubjects = async (nextSubjects: SubjectWithWeakTopics[]) => {
    if (!subjectCacheKey) return;

    try {
      await AsyncStorage.setItem(
        subjectCacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          subjects: nextSubjects,
        })
      );
    } catch (error) {
      console.warn('Failed to cache competitive subjects:', error);
    }
  };

  const loadSubjectsWithWeakTopics = async () => {
    const cacheState = await loadCachedSubjects();

    if (cacheState === 'fresh') {
      return;
    }

    try {
      if (cacheState === 'miss') {
        setLoading(true);
      }
      
      if (!user) {
        console.error('User not found');
        setLoading(false);
        return;
      }

      // Fetch subjects with progress data. Cached subjects render immediately; this refresh keeps
      // progress-sensitive labels current without making every repeat visit wait on the network.
      const allSubjects = await practiceService.getSubjectsByGroup(
        'I', // Default group - TODO: Get from student profile
        undefined, // No exam stage filter
        user.id
      );
      
      const subjectsWithTopics: SubjectWithWeakTopics[] = allSubjects.map((subject: any) => ({
        id: subject.id,
        name: subject.name_en, // Keep for backward compatibility
        name_en: subject.name_en,
        name_az: subject.name_az,
        weak_topics: [],
      }));

      setSubjects(subjectsWithTopics);
      await cacheSubjects(subjectsWithTopics);
    } catch (error) {
      console.error('Failed to load subjects:', error);
    } finally {
      setLoading(false);
    }
  };

  // Show topic selection modal before generating, or start cached test directly
  const handleStartGeneration = () => {
    if (!selectedSubject || !studentId) return;
    
    // If there's a cached test available (canGenerate is false), start it directly
    if (!canGenerate) {
      handleGenerateQuestions([], 'adaptive');
    } else {
      // Otherwise, show topic selection modal for new generation
      setTopicModalVisible(true);
    }
  };

  // Handle topic and difficulty selection from modal
  const handleTopicConfirm = async (
    selectedTopics: string[],
    difficulty: 'adaptive' | 'balanced' | 'easy' | 'medium' | 'hard'
  ) => {
    setTopicModalVisible(false);
    await handleGenerateQuestions(selectedTopics, difficulty);
  };

  const handleGenerateQuestions = async (
    selectedTopics: string[] = [],
    difficultyPreference: 'adaptive' | 'balanced' | 'easy' | 'medium' | 'hard' = 'adaptive'
  ) => {
    if (!selectedSubject || !studentId) return;

    try {
      setGenerating(true);
      setGenerationComplete(false);
      
      // Check cache first (only if no specific topics selected - user wants fresh questions with topics)
      if (selectedTopics.length === 0) {
        const cached = await competitiveCache.getCachedSession(
          selectedSubject.id,
          studentId
        );

        if (cached && !canGenerate) {
          // Use cached questions with shuffled options
          console.log('📦 Using cached questions');
          const shuffledQuestions = competitiveCache.shuffleSessionQuestions(cached.questions);
          
          // Store shuffled questions in a temporary cache for the quiz screen
          await competitiveCache.setTempQuestions(cached.sessionId, shuffledQuestions);
          
          // Store navigation params and trigger completion
          setPendingNavigation({
            sessionId: cached.sessionId,
            subjectName: selectedSubject.name,
            isCached: true,
          });
          setGenerationComplete(true);
          return;
        }
      }

      // Check rate limit for new generation
      if (!checkCompetitiveGenerateRateLimit(user?.id || '')) {
        showError(
          t('common.error'),
          t('errors.rateLimitExceeded', { 
            defaultValue: 'Too many requests. Please wait 5 minutes before generating new questions.' 
          })
        );
        setGenerating(false);
        return;
      }

      // Generate new AI questions with selected topics and difficulty
      console.log('🤖 Generating new AI questions...', { selectedTopics, difficultyPreference });
      setGenerationStartTime(Date.now());
      await persistGenerationState();
      
      const response = await competitiveModeService.generateSession(
        selectedSubject.id,
        studentId,
        15,
        {
          selectedTopics: selectedTopics.length > 0 ? selectedTopics : undefined,
          difficultyPreference,
        }
      );

      if (!response.success || !response.data) {
        // Check if it's a maintenance mode error (not a real error, just disabled)
        if (response.error?.code === 'MAINTENANCE_MODE') {
          console.log('ℹ️ AI Generate Questions is in maintenance mode');
          // Show beautiful maintenance modal
          setMaintenanceMessage(t('ai.maintenance.generateQuestions'));
          setMaintenanceModalVisible(true);
          setGenerating(false);
          return;
        }
        throw new Error(response.error?.message || 'Failed to generate questions');
      }

      const session = response.data;
      
      // Debug logging
      console.log('🚀 Navigating to quiz with:', {
        sessionId: session.id,
        questionCount: session.questions?.length || 0,
        hasQuestions: !!session.questions,
        questionsIsArray: Array.isArray(session.questions),
        subjectName: selectedSubject.name,
      });
      
      if (!session.questions || session.questions.length === 0) {
        throw new Error('No questions generated');
      }
      
      console.log('📝 First question preview:', session.questions[0]);
      
      // Questions are already in DB format (snake_case) from competitiveModeService
      // No need to convert again - just use them directly
      // Cast to CompetitiveQuestion[] since service returns them in correct format
      const dbQuestions = session.questions as unknown as CompetitiveQuestion[];
      
      console.log('📝 First DB question (ready to cache):', dbQuestions[0]);
      
      // Cache the new session
      await competitiveCache.cacheSession(
        {
          questions: dbQuestions,
          generatedAt: Date.now(),
          expiresAt: Date.now() + (3 * 24 * 60 * 60 * 1000),
          sessionId: session.id,
          weakTopics: session.weakTopics || [],
          subjectId: selectedSubject.id,
          subjectName: selectedSubject.name,
        },
        selectedSubject.id,
        studentId
      );

      // Update cache status
      await checkCacheStatus();
      
      // Shuffle questions before storing
      const shuffledQuestions = competitiveCache.shuffleSessionQuestions(dbQuestions);
      
      // Store shuffled questions in temp cache for quiz screen
      await competitiveCache.setTempQuestions(session.id, shuffledQuestions);
      
      // Store navigation params and trigger completion
      setPendingNavigation({
        sessionId: session.id,
        subjectName: selectedSubject.name,
        isCached: false,
      });
      setGenerationComplete(true);
      
      // Clear persisted state on success
      await AsyncStorage.removeItem('competitive_generation_state');
    } catch (error) {
      console.error('Failed to generate questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate questions';
      alert(`Error: ${errorMessage}\n\nPlease try again.`);
      setGenerating(false);
      
      // Clear persisted state on error
      await AsyncStorage.removeItem('competitive_generation_state');
    }
  };

  // Handle completion callback from loading modal
  const handleLoadingComplete = () => {
    if (pendingNavigation) {
      console.log('🚀 About to navigate with:', {
        sessionId: pendingNavigation.sessionId,
        subjectName: pendingNavigation.subjectName,
        isCached: pendingNavigation.isCached,
      });

      // @ts-ignore - Navigation types are complex, using runtime navigation
      navigation.navigate('CompetitiveQuiz', pendingNavigation);
      // Reset states
      setGenerating(false);
      setGenerationComplete(false);
      setPendingNavigation(null);
    }
  };

  const handleViewHistory = () => {
    navigation.navigate('CompetitiveHistory' as never);
  };

  const handleClearCache = async () => {
    try {
      await competitiveCache.clearAllCaches();
      showSuccess(
        'Cache Cleared',
        'All competitive question caches have been cleared. You can now generate new questions for all subjects.'
      );
    } catch (error) {
      console.error('Failed to clear cache:', error);
      showError('Error', 'Failed to clear cache');
    }
  };

  // Show offline screen when offline
  if (!isOnline) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <View style={styles.headerIcon}>
              <Ionicons name="trophy" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.headerTitle}>{t('competitive.title')}</Text>
          </View>
        </View>
        <OfflineScreen 
          title={t('offline.competitiveTitle', 'Competitive Mode Unavailable')}
          message={t('offline.competitiveMessage', 'Competitive mode requires an internet connection to generate AI-powered questions. Try Standard Practice mode for offline learning.')}
          showPracticeButton={true}
          showRetryButton={true}
          icon="trophy-outline"
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <SectionHeader
            title={t('competitive.title')}
            subtitle={t('competitive.infoDescription')}
            icon="sparkles-outline"
            style={styles.headerTitleBlock}
          />
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.loadingContent}
          showsVerticalScrollIndicator={false}
        >
          <LoadingSkeleton height={72} style={styles.loadingInfoSkeleton} />
          {Array.from({ length: 5 }).map((_, index) => (
            <LoadingSkeleton key={index} height={84} style={styles.loadingCard} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <SectionHeader
          title={t('competitive.title')}
          subtitle={t('competitive.infoDescription')}
          icon="sparkles-outline"
          style={styles.headerTitleBlock}
        />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Info Section */}
        <View style={styles.infoSection}>
          <SectionHeader
            title={t('competitive.infoTitle')}
            subtitle={t('competitive.infoDescription')}
            icon="bulb-outline"
            style={styles.sectionHeader}
          />
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="book-outline" size={20} color={colors.success} />
              <Text style={styles.featureText}>{t('competitive.feature1')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              <Text style={styles.featureText}>{t('competitive.feature2')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trending-up-outline" size={20} color={colors.accent} />
              <Text style={styles.featureText}>{t('competitive.feature3')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.featureText}>{t('competitive.feature4')}</Text>
            </View>
          </View>
        </View>

        {/* Subjects Grid */}
        <View style={styles.subjectsGrid}>
          {subjects.map((subject, index) => (
            <FadeIn key={subject.id} delay={index * 60} duration={350}>
              <ActionCard
                title={getLocalizedSubjectName(subject, currentLang)}
                icon="book-outline"
                accentColor={selectedSubject?.id === subject.id ? colors.success : colors.primary}
                onPress={() => setSelectedSubject(subject)}
                disabled={generating}
                rightContent={
                  selectedSubject?.id === subject.id
                    ? <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    : undefined
                }
                style={[
                  styles.subjectCard,
                  selectedSubject?.id === subject.id && styles.subjectCardSelected,
                ]}
              />
            </FadeIn>
          ))}
        </View>

        {/* Cache Status */}
        {selectedSubject && !generating && (
          <View style={styles.cacheStatus}>
            {canGenerate ? (
              <View style={styles.cacheStatusRow}>
                <Ionicons name="flash" size={18} color="#10B981" />
                <Text style={[styles.cacheStatusText, { color: '#10B981' }]}>
                  {t('competitive.readyToGenerate')}
                </Text>
              </View>
            ) : (
              <View style={styles.cacheStatusRow}>
                <Ionicons name="time" size={18} color="#F59E0B" />
                <Text style={[styles.cacheStatusText, { color: '#F59E0B' }]}>
                  {(() => {
                    const { days, hours } = competitiveCache.formatTimeRemaining(timeUntilNext);
                    return t('competitive.nextGenerationIn', { days, hours });
                  })()}
                </Text>
                <Text style={styles.cacheSubtext}>
                  {t('competitive.cachedQuestionsAvailable')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[
              styles.generateButton,
              (!selectedSubject || generating) && styles.generateButtonDisabled,
            ]}
            onPress={handleStartGeneration}
            disabled={!selectedSubject || generating}
            activeOpacity={0.7}
          >
            {generating ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.generateButtonText}>{t('competitive.generating')}</Text>
              </>
            ) : (
              <>
                <Ionicons name={canGenerate ? "flash" : "play"} size={20} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>
                  {canGenerate ? t('competitive.generateNew') : t('competitive.startCached')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.historyButton,
              generating && styles.historyButtonDisabled,
            ]}
            onPress={handleViewHistory}
            activeOpacity={0.7}
            disabled={generating}
          >
            <Ionicons name="time" size={20} color={generating ? colors.border : colors.primary} />
            <Text style={[
              styles.historyButtonText,
              generating && styles.historyButtonTextDisabled,
            ]}>
              {t('competitive.viewHistory')}
            </Text>
          </TouchableOpacity>

          {/* Clear Cache Button (for testing) */}
          {__DEV__ && (
            <TouchableOpacity
              style={[
                styles.historyButton,
                { backgroundColor: colors.error + '20', borderColor: colors.error },
                generating && styles.historyButtonDisabled,
              ]}
              onPress={handleClearCache}
              activeOpacity={0.7}
              disabled={generating}
            >
              <Ionicons name="trash" size={20} color={generating ? colors.border : colors.error} />
              <Text style={[
                styles.historyButtonText,
                { color: colors.error },
                generating && styles.historyButtonTextDisabled,
              ]}>
                Clear Cache
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Loading Modal */}
        <QuestionGenerationLoading 
          visible={generating}
          subjectName={getLocalizedSubjectName(selectedSubject, currentLang)}
          questionCount={15}
          completed={generationComplete}
          onComplete={handleLoadingComplete}
        />
      </ScrollView>

      {/* Maintenance Modal */}
      <MaintenanceModal
        visible={maintenanceModalVisible}
        onClose={() => setMaintenanceModalVisible(false)}
        message={maintenanceMessage}
        title={t('ai.maintenance.title')}
      />

      {/* Topic Selection Modal */}
      {selectedSubject && (
        <CompetitiveTopicModal
          visible={topicModalVisible}
          onClose={() => setTopicModalVisible(false)}
          onConfirm={handleTopicConfirm}
          subjectId={selectedSubject.id}
          subjectName={getLocalizedSubjectName(selectedSubject, currentLang)}
          questionCount={15}
        />
      )}
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    loadingInfoSkeleton: {
      borderRadius: borderRadius.lg,
      marginBottom: spacing.xs,
    },
    loadingCard: {
      borderRadius: borderRadius.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    backButton: {
      padding: spacing.xs,
    },
    headerTitleBlock: {
      flex: 1,
      marginBottom: 0,
    },
    headerContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    infoSection: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionHeader: {
      marginBottom: spacing.md,
    },
    infoTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    infoDescription: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    featuresList: {
      gap: spacing.sm,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    featureText: {
      flex: 1,
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      lineHeight: 20,
    },
    section: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    subjectsGrid: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    sectionTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.bold,
      color: colors.text,
      marginBottom: spacing.md,
    },
    subjectCard: {
      backgroundColor: colors.card,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 2,
      borderColor: colors.border,
    },
    subjectCardSelected: {
      borderColor: '#10B981',
      backgroundColor: colors.successLight,
    },
    subjectCardDisabled: {
      opacity: 0.5,
    },
    subjectHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    subjectName: {
      fontSize: typography.fontSizes.lg,
      fontWeight: typography.fontWeights.semibold,
      color: colors.text,
    },
    weakTopicsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    weakTopicsLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.medium,
      color: colors.textSecondary,
    },
    weakTopicsText: {
      fontSize: typography.fontSizes.sm,
      color: '#F59E0B',
      fontWeight: typography.fontWeights.medium,
    },
    actionsSection: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F59E0B',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    generateButtonDisabled: {
      backgroundColor: colors.border,
      opacity: 0.6,
    },
    generateButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: '#FFFFFF',
    },
    historyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      gap: spacing.sm,
    },
    historyButtonText: {
      fontSize: typography.fontSizes.md,
      fontWeight: typography.fontWeights.semibold,
      color: colors.primary,
    },
    historyButtonDisabled: {
      opacity: 0.5,
      borderColor: colors.border,
    },
    historyButtonTextDisabled: {
      color: colors.border,
    },
    cacheStatus: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    cacheStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    cacheStatusText: {
      fontSize: typography.fontSizes.sm,
      fontWeight: typography.fontWeights.semibold,
    },
    cacheSubtext: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      width: '100%',
      textAlign: 'center',
    },
  });
