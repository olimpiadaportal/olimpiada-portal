import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { spacing, borderRadius } from '../../constants/theme';
import { goalService } from '../../services/goalService';
import { studyPlanService } from '../../services/studyPlanService';
import { notificationService } from '../../services/notificationService';
import { supabase } from '../../services/supabase';
import {
  StudentGoal,
  GoalSettingFormData,
  QUESTION_TARGET_OPTIONS,
  TIME_TARGET_OPTIONS,
  STUDY_TIME_OPTIONS,
} from '../../types/goals';
import { useAlert } from '../../components/AlertProvider';
import DateTimePicker from '@react-native-community/datetimepicker';

const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6];

export const GoalSettingScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { user } = useAuthStore();
  const { showSuccess, showError } = useAlert();

  // Locale-aware day labels (Sun=0 through Sat=6)
  const DAY_LABELS = [
    t('goals.daySun', 'S'),
    t('goals.dayMon', 'M'),
    t('goals.dayTue', 'T'),
    t('goals.dayWed', 'W'),
    t('goals.dayThu', 'T'),
    t('goals.dayFri', 'F'),
    t('goals.daySat', 'S'),
  ];

  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Form state
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState(20);
  const [dailyTimeTarget, setDailyTimeTarget] = useState(30);
  const [targetExamDate, setTargetExamDate] = useState<Date | null>(null);
  const [targetScore, setTargetScore] = useState<number | null>(null);
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [preferredTime, setPreferredTime] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('evening');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Subject selection for study plan
  const [availableSubjects, setAvailableSubjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  
  // Track original plan subjects to detect unselections with progress
  const [originalPlanSubjectIds, setOriginalPlanSubjectIds] = useState<string[]>([]);
  const [subjectsWithProgress, setSubjectsWithProgress] = useState<Map<string, { name: string; progress: number }>>(new Map());
  
  // Confirmation modal for unselecting subjects with progress
  const [showProgressLossModal, setShowProgressLossModal] = useState(false);
  const [subjectToUnselect, setSubjectToUnselect] = useState<{ id: string; name: string; progress: number } | null>(null);

  useEffect(() => {
    loadExistingGoals();
  }, [user]);

  const loadExistingGoals = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!student) return;
      setStudentId(student.id);

      // Load available subjects with locale-aware names
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name_en, name_az')
        .order('name_en');

      if (subjects) {
        const lang = t('common.locale', 'en-US').startsWith('az') ? 'az' : t('common.locale', 'en-US').startsWith('ru') ? 'ru' : 'en';
        setAvailableSubjects(
          subjects.map((s: any) => ({
            id: s.id,
            name: (lang === 'az' || lang === 'ru') && s.name_az ? s.name_az : s.name_en,
          }))
        );
      }

      const goals = await goalService.getGoals(student.id);
      if (goals) {
        setDailyQuestionTarget(goals.daily_question_target);
        setDailyTimeTarget(goals.daily_time_target_minutes);
        setTargetExamDate(goals.target_exam_date ? new Date(goals.target_exam_date) : null);
        setTargetScore(goals.target_score);
        setPreferredDays(goals.preferred_study_days || [1, 2, 3, 4, 5]);
        setPreferredTime(goals.preferred_study_time as any || 'evening');
      }

      // Pre-select subjects from existing active plan if any
      const activePlan = await studyPlanService.getActivePlan(student.id);
      if (activePlan?.weeks && activePlan.weeks.length > 0) {
        const planSubjectIds = new Set<string>();
        const subjectNameMap = new Map<string, string>();
        
        // Collect all focus subject IDs and names from the plan
        activePlan.weeks.forEach(w => {
          w.focus_subjects.forEach((id, idx) => {
            planSubjectIds.add(id);
            if (w.focus_subject_names?.[idx]) {
              subjectNameMap.set(id, w.focus_subject_names[idx]);
            }
          });
        });
        
        const subjectIdsArray = Array.from(planSubjectIds);
        setSelectedSubjectIds(subjectIdsArray);
        setOriginalPlanSubjectIds(subjectIdsArray);
        
        // Query per-subject progress - fetch all user's answers with question subject info
        if (subjectIdsArray.length > 0) {
          const progressMap = new Map<string, { name: string; progress: number }>();
          
          // Fetch all answers with their question's subject_id
          const { data: allAnswers, error: answersError } = await supabase
            .from('student_answers')
            .select('id, question_id, questions!inner(subject_id)')
            .eq('user_id', user.id);
          
          if (answersError) {
            console.warn('Error fetching answers for progress:', answersError);
          }
          
          if (allAnswers && allAnswers.length > 0) {
            // Count answers per subject, only for focus subjects
            allAnswers.forEach((answer: any) => {
              const subjectId = answer.questions?.subject_id;
              if (subjectId && planSubjectIds.has(subjectId)) {
                const existing = progressMap.get(subjectId);
                const subjectName = subjectNameMap.get(subjectId) || 'Unknown';
                if (existing) {
                  progressMap.set(subjectId, { 
                    name: subjectName, 
                    progress: existing.progress + 1 
                  });
                } else {
                  progressMap.set(subjectId, { name: subjectName, progress: 1 });
                }
              }
            });
          }
          
          console.log('Subjects with progress:', Array.from(progressMap.entries()));
          setSubjectsWithProgress(progressMap);
        }
      } else {
        // No active plan - check if student has weak subjects from onboarding quiz
        const { data: studentData } = await supabase
          .from('students')
          .select('weakest_subjects')
          .eq('id', student.id)
          .single();
        
        if (studentData?.weakest_subjects && studentData.weakest_subjects.length > 0) {
          setSelectedSubjectIds(studentData.weakest_subjects);
        }
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!studentId) return;
    try {
      setSaving(true);
      const formData: GoalSettingFormData = {
        dailyQuestionTarget,
        dailyTimeTargetMinutes: dailyTimeTarget,
        targetExamDate,
        targetScore,
        preferredStudyDays: preferredDays,
        preferredStudyTime: preferredTime,
      };

      const saved = await goalService.saveGoals(studentId, formData);
      if (saved) {
        // Schedule notifications based on preferred study days and time
        try {
          await notificationService.scheduleGoalReminder(preferredTime, preferredDays);
        } catch (notifError) {
          console.warn('Could not schedule goal reminders:', notifError);
        }

        // NOTE: We do NOT regenerate the study plan here.
        // Daily goal changes (questions, time, study days, preferred time) should NOT reset weekly plan progress.
        // Weekly plan only gets regenerated via "Save and Create Weekly Plan" button.

        showSuccess(
          t('goals.saved', 'Goals Saved!'),
          t('goals.savedDesc', 'Your daily goals have been updated.')
        );
        navigation.goBack();
      } else {
        showError(t('common.error', 'Error'), t('goals.saveFailed', 'Failed to save goals.'));
      }
    } catch (error) {
      console.error('Error saving goals:', error);
      showError(t('common.error', 'Error'), t('goals.saveFailed', 'Failed to save goals.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!studentId) return;
    try {
      setGeneratingPlan(true);

      const formData: GoalSettingFormData = {
        dailyQuestionTarget,
        dailyTimeTargetMinutes: dailyTimeTarget,
        targetExamDate,
        targetScore,
        preferredStudyDays: preferredDays,
        preferredStudyTime: preferredTime,
      };

      // Save goals first
      const savedGoals = await goalService.saveGoals(studentId, formData);
      if (!savedGoals) {
        showError(t('common.error', 'Error'), t('goals.saveFailed', 'Failed to save goals.'));
        return;
      }

      // Generate plan with selected subjects (empty array = all subjects)
      const plan = await studyPlanService.generatePlan(
        studentId,
        savedGoals,
        selectedSubjectIds.length > 0 ? selectedSubjectIds : undefined
      );
      if (plan) {
        // Schedule notifications based on preferred study days and time
        try {
          await notificationService.scheduleGoalReminder(preferredTime, preferredDays);
        } catch (notifError) {
          console.warn('Could not schedule goal reminders:', notifError);
        }
        showSuccess(
          t('studyPlan.generated', 'Study Plan Created!'),
          t('studyPlan.generatedDesc', 'Your personalized {{weeks}}-week study plan is ready.', {
            weeks: plan.total_weeks,
          })
        );
        navigation.goBack();
      } else {
        showError(t('common.error', 'Error'), t('studyPlan.generateFailed', 'Failed to generate study plan.'));
      }
    } catch (error) {
      console.error('Error generating plan:', error);
      showError(t('common.error', 'Error'), t('studyPlan.generateFailed', 'Failed to generate study plan.'));
    } finally {
      setGeneratingPlan(false);
    }
  };

  const toggleDay = (day: number) => {
    setPreferredDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  // Handle subject toggle with progress loss warning
  const handleSubjectToggle = (subjectId: string, subjectName: string) => {
    const isCurrentlySelected = selectedSubjectIds.includes(subjectId);
    
    if (isCurrentlySelected) {
      // User is trying to unselect - check if this subject has progress
      const progressData = subjectsWithProgress.get(subjectId);
      const isOriginalSubject = originalPlanSubjectIds.includes(subjectId);
      
      console.log('Subject toggle check:', {
        subjectId,
        subjectName,
        progressData,
        isOriginalSubject,
        subjectsWithProgressSize: subjectsWithProgress.size,
        allProgressKeys: Array.from(subjectsWithProgress.keys()),
      });
      
      if (isOriginalSubject && progressData && progressData.progress > 0) {
        // Show confirmation modal - use the passed subjectName for display
        setSubjectToUnselect({ id: subjectId, name: subjectName, progress: progressData.progress });
        setShowProgressLossModal(true);
        return;
      }
    }
    
    // No progress or adding subject - toggle directly
    setSelectedSubjectIds(prev =>
      isCurrentlySelected
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  const confirmUnselect = () => {
    if (subjectToUnselect) {
      setSelectedSubjectIds(prev => prev.filter(id => id !== subjectToUnselect.id));
    }
    setShowProgressLossModal(false);
    setSubjectToUnselect(null);
  };

  const cancelUnselect = () => {
    setShowProgressLossModal(false);
    setSubjectToUnselect(null);
  };

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTargetExamDate(selectedDate);
    }
  };

  const getTimeIcon = (time: string): keyof typeof Ionicons.glyphMap => {
    switch (time) {
      case 'morning': return 'sunny';
      case 'afternoon': return 'partly-sunny';
      case 'evening': return 'moon';
      case 'night': return 'cloudy-night';
      default: return 'time';
    }
  };

  const getTimeLabel = (time: string): string => {
    switch (time) {
      case 'morning': return t('goals.morning', 'Morning');
      case 'afternoon': return t('goals.afternoon', 'Afternoon');
      case 'evening': return t('goals.evening', 'Evening');
      case 'night': return t('goals.night', 'Night');
      default: return time;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {t('common.loading', 'Loading...')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('goals.title', 'Set Your Goals')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Daily Question Target */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="help-circle" size={22} color="#3B82F6" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('goals.dailyQuestions', 'Daily Questions')}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('goals.dailyQuestionsDesc', 'How many questions do you want to answer each day?')}
          </Text>
          <View style={styles.optionsRow}>
            {QUESTION_TARGET_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: dailyQuestionTarget === option ? colors.primary : colors.background,
                    borderColor: dailyQuestionTarget === option ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setDailyQuestionTarget(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: dailyQuestionTarget === option ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Daily Time Target */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={22} color="#8B5CF6" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('goals.dailyTime', 'Daily Study Time')}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('goals.dailyTimeDesc', 'How many minutes do you want to study each day?')}
          </Text>
          <View style={styles.optionsRow}>
            {TIME_TARGET_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: dailyTimeTarget === option ? '#8B5CF6' : colors.background,
                    borderColor: dailyTimeTarget === option ? '#8B5CF6' : colors.border,
                  },
                ]}
                onPress={() => setDailyTimeTarget(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: dailyTimeTarget === option ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {option} {t('goals.min', 'min')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Preferred Study Days */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={22} color="#10B981" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('goals.studyDays', 'Study Days')}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('goals.studyDaysDesc', 'Which days do you plan to study?')}
          </Text>
          <View style={styles.daysRow}>
            {DAY_VALUES.map((day, index) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: preferredDays.includes(day) ? '#10B981' : colors.background,
                    borderColor: preferredDays.includes(day) ? '#10B981' : colors.border,
                  },
                ]}
                onPress={() => toggleDay(day)}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: preferredDays.includes(day) ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {DAY_LABELS[index]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Preferred Study Time */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sunny" size={22} color="#F59E0B" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('goals.studyTime', 'Preferred Time')}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('goals.studyTimeDesc', 'When do you prefer to study?')}
          </Text>
          <View style={styles.timeOptionsRow}>
            {STUDY_TIME_OPTIONS.map(time => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.timeChip,
                  {
                    backgroundColor: preferredTime === time ? '#F59E0B' : colors.background,
                    borderColor: preferredTime === time ? '#F59E0B' : colors.border,
                  },
                ]}
                onPress={() => setPreferredTime(time)}
              >
                <Ionicons
                  name={getTimeIcon(time)}
                  size={18}
                  color={preferredTime === time ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.timeText,
                    { color: preferredTime === time ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {getTimeLabel(time)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Focus Subjects (for study plan) */}
        {availableSubjects.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="book" size={22} color="#6366F1" />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('goals.focusSubjects', 'Focus Subjects')}
              </Text>
              <Text style={[styles.optionalBadge, { color: colors.textSecondary }]}>
                {t('common.optional', 'Optional')}
              </Text>
            </View>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
              {t('goals.focusSubjectsDesc', 'These subjects are used when you build a weekly study plan. Your plan progress will only count questions from selected subjects.')}
            </Text>
            <View style={styles.subjectsGrid}>
              {availableSubjects.map(subject => {
                const isSelected = selectedSubjectIds.includes(subject.id);
                return (
                  <TouchableOpacity
                    key={subject.id}
                    style={[
                      styles.subjectChip,
                      {
                        backgroundColor: isSelected ? '#6366F1' : colors.background,
                        borderColor: isSelected ? '#6366F1' : colors.border,
                      },
                    ]}
                    onPress={() => handleSubjectToggle(subject.id, subject.name)}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
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
            {selectedSubjectIds.length > 0 && (
              <TouchableOpacity onPress={() => setSelectedSubjectIds([])}>
                <Text style={{ color: colors.primary, fontSize: 12, marginTop: 8 }}>
                  {t('goals.clearSelection', 'Clear selection (use all subjects)')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Section: Exam Date (Optional) */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flag" size={22} color="#EF4444" />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('goals.examDate', 'Exam Date')}
            </Text>
            <Text style={[styles.optionalBadge, { color: colors.textSecondary }]}>
              {t('common.optional', 'Optional')}
            </Text>
          </View>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('goals.examDateDesc', 'When is your exam? This helps create a study plan.')}
          </Text>
          <TouchableOpacity
            style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: targetExamDate ? colors.text : colors.textSecondary }]}>
              {targetExamDate
                ? targetExamDate.toLocaleDateString()
                : t('goals.selectDate', 'Select exam date')}
            </Text>
            {targetExamDate && (
              <TouchableOpacity onPress={() => setTargetExamDate(null)}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={targetExamDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={new Date()}
              onChange={handleDateChange}
            />
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving || generatingPlan}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>
              {saving ? t('common.saving', 'Saving...') : t('goals.saveGoals', 'Save Goals')}
            </Text>
          </TouchableOpacity>

          {targetExamDate && (
            <TouchableOpacity
              style={[styles.planButton, { backgroundColor: '#6366F1' }]}
              onPress={handleGeneratePlan}
              disabled={saving || generatingPlan}
            >
              <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {generatingPlan
                  ? t('studyPlan.generating', 'Generating Plan...')
                  : t('studyPlan.generatePlan', 'Save & Generate Study Plan')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* Progress Loss Confirmation Modal */}
      <Modal
        visible={showProgressLossModal}
        transparent
        animationType="fade"
        onRequestClose={cancelUnselect}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="warning" size={48} color="#F59E0B" />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t('goals.progressLossTitle', 'Progress Will Be Lost')}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              {t('goals.progressLossMessage', 
                'You have {{progress}} questions completed for "{{subject}}". Removing this subject will reset this progress when you generate a new plan.',
                { 
                  progress: subjectToUnselect?.progress || 0,
                  subject: subjectToUnselect?.name || ''
                }
              )}
            </Text>
            <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
              {t('goals.progressLossHint', 'To keep your progress, select "{{subject}}" again.', {
                subject: subjectToUnselect?.name || ''
              })}
            </Text>
            
            <View style={styles.modalButtons}>
              {/* Cancel button (green - recommended action) */}
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { backgroundColor: '#10B981' }]}
                onPress={cancelUnselect}
              >
                <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
                <Text style={styles.modalButtonText}>
                  {t('goals.keepSubject', 'Keep Subject')}
                </Text>
              </TouchableOpacity>
              
              {/* Confirm button (red - destructive action) */}
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, { backgroundColor: '#EF4444' }]}
                onPress={confirmUnselect}
              >
                <Ionicons name="trash" size={18} color="#FFFFFF" />
                <Text style={styles.modalButtonText}>
                  {t('goals.removeSubject', 'Remove Anyway')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  section: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  sectionDesc: {
    fontSize: 13,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  optionalBadge: {
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 44,
    maxHeight: 44,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: 8,
  },
  dateText: {
    fontSize: 14,
    flex: 1,
  },
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: 8,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  subjectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  modalIconContainer: {
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  modalHint: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  modalButtonCancel: {},
  modalButtonConfirm: {},
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
