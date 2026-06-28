import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import {
  teacherExamService,
  TeacherQuestion,
  ElmlyQuestionResult,
  SubjectOption,
  SelectedQuestion,
  ExamQuestionEntry,
  CreateTeacherExamData,
  ExamGroupSubject,
} from '../../services/teacherExamService';
import { AlertService } from '../../components/AlertModal';
import { supabase } from '../../services/supabase';
import { ExamType, ExamGroup } from '../../types/mockExam';
import { typography, spacing, borderRadius } from '../../constants/theme';

type NavigationProp = StackNavigationProp<RootStackParamList, 'TeacherBuildExam'>;
type RouteProps = RouteProp<RootStackParamList, 'TeacherBuildExam'>;

interface Props {
  navigation: NavigationProp;
  route: RouteProps;
}

type Step = 1 | 2 | 3;
type QuestionTab = 'mine' | 'elmly';

const EXAM_TYPES: { value: ExamType; labelKey: string; descKey: string }[] = [
  { value: 'first_stage', labelKey: 'exams.filters.firstStage', descKey: 'teacherBuildExam.typeDesc.firstStage' },
  { value: 'second_stage', labelKey: 'exams.filters.secondStage', descKey: 'teacherBuildExam.typeDesc.secondStage' },
  { value: 'individual', labelKey: 'teacherBuildExam.individual', descKey: 'teacherBuildExam.typeDesc.individual' },
];

const EXAM_GROUPS: ExamGroup[] = ['I', 'II', 'III', 'IV', 'V'];

