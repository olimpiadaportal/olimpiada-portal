/**
 * PersonalizationQuizScreen
 * Phase 2: Onboarding Personalization
 *
 * Multi-step preference quiz shown after signup for new students.
 * Uses standard React Native Animated API (not Reanimated worklets)
 * to avoid Worklets version mismatch errors.
 * 
 * Steps:
 *   1. Exam group confirmation (pre-filled from signup)
 *   2. Strongest subjects (multi-select)
 *   3. Weakest subjects (multi-select)
 *   4. Daily study goal (visual selector)
 *   5. Exam date (optional date picker)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { goalService } from '../../services/goalService';
import { profileService } from '../../services/profileService';
import { studyPlanService } from '../../services/studyPlanService';
import { spacing, borderRadius } from '../../constants/theme';

const TOTAL_STEPS = 5;

const QUESTION_PRESETS = [
  { value: 10, label: '10', desc: 'Light' },
  { value: 20, label: '20', desc: 'Moderate' },
  { value: 30, label: '30', desc: 'Focused' },
  { value: 50, label: '50', desc: 'Intensive' },
];

const TIME_PRESETS = [
  { value: 15, icon: 'time-outline' as const },
  { value: 30, icon: 'time-outline' as const },
  { value: 45, icon: 'timer-outline' as const },
  { value: 60, icon: 'timer-outline' as const },
];

interface SubjectItem {
  id: string;
  name: string;
  name_en: string;
  name_az: string;
}

interface ExamGroupItem {
  code: string;
  name: string;
  name_en: string;
  name_az: string;
  name_ru: string;
}

export const PersonalizationQuizScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user, setOnboardingCompleted } = useAuthStore();

  // State
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [targetGroup, setTargetGroup] = useState<string | null>(null);

  // Available subjects and exam groups
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [examGroups, setExamGroups] = useState<ExamGroupItem[]>([]);

  // User selections
  const [strongestSubjects, setStrongestSubjects] = useState<string[]>([]);
  const [weakestSubjects, setWeakestSubjects] = useState<string[]>([]);
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(20);
  const [dailyTimeTarget, setDailyTimeTarget] = useState(30);
  const [targetUniversity, setTargetUniversity] = useState<string>(''); // Stores the original (English) name
  const [universities, setUniversities] = useState<{ name: string; displayName: string }[]>([]);

  // Animation values (standard RN Animated API)
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: currentStep / TOTAL_STEPS,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  }, [currentStep]);

  const loadInitialData = async () => {
    try {
      if (!user?.id) return;

      const { data: student } = await supabase
        .from('students')
        .select('id, target_group')
        .eq('user_id', user.id)
        .single();

      if (student) {
        setStudentId(student.id);
        setTargetGroup(student.target_group);
      }

      const { data: subjectData } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (subjectData) {
        setSubjects(
          subjectData.map((s: any) => ({
            id: s.id,
            name: i18n.language === 'az' && s.name_az ? s.name_az : s.name_en,
            name_en: s.name_en,
            name_az: s.name_az || s.name_en,
          }))
        );
      }

      // Fetch exam groups from database
      const { data: examGroupData } = await supabase
        .from('exam_groups')
        .select('code, name_en, name_az, name_ru')
        .order('code');

      if (examGroupData) {
        setExamGroups(
          examGroupData.map((g: any) => ({
            code: g.code,
            name: i18n.language === 'az' ? (g.name_az || g.name_en) : 
                  i18n.language === 'ru' ? (g.name_ru || g.name_en) : g.name_en,
            name_en: g.name_en,
            name_az: g.name_az || g.name_en,
            name_ru: g.name_ru || g.name_en,
          }))
        );
      }

      // Fetch universities from database
      const { data: universityData } = await supabase
        .from('universities')
        .select('id, name, name_az, name_ru')
        .eq('is_active', true)
        .order('name');

      if (universityData) {
        setUniversities(
          universityData.map((u: any) => ({
            name: u.name, // Original name for database storage
            displayName: i18n.language === 'az' && u.name_az ? u.name_az : 
                        i18n.language === 'ru' && u.name_ru ? u.name_ru : u.name
          }))
        );
      }
    } catch (error) {
      console.error('Error loading onboarding data:', error);
    } finally {
      setLoading(false);
    }
  };

  const animateStepTransition = (callback: () => void) => {
    Animated.timing(stepOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      animateStepTransition(() => setCurrentStep(prev => prev + 1));
    } else {
      handleComplete();
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      animateStepTransition(() => setCurrentStep(prev => prev - 1));
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    // Skip to next step instead of completing the entire quiz
    if (currentStep < TOTAL_STEPS) {
      animateStepTransition(() => setCurrentStep(prev => prev + 1));
    } else {
      // On last step, complete the quiz
      handleComplete();
    }
  }, [currentStep]);

  const handleComplete = async () => {
    if (!studentId) return;
    try {
      setSaving(true);

      // Save target group and target university to student profile
      const studentUpdates: Record<string, any> = {};
      if (targetGroup) {
        studentUpdates.target_group = targetGroup;
      }
      if (targetUniversity) {
        studentUpdates.target_university = targetUniversity;
      }
      
      if (Object.keys(studentUpdates).length > 0) {
        console.log('📝 Saving student updates:', studentUpdates);
        const { error: updateError } = await supabase
          .from('students')
          .update(studentUpdates)
          .eq('id', studentId);
        
        if (updateError) {
          console.error('❌ Error saving student data:', updateError);
        } else {
          console.log('✅ Student data saved successfully');
        }
      }

      // Save subject preferences and mark onboarding complete
      await profileService.completeOnboarding(
        studentId,
        strongestSubjects,
        weakestSubjects
      );

      // Save daily goals
      await goalService.saveGoals(studentId, {
        dailyQuestionTarget,
        dailyTimeTargetMinutes: dailyTimeTarget,
        targetExamDate: null,
        targetScore: null,
        preferredStudyDays: [1, 2, 3, 4, 5],
        preferredStudyTime: 'evening',
      });

      setOnboardingCompleted(true);

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        })
      );
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleSubject = (subjectId: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    setList(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ============================================
  // STEP RENDERERS
  // ============================================

  const renderStep1_ExamGroup = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepIconWrap}>
        <Ionicons name="school" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('personalization.examGroupTitle', 'Your Exam Group')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('personalization.examGroupDesc', 'Confirm your exam preparation group')}
      </Text>

      <View style={styles.examGroupGrid}>
        {(examGroups.length > 0 ? examGroups : [
          { code: 'I', name: t('personalization.groupI', 'Group I') },
          { code: 'II', name: t('personalization.groupII', 'Group II') },
          { code: 'III', name: t('personalization.groupIII', 'Group III') },
          { code: 'IV', name: t('personalization.groupIV', 'Group IV') },
          { code: 'V', name: t('personalization.groupV', 'Group V') },
        ]).map(group => {
          const isSelected = targetGroup === group.code;
          return (
            <TouchableOpacity
              key={group.code}
              style={[
                styles.examGroupChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setTargetGroup(group.code)}
            >
              <Text style={[
                styles.examGroupText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}>
                {t(`personalization.group${group.code}`, `Group ${group.code}`)}
              </Text>
              <Text style={[
                styles.examGroupSubtext,
                { color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textSecondary },
              ]}>
                {group.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep2_StrongestSubjects = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#DCFCE7' }]}>
        <Ionicons name="trophy" size={48} color="#16A34A" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('personalization.strongSubjectsTitle', 'Your Strongest Subjects')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('personalization.strongSubjectsDesc', 'Select subjects you feel most confident in')}
      </Text>

      {renderSubjectGrid(strongestSubjects, (id) =>
        toggleSubject(id, strongestSubjects, setStrongestSubjects), '#16A34A'
      )}
    </View>
  );

  const renderStep3_WeakestSubjects = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#FEF3C7' }]}>
        <Ionicons name="fitness" size={48} color="#D97706" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('personalization.weakSubjectsTitle', 'Subjects to Improve')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('personalization.weakSubjectsDesc', 'Select subjects you want to focus on improving')}
      </Text>

      {renderSubjectGrid(weakestSubjects, (id) =>
        toggleSubject(id, weakestSubjects, setWeakestSubjects), '#D97706'
      )}
    </View>
  );

  const renderStep4_DailyGoal = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#EDE9FE' }]}>
        <Ionicons name="flame" size={48} color="#7C3AED" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('personalization.dailyGoalTitle', 'Set Your Daily Goal')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('personalization.dailyGoalDesc', 'How much do you want to study each day?')}
      </Text>

      <Text style={[styles.goalLabel, { color: colors.text }]}>
        {t('personalization.questionsPerDay', 'Questions per day')}
      </Text>
      <View style={styles.presetRow}>
        {QUESTION_PRESETS.map(preset => {
          const isSelected = dailyQuestionTarget === preset.value;
          return (
            <TouchableOpacity
              key={preset.value}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isSelected ? '#7C3AED' : colors.card,
                  borderColor: isSelected ? '#7C3AED' : colors.border,
                },
              ]}
              onPress={() => setDailyQuestionTarget(preset.value)}
            >
              <Text style={[styles.presetValue, { color: isSelected ? '#FFFFFF' : colors.text }]}>
                {preset.label}
              </Text>
              <Text style={[styles.presetDesc, { color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>
                {t(`personalization.goal${preset.desc}`, preset.desc)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.goalLabel, { color: colors.text, marginTop: spacing.lg }]}>
        {t('personalization.timePerDay', 'Study time per day')}
      </Text>
      <View style={styles.presetRow}>
        {TIME_PRESETS.map(preset => {
          const isSelected = dailyTimeTarget === preset.value;
          return (
            <TouchableOpacity
              key={preset.value}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isSelected ? '#7C3AED' : colors.card,
                  borderColor: isSelected ? '#7C3AED' : colors.border,
                },
              ]}
              onPress={() => setDailyTimeTarget(preset.value)}
            >
              <Ionicons
                name={preset.icon}
                size={18}
                color={isSelected ? '#FFFFFF' : colors.textSecondary}
              />
              <Text style={[styles.presetValue, { color: isSelected ? '#FFFFFF' : colors.text, fontSize: 14 }]}>
                {preset.value} {t('goals.min', 'min')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep5_TargetUniversity = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#FEE2E2' }]}>
        <Ionicons name="school" size={48} color="#DC2626" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('personalization.targetUniversityTitle', 'Your Dream University')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('personalization.targetUniversityDesc', 'Which university do you want to attend? (Optional)')}
      </Text>

      <View style={styles.universityInputContainer}>
        <Ionicons name="school-outline" size={24} color={targetUniversity ? colors.primary : colors.textSecondary} />
        <View style={[styles.universityInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text 
            style={[styles.universityInputText, { color: targetUniversity ? colors.text : colors.textSecondary }]}
            numberOfLines={1}
          >
            {targetUniversity 
              ? (universities.find(u => u.name === targetUniversity)?.displayName || targetUniversity)
              : t('personalization.enterUniversity', 'Enter your target university')}
          </Text>
        </View>
      </View>

      {/* Universities from database */}
      {universities.length > 0 && (
        <>
          <Text style={[styles.goalLabel, { color: colors.text, marginTop: spacing.lg }]}>
            {t('personalization.popularUniversities', 'Popular Universities')}
          </Text>
          <View style={styles.universityGrid}>
            {universities.map((uni) => {
              const isSelected = targetUniversity === uni.name;
              return (
                <TouchableOpacity
                  key={uni.name}
                  style={[
                    styles.universityChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setTargetUniversity(isSelected ? '' : uni.name)}
                >
                  <Text
                    style={[
                      styles.universityChipText,
                      { color: isSelected ? '#FFFFFF' : colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {uni.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <View style={[styles.tipCard, { backgroundColor: colors.primaryLight || '#EFF6FF' }]}>
        <Ionicons name="bulb-outline" size={20} color={colors.primary} />
        <Text style={[styles.tipText, { color: colors.text }]}>
          {t('personalization.universityTip', 'You can always change this later in your profile settings.')}
        </Text>
      </View>
    </View>
  );

  // ============================================
  // SHARED COMPONENTS
  // ============================================

  const renderSubjectGrid = (
    selectedIds: string[],
    onToggle: (id: string) => void,
    accentColor: string
  ) => (
    <View style={styles.subjectGrid}>
      {subjects.map((subject) => {
        const isSelected = selectedIds.includes(subject.id);
        return (
          <TouchableOpacity
            key={subject.id}
            style={[
              styles.subjectChip,
              {
                backgroundColor: isSelected ? accentColor : colors.card,
                borderColor: isSelected ? accentColor : colors.border,
              },
            ]}
            onPress={() => onToggle(subject.id)}
            activeOpacity={0.7}
          >
            {isSelected && (
              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            )}
            <Text
              style={[
                styles.subjectChipText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}
              numberOfLines={1}
            >
              {subject.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1_ExamGroup();
      case 2: return renderStep2_StrongestSubjects();
      case 3: return renderStep3_WeakestSubjects();
      case 4: return renderStep4_DailyGoal();
      case 5: return renderStep5_TargetUniversity();
      default: return null;
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header with progress */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {currentStep > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}

          <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>
            {currentStep}/{TOTAL_STEPS}
          </Text>

          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: colors.primary }]}>
              {t('common.skip', 'Skip')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[styles.progressFill, { backgroundColor: colors.primary, width: progressWidth }]}
          />
        </View>
      </View>

      {/* Step content */}
      <Animated.View style={[styles.content, { opacity: stepOpacity }]}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
          extraScrollHeight={100}
          enableAutomaticScroll={true}
        >
          {renderCurrentStep()}
        </KeyboardAwareScrollView>
      </Animated.View>

      {/* Bottom button */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.continueText}>
                {currentStep === TOTAL_STEPS
                  ? t('personalization.finish', 'Get Started!')
                  : t('personalization.continue', 'Continue')}
              </Text>
              <Ionicons
                name={currentStep === TOTAL_STEPS ? 'rocket' : 'arrow-forward'}
                size={20}
                color="#FFFFFF"
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ============================================
// HELPERS
// ============================================

function getGroupDescription(group: string, t: any): string {
  const descriptions: Record<string, string> = {
    'I': t('personalization.groupIDesc', 'Medicine, Dentistry'),
    'II': t('personalization.groupIIDesc', 'Engineering, IT'),
    'III': t('personalization.groupIIIDesc', 'Economics, Law'),
    'IV': t('personalization.groupIVDesc', 'Humanities, Languages'),
    'V': t('personalization.groupVDesc', 'Arts, Music'),
  };
  return descriptions[group] || '';
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  examGroupGrid: {
    width: '100%',
    gap: 10,
  },
  examGroupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
  },
  examGroupText: {
    fontSize: 18,
    fontWeight: '700',
  },
  examGroupSubtext: {
    fontSize: 13,
    fontWeight: '500',
  },
  subjectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  subjectChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: 4,
  },
  presetValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  presetDesc: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: 12,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  universityInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    marginBottom: spacing.md,
  },
  universityInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  universityInputText: {
    fontSize: 16,
    fontWeight: '500',
  },
  universityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  universityChip: {
    width: '48%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  universityChipText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    gap: 8,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
