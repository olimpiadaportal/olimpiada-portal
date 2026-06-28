/**
 * TeacherOnboardingQuizScreen
 * Phase 2B: Teacher Onboarding Personalization
 *
 * Multi-step preference quiz shown after signup for new teachers.
 * Collects: specializations, experience, available groups, rates, bio.
 * Uses standard React Native Animated API (not Reanimated worklets).
 *
 * Steps:
 *   1. Subjects / Specializations (multi-select)
 *   2. Teaching Experience (number input)
 *   3. Available Exam Groups (multi-select)
 *   4. Rates — hourly & monthly (optional)
 *   5. Bio / About (text area)
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
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';

import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { teacherService } from '../../services/teacherService';
import { spacing, borderRadius } from '../../constants/theme';

const TOTAL_STEPS = 5;

// Subject type from database (subjects table only has name_en and name_az)
interface SubjectOption {
  id: string;
  name_en: string;
  name_az: string;
}

const EXAM_GROUPS = ['I', 'II', 'III', 'IV', 'V'] as const;

export const TeacherOnboardingQuizScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user, setOnboardingCompleted } = useAuthStore();

  // State
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  // User selections
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [bio, setBio] = useState('');

  // Get current language for locale-aware subject names
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  // Animation values
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

      // Fetch subjects from database (future-proof approach)
      const subjectsData = await teacherService.getSubjectsForSpecialization();
      setSubjects(subjectsData);

      const { data: teacher } = await supabase
        .from('teachers')
        .select('id, specializations, experience_years, available_groups, hourly_rate, monthly_rate, bio')
        .eq('user_id', user.id)
        .single();

      if (teacher) {
        setTeacherId(teacher.id);
        // Pre-fill if data already exists (e.g. returning to quiz)
        if (teacher.specializations?.length) setSelectedSubjects(teacher.specializations);
        if (teacher.experience_years) setExperienceYears(String(teacher.experience_years));
        if (teacher.available_groups?.length) setSelectedGroups(teacher.available_groups);
        if (teacher.hourly_rate) setHourlyRate(String(teacher.hourly_rate));
        if (teacher.monthly_rate) setMonthlyRate(String(teacher.monthly_rate));
        if (teacher.bio) setBio(teacher.bio);
      }
    } catch (error) {
      console.error('Error loading teacher onboarding data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get locale-aware subject name
  // Note: subjects table only has name_en and name_az, so Russian falls back to name_az
  const getSubjectName = (subject: SubjectOption): string => {
    if (currentLang === 'az' || currentLang === 'ru') return subject.name_az;
    return subject.name_en;
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

  // IMPORTANT: handleComplete must be defined BEFORE handleNext/handleSkip to avoid stale closures
  const handleComplete = useCallback(async () => {
    if (!teacherId) return;
    try {
      setSaving(true);

      const updateData: Record<string, any> = {
        onboarding_completed: true,
      };

      if (selectedSubjects.length > 0) updateData.specializations = selectedSubjects;
      if (experienceYears) updateData.experience_years = parseInt(experienceYears, 10) || 0;
      if (selectedGroups.length > 0) updateData.available_groups = selectedGroups;
      if (hourlyRate) updateData.hourly_rate = parseFloat(hourlyRate) || null;
      if (monthlyRate) updateData.monthly_rate = parseFloat(monthlyRate) || null;
      // Always include bio field, even if empty (to clear previous value if user deletes it)
      updateData.bio = bio.trim() || null;

      console.log('📝 Teacher onboarding - saving data:', JSON.stringify(updateData, null, 2));

      const { error } = await supabase
        .from('teachers')
        .update(updateData)
        .eq('id', teacherId);

      if (error) {
        console.error('Error saving teacher onboarding:', error);
      } else {
        console.log('✅ Teacher onboarding data saved successfully');
      }

      setOnboardingCompleted(true);

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        })
      );
    } catch (error) {
      console.error('Error completing teacher onboarding:', error);
    } finally {
      setSaving(false);
    }
  }, [teacherId, selectedSubjects, experienceYears, selectedGroups, hourlyRate, monthlyRate, bio, navigation, setOnboardingCompleted]);

  const handleNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS) {
      animateStepTransition(() => setCurrentStep(prev => prev + 1));
    } else {
      handleComplete();
    }
  }, [currentStep, handleComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      animateStepTransition(() => setCurrentStep(prev => prev - 1));
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subject)
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
  };

  const toggleGroup = (group: string) => {
    setSelectedGroups(prev =>
      prev.includes(group)
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ============================================
  // STEP RENDERERS
  // ============================================

  const renderStep1_Subjects = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#DBEAFE' }]}>
        <Ionicons name="book" size={48} color="#2563EB" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('teacherOnboarding.subjectsTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('teacherOnboarding.subjectsDesc')}
      </Text>

      <View style={styles.chipGrid}>
        {subjects.map((subject) => {
          const isSelected = selectedSubjects.includes(subject.name_en);
          return (
            <TouchableOpacity
              key={subject.id}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? '#2563EB' : colors.card,
                  borderColor: isSelected ? '#2563EB' : colors.border,
                },
              ]}
              onPress={() => toggleSubject(subject.name_en)}
            >
              <Text style={[
                styles.chipText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}>
                {getSubjectName(subject)}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep2_Experience = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#DCFCE7' }]}>
        <Ionicons name="ribbon" size={48} color="#16A34A" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('teacherOnboarding.experienceTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('teacherOnboarding.experienceDesc')}
      </Text>

      <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="time-outline" size={24} color={colors.textSecondary} />
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder={t('teacherOnboarding.experiencePlaceholder')}
          placeholderTextColor={colors.textTertiary || colors.textSecondary}
          value={experienceYears}
          onChangeText={(text) => setExperienceYears(text.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>
          {t('common.years', 'years')}
        </Text>
      </View>

      <View style={styles.presetRow}>
        {[1, 3, 5, 10, 15, 20].map(years => {
          const isSelected = experienceYears === String(years);
          return (
            <TouchableOpacity
              key={years}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isSelected ? '#16A34A' : colors.card,
                  borderColor: isSelected ? '#16A34A' : colors.border,
                },
              ]}
              onPress={() => setExperienceYears(String(years))}
            >
              <Text style={[
                styles.presetText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}>
                {years}+
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep3_Groups = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#FEF3C7' }]}>
        <Ionicons name="people" size={48} color="#D97706" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('teacherOnboarding.groupsTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('teacherOnboarding.groupsDesc')}
      </Text>

      <View style={styles.groupGrid}>
        {EXAM_GROUPS.map(group => {
          const isSelected = selectedGroups.includes(group);
          return (
            <TouchableOpacity
              key={group}
              style={[
                styles.groupChip,
                {
                  backgroundColor: isSelected ? '#D97706' : colors.card,
                  borderColor: isSelected ? '#D97706' : colors.border,
                },
              ]}
              onPress={() => toggleGroup(group)}
            >
              <Text style={[
                styles.groupText,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}>
                {t('teacherProfile.group', 'Group')} {group}
              </Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderStep4_Rates = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#EDE9FE' }]}>
        <Ionicons name="cash" size={48} color="#7C3AED" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('teacherOnboarding.ratesTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('teacherOnboarding.ratesDesc')}
      </Text>

      <Text style={[styles.rateLabel, { color: colors.text }]}>
        {t('teacherOnboarding.hourlyRateLabel', t('teacherOnboarding.hourlyRate'))}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
        <Ionicons name="time-outline" size={24} color={colors.textSecondary} />
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder={t('teacherOnboarding.hourlyPlaceholder')}
          placeholderTextColor={colors.textTertiary || colors.textSecondary}
          value={hourlyRate}
          onChangeText={(text) => setHourlyRate(text.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          maxLength={6}
        />
        <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>AZN</Text>
      </View>

      <Text style={[styles.rateLabel, { color: colors.text }]}>
        {t('teacherOnboarding.monthlyRate')}
      </Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={24} color={colors.textSecondary} />
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder={t('teacherOnboarding.monthlyPlaceholder')}
          placeholderTextColor={colors.textTertiary || colors.textSecondary}
          value={monthlyRate}
          onChangeText={(text) => setMonthlyRate(text.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          maxLength={7}
        />
        <Text style={[styles.inputSuffix, { color: colors.textSecondary }]}>AZN</Text>
      </View>
    </View>
  );

  const renderStep5_Bio = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIconWrap, { backgroundColor: '#FCE7F3' }]}>
        <Ionicons name="person" size={48} color="#DB2777" />
      </View>
      <Text style={[styles.stepTitle, { color: colors.text }]}>
        {t('teacherOnboarding.bioTitle')}
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
        {t('teacherOnboarding.bioDesc')}
      </Text>

      <View style={[styles.bioWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput
          style={[styles.bioInput, { color: colors.text }]}
          placeholder={t('teacherOnboarding.bioPlaceholder')}
          placeholderTextColor={colors.textTertiary || colors.textSecondary}
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={6}
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>
          {bio.length}/500
        </Text>
      </View>
    </View>
  );

  // ============================================
  // STEP ROUTER
  // ============================================

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1: return renderStep1_Subjects();
      case 2: return renderStep2_Experience();
      case 3: return renderStep3_Groups();
      case 4: return renderStep4_Rates();
      case 5: return renderStep5_Bio();
      default: return null;
    }
  };

  const isNextDisabled = () => {
    // Step 1: at least one subject required
    if (currentStep === 1 && selectedSubjects.length === 0) return true;
    // Step 3: at least one group required
    if (currentStep === 3 && selectedGroups.length === 0) return true;
    return false;
  };

  // ============================================
  // LOADING / MAIN RENDER
  // ============================================

  const styles = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          {currentStep > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}

          <Text style={[styles.stepIndicator, { color: colors.textSecondary }]}>
            {t('teacherOnboarding.step', { current: currentStep, total: TOTAL_STEPS })}
          </Text>

          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>
              {t('teacherOnboarding.skipForNow')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: progressWidth },
            ]}
          />
        </View>

        {/* Step content */}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          enableOnAndroid={true}
          extraScrollHeight={100}
          enableAutomaticScroll={true}
        >
          <Animated.View style={{ opacity: stepOpacity, flex: 1 }}>
            {renderCurrentStep()}
          </Animated.View>
        </KeyboardAwareScrollView>

        {/* Bottom button */}
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.nextBtn,
              {
                backgroundColor: isNextDisabled() ? colors.border : colors.primary,
              },
            ]}
            onPress={handleNext}
            disabled={isNextDisabled() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.nextBtnText}>
                {currentStep === TOTAL_STEPS
                  ? t('teacherOnboarding.finish')
                  : t('teacherOnboarding.continue')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================
// STYLES
// ============================================

const createStyles = (colors: any) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: '500',
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    marginHorizontal: spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    backgroundColor: '#DBEAFE',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    minWidth: 120,
    gap: 6,
  },
  groupText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    width: '100%',
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
  },
  inputSuffix: {
    fontSize: 14,
    fontWeight: '500',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  presetChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    minWidth: 56,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 15,
    fontWeight: '600',
  },
  rateLabel: {
    fontSize: 14,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginTop: 4,
  },
  bioWrap: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    padding: 14,
  },
  bioInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 140,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextBtn: {
    height: 52,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