export const TeacherBuildExamScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isMountedRef = useRef(true);
  // Track latest selectedQuestions for use inside async callbacks (avoids stale closure)
  const selectedQuestionsRef = useRef<SelectedQuestion[]>([]);
  // One-time flag: prevents re-overriding selectedSubjectId after edit-mode pre-fill
  const editSubjectSetRef = useRef(false);

  // Edit mode: set when navigating with an examId param (pending exam only)
  const editExamId = route?.params?.examId ?? null;
  const isEditMode = !!editExamId;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Keep ref in sync with state so async callbacks can read the latest value
  useEffect(() => {
    selectedQuestionsRef.current = selectedQuestions;
  }, [selectedQuestions]);

  // ── Navigation state ─────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Exam info ────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [examType, setExamType] = useState<ExamType>('first_stage');
  const [targetGroup, setTargetGroup] = useState<ExamGroup>('I');
  const [duration, setDuration] = useState('60');
  const [totalQuestions, setTotalQuestions] = useState('30');

  // ── Step 2: Questions ────────────────────────────────────────────────────
  const [questionTab, setQuestionTab] = useState<QuestionTab>('mine');
  const [myQuestions, setMyQuestions] = useState<TeacherQuestion[]>([]);
  const [elmlyQuestions, setElmlyQuestions] = useState<ElmlyQuestionResult[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [groupSubjects, setGroupSubjects] = useState<ExamGroupSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [elmlySearch, setElmlySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState<SelectedQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  // True while initData is in progress — shows loading screen so fields appear pre-filled
  const [initLoading, setInitLoading] = useState(true);

  // ── Step 3 / submit ──────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedAsDraft, setSavedAsDraft] = useState(false);
  // After a first-time draft save (create mode), store the new exam's ID so
  // subsequent "Continue Editing → Save" calls go through updateExam instead of
  // creating a duplicate.
  const [draftExamId, setDraftExamId] = useState<string | null>(null);

  useEffect(() => {
    initData();
  }, []);

  // Returns the locale-correct subject name for a given subjectId.
  // Uses the full subjects list (always loaded from getSubjects()).
  // ru falls back to name_az since no Russian subject names in DB.
  const getLocalizedSubjectName = (subjectId?: string): string => {
    if (!subjectId) return '';
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return '';
    if (i18n.language === 'en') return sub.name_en;
    return sub.name_az;
  };

  // Reload my questions when screen regains focus (e.g. returning from TeacherAddQuestion)
  useFocusEffect(
    useCallback(() => {
      if (teacherId) {
        teacherExamService.getMyQuestions(teacherId).then(data => {
          if (isMountedRef.current) setMyQuestions(data);
        });
      }
    }, [teacherId]),
  );

  const initData = async () => {
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id')
      .eq('user_id', user!.id)
      .single();
    if (!teacher || !isMountedRef.current) return;
    setTeacherId(teacher.id);

    const [subs, myQs] = await Promise.all([
      teacherExamService.getSubjects(),
      teacherExamService.getMyQuestions(teacher.id),
    ]);
    if (!isMountedRef.current) return;
    setSubjects(subs);
    setMyQuestions(myQs);
    if (subs.length > 0) setSelectedSubjectId(subs[0].id);

    // In edit mode, pre-fill form fields with existing exam data
    if (isEditMode && editExamId) {
      const existing = await teacherExamService.getExamForEdit(editExamId);
      if (!isMountedRef.current) return;
      if (existing) {
        const { examMeta, questions } = existing;
        setTitle(examMeta.title);
        setExamType(examMeta.exam_type);
        if (examMeta.target_group) setTargetGroup(examMeta.target_group);
        setDuration(String(examMeta.duration_minutes));
        setTotalQuestions(String(examMeta.total_questions));
        setSelectedQuestions(questions);
        // Stay on Step 1 so teacher can review/edit exam details before proceeding
      } else {
        // Exam not found or already approved — cannot edit
        AlertService.alert(t('common.error'), t('teacherBuildExam.editNotAllowed', { defaultValue: 'This exam cannot be edited. It may already be approved.' }));
        navigation.goBack();
      }
    }
    if (isMountedRef.current) setInitLoading(false);
  };

  // When examType or targetGroup changes (for first/second stage), load group subjects
  useEffect(() => {
    if (examType === 'individual') {
      setGroupSubjects([]);
      return;
    }
    const stage = examType === 'first_stage' ? 'first' : 'second';
    teacherExamService.getExamGroupConfig(targetGroup, stage).then(data => {
      if (!isMountedRef.current) return;
      setGroupSubjects(data);
      if (data.length > 0) {
        const groupTotal = data.reduce((sum, s) => sum + s.questions_count, 0);
        // Stage exams always lock total_questions to the group config total (e.g. 90).
        // This applies in both create AND edit mode — the value is authoritative from DB.
        setTotalQuestions(String(groupTotal));
        // Always default to first group subject — edit mode override handled by the
        // editSubjectSetRef effect below once pre-loaded questions are available.
        setSelectedSubjectId(data[0].subject_id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examType, targetGroup]);

  // Edit mode only: once both groupSubjects AND pre-loaded selectedQuestions are available,
  // pick the subject of the first pre-loaded question so the question list is visible.
  // The editSubjectSetRef guard ensures this fires exactly once (prevents overriding
  // user's manual subject selections after the initial pre-fill).
  useEffect(() => {
    if (!isEditMode || editSubjectSetRef.current) return;
    if (selectedQuestions.length > 0 && groupSubjects.length > 0) {
      const firstQ = selectedQuestions[0];
      if (firstQ?.subject_id) {
        editSubjectSetRef.current = true;
        setSelectedSubjectId(firstQ.subject_id);
      }
    }
  }, [selectedQuestions, groupSubjects, isEditMode]);

  // Load Elmly questions when subject or debounced search changes (tab = elmly)
  useEffect(() => {
    if (questionTab === 'elmly' && selectedSubjectId) {
      loadElmlyQuestions();
    }
  }, [questionTab, selectedSubjectId, debouncedSearch]);

  // Debounce the search input — prevents re-render + focus loss on each keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(elmlySearch), 2000);
    return () => clearTimeout(timer);
  }, [elmlySearch]);

  const loadElmlyQuestions = async () => {
    if (!selectedSubjectId) return;
    setLoadingQuestions(true);
    const data = await teacherExamService.searchElmlyQuestions(
      selectedSubjectId,
      debouncedSearch || undefined,
      40,
    );
    if (isMountedRef.current) {
      setElmlyQuestions(data);
      setLoadingQuestions(false);
    }
  };

  // ── Step 1 validation ─────────────────────────────────────────────────────
  const validateStep1 = (): string | null => {
    if (!title.trim()) return t('teacherBuildExam.errors.noTitle');
    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur < 10 || dur > 180) return t('teacherBuildExam.errors.badDuration');
    // Stage exams lock total_questions to the group config total — no manual validation needed.
    // Individual exams: validate free-form input.
    if (examType === 'individual') {
      const tot = parseInt(totalQuestions, 10);
      if (isNaN(tot) || tot < 5 || tot > 90) return t('teacherBuildExam.errors.badTotal');
    }
    return null;
  };

  // ── Question selection helpers ────────────────────────────────────────────
  const isSelected = (id: string) =>
    selectedQuestions.some(q => q.teacher_question_id === id || q.question_id === id);

  const toggleMyQuestion = (q: TeacherQuestion) => {
    if (isSelected(q.id)) {
      setSelectedQuestions(prev => prev.filter(s => s.teacher_question_id !== q.id));
    } else {
      setSelectedQuestions(prev => [
        ...prev,
        {
          id: q.id,
          teacher_question_id: q.id,
          question_text: q.question_text,
          subject_name: q.subject_name,
          subject_id: q.subject_id,
          source: 'mine',
        },
      ]);
    }
  };

  const toggleElmlyQuestion = (q: ElmlyQuestionResult) => {
    if (isSelected(q.id)) {
      setSelectedQuestions(prev => prev.filter(s => s.question_id !== q.id));
    } else {
      setSelectedQuestions(prev => [
        ...prev,
        {
          id: q.id,
          question_id: q.id,
          question_text: q.question_text,
          subject_name: q.subject_name,
          subject_id: q.subject_id,
          source: 'elmly',
        },
      ]);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setSelectedQuestions(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    setSelectedQuestions(prev => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const removeQuestion = (index: number) => {
    setSelectedQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (selectedQuestions.length === 0) {
      AlertService.alert(t('common.alert'), t('teacherBuildExam.errors.noQuestions'));
      return;
    }
    if (!teacherId) return;

    const totalQ = parseInt(totalQuestions, 10);
    // Exam is a draft if the teacher hasn't filled the declared number of questions yet.
    const isDraft = selectedQuestions.length !== totalQ;

    setSubmitting(true);
    const examData: CreateTeacherExamData = {
      title: title.trim(),
      exam_type: examType,
      target_group: examType !== 'individual' ? targetGroup : undefined,
      duration_minutes: parseInt(duration, 10),
      total_questions: totalQ,
      exam_group_id: groupSubjects.length > 0 ? groupSubjects[0].group_id : undefined,
    };

    const questionEntries: ExamQuestionEntry[] = selectedQuestions.map((q, i) => ({
      question_id: q.question_id,
      teacher_question_id: q.teacher_question_id,
      question_order: i + 1,
    }));

    // effectiveExamId: use the route param (edit mode) OR the ID from a previous draft save.
    // This prevents duplicate exam creation if the teacher saves draft → continues → saves again.
    const effectiveExamId = editExamId || draftExamId;
    let success = false;
    if (effectiveExamId) {
      success = await teacherExamService.updateExam(teacherId, effectiveExamId, examData, questionEntries, isDraft);
    } else {
      const id = await teacherExamService.createExam(teacherId, examData, questionEntries, isDraft);
      if (id) {
        setDraftExamId(id);
        success = true;
      }
    }
    setSubmitting(false);

    if (success) {
      if (isDraft) {
        setSavedAsDraft(true);
      } else {
        setSubmitted(true);
      }
    } else {
      AlertService.alert(t('common.error'), t('teacherBuildExam.submitFailed'));
    }
  };

  // ── Loading screen: shown while initData fetches all data ────────────────
  if (initLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditMode ? t('teacherBuildExam.editTitle', { defaultValue: 'Edit Exam' }) : t('teacherBuildExam.title')}
          </Text>
          <Text style={styles.stepIndicator} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Draft saved screen ───────────────────────────────────────────────────
  if (savedAsDraft) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <View style={[styles.successIcon, { backgroundColor: '#F3F4F6' }]}>
            <Ionicons name="create-outline" size={64} color="#6B7280" />
          </View>
          <Text style={styles.successTitle}>
            {t('teacherBuildExam.draftSuccessTitle')}
          </Text>
          <Text style={styles.successSubtitle}>
            {t('teacherBuildExam.draftSuccessSubtitle', {
              added: selectedQuestions.length,
              total: totalQuestions,
            })}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setSavedAsDraft(false);
              setStep(2);
            }}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{t('teacherBuildExam.continueDraft')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.surface, marginTop: spacing.sm }]}
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
              else (navigation as any).navigate('TeacherMyExams');
            }}
          >
            <Text style={[styles.primaryBtnText, { color: colors.text }]}>
              {t('teacherBuildExam.viewMyExams')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <View style={[styles.successIcon, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="checkmark-circle" size={64} color="#059669" />
          </View>
          <Text style={styles.successTitle}>
            {isEditMode ? t('teacherBuildExam.updateSuccessTitle', { defaultValue: 'Exam Updated' }) : t('teacherBuildExam.successTitle')}
          </Text>
          <Text style={styles.successSubtitle}>
            {isEditMode ? t('teacherBuildExam.updateSuccessSubtitle', { defaultValue: 'Your exam has been updated and is pending re-review.' }) : t('teacherBuildExam.successSubtitle')}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                (navigation as any).navigate('TeacherMyExams');
              }
            }}
          >
            <Text style={styles.primaryBtnText}>{t('teacherBuildExam.viewMyExams')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => step === 1 ? navigation.goBack() : setStep((step - 1) as Step)}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditMode ? t('teacherBuildExam.editTitle', { defaultValue: 'Edit Exam' }) : t('teacherBuildExam.title')}
          </Text>
          <Text style={styles.stepIndicator}>{step}/3</Text>
        </View>

        {/* Step progress */}
        <View style={styles.progressRow}>
          {[1, 2, 3].map(s => (
            <View
              key={s}
              style={[
                styles.progressDot,
                { backgroundColor: s <= step ? colors.primary : colors.border },
                s === step && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {/* ── Step 1: Exam Info ─────────────────────────────────────────── */}
        {step === 1 && (
          <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>{t('teacherBuildExam.step1Title')}</Text>

            <Text style={styles.fieldLabel}>{t('teacherBuildExam.examTitle')} *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder={t('teacherBuildExam.examTitlePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={200}
            />

            <Text style={styles.fieldLabel}>{t('teacherBuildExam.examType')} *</Text>
            <View style={styles.chipRow}>
              {EXAM_TYPES.map(({ value, labelKey, descKey }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, examType === value && styles.chipActive]}
                  onPress={() => setExamType(value)}
                >
                  <Text style={[styles.chipText, examType === value && styles.chipTextActive]}>
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Type description hint */}
            <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>
              {t(EXAM_TYPES.find(e => e.value === examType)?.descKey || '')}
            </Text>

            {/* Group selector — only for first/second stage */}
            {examType !== 'individual' && (
              <>
                <Text style={styles.fieldLabel}>{t('teacherBuildExam.targetGroup')} *</Text>
                <View style={styles.chipRow}>
                  {EXAM_GROUPS.map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.chip, targetGroup === g && styles.chipActive]}
                      onPress={() => setTargetGroup(g)}
                    >
                      <Text style={[styles.chipText, targetGroup === g && styles.chipTextActive]}>
                        {t('teacherExams.group', { group: g })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('teacherBuildExam.duration')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  placeholder="60"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.fieldHint}>{t('teacherBuildExam.durationHint')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('teacherBuildExam.totalQuestions')}</Text>
                {examType === 'individual' ? (
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    value={totalQuestions}
                    onChangeText={setTotalQuestions}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={colors.textSecondary}
                  />
                ) : (
                  <View style={[styles.input, styles.lockedInput, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={[styles.lockedInputText, { color: colors.text }]}>{totalQuestions}</Text>
                    <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
                  </View>
                )}
                <Text style={styles.fieldHint}>
                  {examType === 'individual'
                    ? t('teacherBuildExam.totalQuestionsHint')
                    : t('teacherBuildExam.totalQuestionsLocked')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                const err = validateStep1();
                if (err) { AlertService.alert(t('common.alert'), err); return; }
                setStep(2);
              }}
            >
              <Text style={styles.primaryBtnText}>{t('teacherBuildExam.next')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── Step 2: Add Questions ─────────────────────────────────────── */}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            {/* Tab bar */}
            <View style={styles.tabBar}>
              {(['mine', 'elmly'] as QuestionTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, questionTab === tab && styles.tabActive]}
                  onPress={() => setQuestionTab(tab)}
                >
                  <Text style={[styles.tabText, questionTab === tab && styles.tabTextActive]}>
                    {t(`teacherBuildExam.tab.${tab}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Subject filter — group subjects for first/second stage, all subjects for individual */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.subjectScrollView}
              contentContainerStyle={styles.subjectRowContent}
            >
              {(examType === 'individual' ? subjects : groupSubjects.map(gs => ({
                id: gs.subject_id,
                name_az: gs.subject_name_az,
                name_en: gs.subject_name_en,
                _requiredCount: gs.questions_count,
              }))).map((s: any) => {
                const isActive = selectedSubjectId === s.id;
                const selectedForSubject = selectedQuestions.filter(
                  q => examType !== 'individual' && q.subject_id === s.id
                ).length;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.subjectChip, isActive && styles.subjectChipActive]}
                    onPress={() => setSelectedSubjectId(s.id)}
                  >
                    <Text style={[styles.subjectChipText, isActive && styles.subjectChipTextActive]}>
                      {s.name_az}
                    </Text>
                    {s._requiredCount != null && (
                      <Text style={[styles.subjectChipCount, isActive && { color: '#fff' }]}>
                        {selectedForSubject}/{s._requiredCount}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Fixed search bar for Elmly tab — outside FlatList so it stays sticky */}
            {questionTab === 'elmly' && (
              <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Ionicons name="search" size={16} color={colors.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  value={elmlySearch}
                  onChangeText={setElmlySearch}
                  placeholder={t('teacherBuildExam.searchElmly')}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}

            {/* Question list */}
            {loadingQuestions ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={questionTab === 'mine'
                  ? myQuestions.filter(q => !selectedSubjectId || q.subject_id === selectedSubjectId)
                  : elmlyQuestions
                }
                keyExtractor={item => item.id}
                contentContainerStyle={styles.qList}
                ListHeaderComponent={
                  questionTab === 'mine' ? (
                    <TouchableOpacity
                      style={[styles.addNewBtn, { borderColor: colors.primary }]}
                      onPress={() => navigation.navigate('TeacherAddQuestion', {
                        // For stage exams, restrict subject choice to group subjects only
                        allowedSubjectIds: examType !== 'individual' && groupSubjects.length > 0
                          ? groupSubjects.map(gs => gs.subject_id)
                          : undefined,
                      })}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                      <Text style={[styles.addNewBtnText, { color: colors.primary }]}>
                        {t('teacherBuildExam.addNewQuestion')}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item }) => {
                  const sel = isSelected(item.id);
                  const isMyQ = questionTab === 'mine';
                  return (
                    <TouchableOpacity
                      style={[styles.qCard, sel && { borderColor: colors.primary, borderWidth: 1.5 }]}
                      onPress={() => questionTab === 'mine'
                        ? toggleMyQuestion(item as TeacherQuestion)
                        : toggleElmlyQuestion(item as ElmlyQuestionResult)
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.qText} numberOfLines={2}>{item.question_text}</Text>
                        {'subject_id' in item && (item as any).subject_id && (
                          <Text style={styles.qMeta}>
                            {getLocalizedSubjectName((item as any).subject_id) || (item as any).subject_name}
                          </Text>
                        )}
                      </View>
                      {isMyQ && (
                        <TouchableOpacity
                          style={styles.editQBtn}
                          onPress={() => navigation.navigate('TeacherAddQuestion', {
                            questionId: item.id,
                            allowedSubjectIds: examType !== 'individual' && groupSubjects.length > 0
                              ? groupSubjects.map(gs => gs.subject_id)
                              : undefined,
                          })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      <View style={[styles.selCircle, sel && { backgroundColor: colors.primary }]}>
                        {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyList}>
                    <Text style={{ color: colors.textSecondary }}>
                      {questionTab === 'mine'
                        ? t('teacherBuildExam.noMyQuestions')
                        : t('teacherBuildExam.noElmlyResults')}
                    </Text>
                  </View>
                }
              />
            )}

            {/* Bottom bar */}
            <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={styles.selectedCount}>
                {selectedQuestions.length} {t('teacherBuildExam.questionsSelected')}
              </Text>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: selectedQuestions.length > 0 ? colors.primary : colors.border }]}
                disabled={selectedQuestions.length === 0}
                onPress={() => setStep(3)}
              >
                <Text style={styles.nextBtnText}>{t('teacherBuildExam.preview')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 3: Preview & Submit ──────────────────────────────────── */}
        {step === 3 && (
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('teacherBuildExam.step3Title')}</Text>

              {/* Exam summary */}
              <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
                <Text style={styles.summaryTitle}>{title}</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('teacherBuildExam.examType')}:</Text>
                  <Text style={styles.summaryValue}>
                    {t(EXAM_TYPES.find(e => e.value === examType)?.labelKey || '')}
                  </Text>
                </View>
                {examType !== 'individual' && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('teacherBuildExam.targetGroup')}:</Text>
                    <Text style={styles.summaryValue}>{t('teacherExams.group', { group: targetGroup })}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('teacherBuildExam.duration')}:</Text>
                  <Text style={styles.summaryValue}>{duration} {t('exams.list.min')}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('teacherBuildExam.questionsCount')}:</Text>
                  <Text style={styles.summaryValue}>{selectedQuestions.length}</Text>
                </View>
              </View>

              {/* Leaderboard notice */}
              <View style={[styles.noticeBanner, { backgroundColor: '#FEF3C720', borderColor: '#D9770680' }]}>
                <Ionicons name="information-circle-outline" size={16} color="#D97706" />
                <Text style={styles.noticeText}>{t('teacherBuildExam.leaderboardNotice')}</Text>
              </View>

              {/* Scoring notice for individual exams */}
              {examType === 'individual' && (
                <View style={[styles.noticeBanner, { backgroundColor: '#6366F110', borderColor: '#6366F140', marginTop: 0 }]}>
                  <Ionicons name="calculator-outline" size={16} color="#6366F1" />
                  <Text style={[styles.noticeText, { color: '#6366F1' }]}>
                    {t('teacherBuildExam.individualScoringNotice')}
                  </Text>
                </View>
              )}

              {/* Group subject breakdown for first/second stage */}
              {examType !== 'individual' && groupSubjects.length > 0 && (
                <View style={[styles.noticeBanner, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '40', marginTop: 0 }]}>
                  <Ionicons name="layers-outline" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.noticeText, { color: colors.primary }]}>
                      {t('teacherBuildExam.groupScoringNotice')}
                    </Text>
                    {groupSubjects.map(gs => {
                      const cnt = selectedQuestions.filter(q => q.subject_id === gs.subject_id).length;
                      return (
                        <Text key={gs.subject_id} style={[styles.noticeText, { color: colors.textSecondary, marginTop: 2 }]}>
                          {gs.subject_name_az}: {cnt}/{gs.questions_count} {t('teacherBuildExam.questionsUnit')} × {gs.coefficient}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Question list with reorder */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                {t('teacherBuildExam.questionOrder')}
              </Text>
              {selectedQuestions.map((q, index) => (
                <View key={q.id} style={[styles.previewQCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.previewQLeft}>
                    <Text style={styles.previewQNum}>{index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewQText} numberOfLines={2}>{q.question_text}</Text>
                      <View style={styles.previewQMeta}>
                        {q.subject_id && (
                          <Text style={styles.previewQMetaText}>
                            {getLocalizedSubjectName(q.subject_id) || q.subject_name}
                          </Text>
                        )}
                        <View style={[styles.sourceBadge, {
                          backgroundColor: q.source === 'mine' ? colors.primary + '20' : '#6366F120',
                        }]}>
                          <Text style={[styles.sourceBadgeText, {
                            color: q.source === 'mine' ? colors.primary : '#6366F1',
                          }]}>
                            {q.source === 'mine' ? t('teacherBuildExam.myQuestion') : t('teacherBuildExam.elmlyQuestion')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={styles.reorderBtns}>
                    <TouchableOpacity onPress={() => moveUp(index)} disabled={index === 0}>
                      <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveDown(index)} disabled={index === selectedQuestions.length - 1}>
                      <Ionicons name="chevron-down" size={20} color={index === selectedQuestions.length - 1 ? colors.border : colors.text} />
                    </TouchableOpacity>
                    {q.source === 'mine' && q.teacher_question_id && (
                      <TouchableOpacity
                        onPress={() => navigation.navigate('TeacherAddQuestion', {
                          questionId: q.teacher_question_id,
                          allowedSubjectIds: examType !== 'individual' && groupSubjects.length > 0
                            ? groupSubjects.map(gs => gs.subject_id)
                            : undefined,
                        })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeQuestion(index)}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.error || '#EF4444'} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Count mismatch warning — shown when added questions ≠ declared total */}
              {selectedQuestions.length !== parseInt(totalQuestions, 10) && (
                <View style={[styles.noticeBanner, { backgroundColor: '#FEF3C720', borderColor: '#D9770680', marginTop: spacing.lg }]}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" />
                  <Text style={styles.noticeText}>
                    {t('teacherBuildExam.countMismatchNotice', {
                      added: selectedQuestions.length,
                      total: totalQuestions,
                    })}
                  </Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.primaryBtn, {
                  backgroundColor: selectedQuestions.length !== parseInt(totalQuestions, 10)
                    ? '#6B7280'
                    : colors.primary,
                  marginTop: selectedQuestions.length !== parseInt(totalQuestions, 10) ? spacing.sm : spacing.xl,
                }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={selectedQuestions.length !== parseInt(totalQuestions, 10) ? 'save-outline' : 'cloud-upload-outline'}
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.primaryBtnText}>
                      {selectedQuestions.length !== parseInt(totalQuestions, 10)
                        ? t('teacherBuildExam.saveAsDraft')
                        : t('teacherBuildExam.submitForReview')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyList: { paddingVertical: spacing.xl, alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: { marginRight: spacing.md },
    headerTitle: {
      flex: 1,
      fontSize: typography.fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
    },
    stepIndicator: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    progressRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    progressDot: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    progressDotActive: {
      height: 5,
    },
    stepContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    stepTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.lg,
    },
    fieldLabel: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: colors.text,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    fieldHint: {
      fontSize: typography.fontSizes.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    input: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.fontSizes.sm,
      backgroundColor: colors.surface,
    },
    lockedInput: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      opacity: 0.7,
    },
    lockedInputText: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.fontSizes.sm, color: colors.text },
    chipTextActive: { color: '#fff' },
    row2: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
      marginTop: spacing.xl,
      alignSelf: 'stretch',
    },
    primaryBtnText: { color: '#fff', fontSize: typography.fontSizes.md, fontWeight: '700' },
    // Step 2
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.md,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: typography.fontSizes.sm, color: colors.textSecondary },
    tabTextActive: { color: colors.primary, fontWeight: '700' },
    subjectScrollView: {
      flexGrow: 0,
      flexShrink: 0,
    },
    subjectRowContent: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      paddingRight: spacing.xl, // ensures last chip fully visible
    },
    subjectChip: {
      paddingVertical: 4,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginRight: spacing.xs,
      height: 32,
      justifyContent: 'center',
    },
    subjectChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    subjectChipText: { fontSize: typography.fontSizes.xs, color: colors.text },
    subjectChipTextActive: { color: '#fff' },
    subjectChipCount: {
      fontSize: 10,
      color: colors.textSecondary,
      marginLeft: 3,
      fontWeight: '600',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.lg,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderRadius: borderRadius.md,
      height: 40,
      gap: spacing.xs,
    },
    searchInput: { flex: 1, fontSize: typography.fontSizes.sm },
    addNewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderRadius: borderRadius.md,
      borderStyle: 'dashed',
    },
    addNewBtnText: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
    qList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    qCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    qText: { fontSize: typography.fontSizes.sm, color: colors.text },
    qMeta: { fontSize: typography.fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
    editQBtn: {
      padding: spacing.xs,
      marginLeft: spacing.xs,
      marginRight: 2,
    },
    selCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: spacing.sm,
    },
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: 1,
    },
    selectedCount: { fontSize: typography.fontSizes.sm, color: colors.textSecondary },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
    },
    nextBtnText: { color: '#fff', fontSize: typography.fontSizes.sm, fontWeight: '700' },
    // Step 3
    summaryCard: {
      padding: spacing.lg,
      borderRadius: borderRadius.md,
      marginBottom: spacing.md,
    },
    summaryTitle: {
      fontSize: typography.fontSizes.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    summaryLabel: {
      fontSize: typography.fontSizes.sm,
      color: colors.textSecondary,
      width: 100,
    },
    summaryValue: {
      fontSize: typography.fontSizes.sm,
      color: colors.text,
      fontWeight: '600',
    },
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      marginBottom: spacing.sm,
    },
    noticeText: {
      flex: 1,
      fontSize: typography.fontSizes.xs,
      color: '#D97706',
      lineHeight: 18,
    },
    previewQCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    previewQLeft: { flexDirection: 'row', flex: 1, gap: spacing.sm, alignItems: 'flex-start' },
    previewQNum: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '700',
      color: colors.textSecondary,
      width: 24,
      marginTop: 2,
    },
    previewQText: { fontSize: typography.fontSizes.sm, color: colors.text },
    previewQMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    previewQMetaText: { fontSize: typography.fontSizes.xs, color: colors.textSecondary },
    sourceBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    sourceBadgeText: { fontSize: 10, fontWeight: '600' },
    reorderBtns: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      marginLeft: spacing.sm,
    },
    // Success
    successIcon: {
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    successTitle: {
      fontSize: typography.fontSizes.xl,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    successSubtitle: {
      fontSize: typography.fontSizes.md,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.xl,
      marginBottom: spacing.xl,
      lineHeight: 22,
    },
  });
