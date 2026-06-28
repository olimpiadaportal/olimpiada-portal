import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import {
  teacherExamService,
  SubjectOption,
  TopicOption,
  SubtopicOption,
  CreateTeacherQuestionData,
} from '../../services/teacherExamService';
import { AlertService } from '../../components/AlertModal';
import { supabase } from '../../services/supabase';
import { typography, spacing, borderRadius } from '../../constants/theme';

type NavigationProp = StackNavigationProp<RootStackParamList, 'TeacherAddQuestion'>;
type RouteProps = RouteProp<RootStackParamList, 'TeacherAddQuestion'>;

interface Props {
  navigation: NavigationProp;
  route: RouteProps;
}

type QuestionType = 'mcq' | 'short_answer';
type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTIES: { value: Difficulty; labelKey: string }[] = [
  { value: 'easy',   labelKey: 'teacherQuestions.difficultyLevels.easy' },
  { value: 'medium', labelKey: 'teacherQuestions.difficultyLevels.medium' },
  { value: 'hard',   labelKey: 'teacherQuestions.difficultyLevels.hard' },
];

// Map difficulty string to numeric for DB storage
const DIFFICULTY_TO_NUM: Record<Difficulty, 1 | 2 | 3 | 4 | 5> = { easy: 1, medium: 3, hard: 5 };
// Map numeric difficulty back to UI label (for pre-fill in edit mode)
const DIFFICULTY_FROM_NUM: Record<number, Difficulty> = { 1: 'easy', 2: 'easy', 3: 'medium', 4: 'hard', 5: 'hard' };

const MCQ_ANSWERS = ['A', 'B', 'C', 'D', 'E'] as const;

export const TeacherAddQuestionScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isMountedRef = useRef(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const explanationRef = useRef<View>(null);

  // Route params
  const questionId = route?.params?.questionId ?? null;
  const allowedSubjectIds = route?.params?.allowedSubjectIds ?? null;
  const isEditMode = !!questionId;

  // Cache teacherId so we don't re-query on every save
  const teacherIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Reference data ──────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [subtopics, setSubtopics] = useState<SubtopicOption[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // ── Form state ──────────────────────────────────────────────────────────
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [subtopicId, setSubtopicId] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [optionE, setOptionE] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // ── Init: load teacher id, subjects (filtered), and existing question if edit mode ──
  useEffect(() => {
    const init = async () => {
      // 1. Resolve teacher id (needed for updateQuestion security guard)
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (teacher) teacherIdRef.current = teacher.id;

      // 2. Load subjects, filtered to allowedSubjectIds if provided
      const allSubjects = await teacherExamService.getSubjects();
      if (!isMountedRef.current) return;
      const filtered = allowedSubjectIds && allowedSubjectIds.length > 0
        ? allSubjects.filter(s => allowedSubjectIds.includes(s.id))
        : allSubjects;
      setSubjects(filtered);
      // In create mode, dismiss loading now. In edit mode, keep spinner until question loads.
      if (!isEditMode) setLoadingRefs(false);

      // 3. In edit mode: load existing question data and pre-fill the form
      if (isEditMode && questionId) {
        const q = await teacherExamService.getQuestion(questionId);
        if (!isMountedRef.current) { setLoadingRefs(false); return; }
        if (!q) { setLoadingRefs(false); return; }

        // Pre-fill subject/topic/subtopic — must be set in order so dependent effects load
        setSubjectId(q.subject_id);
        if (q.topic_id) {
          const tps = await teacherExamService.getTopics(q.subject_id);
          if (!isMountedRef.current) return;
          setTopics(tps);
          setTopicId(q.topic_id);
          if (q.subtopic_id) {
            const sts = await teacherExamService.getSubtopics(q.topic_id);
            if (!isMountedRef.current) return;
            setSubtopics(sts);
            setSubtopicId(q.subtopic_id);
          }
        }

        // Pre-fill question content
        setQuestionType(q.question_type as QuestionType);
        setQuestionText(q.question_text);
        if (q.question_type === 'mcq') {
          setOptionA(q.option_a || '');
          setOptionB(q.option_b || '');
          setOptionC(q.option_c || '');
          setOptionD(q.option_d || '');
          setOptionE(q.option_e || '');
        }
        setCorrectAnswer(q.correct_answer);
        setExplanation(q.explanation || '');
        setDifficulty(DIFFICULTY_FROM_NUM[q.difficulty] ?? 'medium');
        // All data loaded — dismiss loading screen now (fields appear pre-filled)
        if (isMountedRef.current) setLoadingRefs(false);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load topics when subject changes (user-driven, not edit pre-fill)
  useEffect(() => {
    if (!subjectId || isEditMode) return;  // edit mode handles topics in init
    setTopicId('');
    setSubtopicId('');
    setTopics([]);
    setSubtopics([]);
    teacherExamService.getTopics(subjectId).then(data => {
      if (isMountedRef.current) setTopics(data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  // Load subtopics when topic changes (user-driven)
  useEffect(() => {
    if (!topicId || isEditMode) return;  // edit mode handles subtopics in init
    setSubtopicId('');
    setSubtopics([]);
    teacherExamService.getSubtopics(topicId).then(data => {
      if (isMountedRef.current) setSubtopics(data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // After edit pre-fill, allow user to change subject/topic normally
  // We track whether the initial pre-fill is done to re-enable topic/subtopic loading
  const editPrefillDoneRef = useRef(false);
  useEffect(() => {
    if (isEditMode && subjectId && !editPrefillDoneRef.current) {
      editPrefillDoneRef.current = true;
      return;
    }
    if (isEditMode && editPrefillDoneRef.current && subjectId) {
      // User changed subject after pre-fill — reload topics
      setTopicId('');
      setSubtopicId('');
      setTopics([]);
      setSubtopics([]);
      teacherExamService.getTopics(subjectId).then(data => {
        if (isMountedRef.current) setTopics(data);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  useEffect(() => {
    if (isEditMode && topicId && !editPrefillDoneRef.current) return;
    if (isEditMode && topicId) {
      setSubtopicId('');
      setSubtopics([]);
      teacherExamService.getSubtopics(topicId).then(data => {
        if (isMountedRef.current) setSubtopics(data);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  const validate = (): string | null => {
    if (!subjectId) return t('teacherQuestions.errors.noSubject');
    if (!questionText.trim()) return t('teacherQuestions.errors.noQuestionText');
    if (questionType === 'mcq') {
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim() || !optionE.trim())
        return t('teacherQuestions.errors.allOptions');
      if (!correctAnswer) return t('teacherQuestions.errors.noCorrectAnswer');
    } else {
      if (!correctAnswer.trim()) return t('teacherQuestions.errors.noCorrectAnswer');
    }
    return null;
  };

  const handleSave = async (andAddAnother: boolean) => {
    const err = validate();
    if (err) {
      AlertService.alert(t('common.alert'), err);
      return;
    }

    // Use cached teacherId; fall back to fresh fetch if not yet resolved
    let tid = teacherIdRef.current;
    if (!tid) {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (!teacher) return;
      tid = teacher.id;
      teacherIdRef.current = tid;
    }

    setSaving(true);
    const questionData: CreateTeacherQuestionData = {
      subject_id: subjectId,
      topic_id: topicId || undefined,
      subtopic_id: subtopicId || undefined,
      question_type: questionType,
      question_text: questionText.trim(),
      correct_answer: correctAnswer,
      explanation: explanation.trim() || undefined,
      difficulty: DIFFICULTY_TO_NUM[difficulty],
      ...(questionType === 'mcq' && {
        option_a: optionA.trim(),
        option_b: optionB.trim(),
        option_c: optionC.trim(),
        option_d: optionD.trim(),
        option_e: optionE.trim(),
      }),
    };

    let success: boolean;
    if (isEditMode && questionId) {
      // Security: updateQuestion enforces .eq('teacher_id', teacherId) — owner-only update
      success = await teacherExamService.updateQuestion(tid, questionId, questionData);
    } else {
      const id = await teacherExamService.createQuestion(tid, questionData);
      success = !!id;
    }
    setSaving(false);

    if (!success) {
      AlertService.alert(t('common.error'), t('teacherQuestions.saveFailed'));
      return;
    }

    if (isEditMode) {
      // In edit mode, always go back after saving
      navigation.goBack();
    } else {
      setSavedCount(c => c + 1);
      if (andAddAnother) {
        setQuestionText('');
        setOptionA(''); setOptionB(''); setOptionC(''); setOptionD(''); setOptionE('');
        setCorrectAnswer('');
        setExplanation('');
      } else {
        navigation.goBack();
      }
    }
  };

  if (loadingRefs) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditMode
              ? t('teacherQuestions.editTitle', { defaultValue: 'Edit Question' })
              : t('teacherQuestions.addTitle')}
          </Text>
          {!isEditMode && savedCount > 0 && (
            <View style={[styles.savedBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.savedBadgeText}>{savedCount} {t('teacherQuestions.saved')}</Text>
            </View>
          )}
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Subject picker */}
          <Text style={styles.label}>{t('teacherQuestions.subject')} *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowContent}>
            {subjects.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, subjectId === s.id && styles.chipActive]}
                onPress={() => setSubjectId(s.id)}
              >
                <Text style={[styles.chipText, subjectId === s.id && styles.chipTextActive]}>
                  {s.name_az}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Topic picker (optional) */}
          {topics.length > 0 && (
            <>
              <Text style={styles.label}>{t('teacherQuestions.topic')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowContent}>
                <TouchableOpacity
                  style={[styles.chip, !topicId && styles.chipActive]}
                  onPress={() => setTopicId('')}
                >
                  <Text style={[styles.chipText, !topicId && styles.chipTextActive]}>
                    {t('teacherQuestions.noTopic')}
                  </Text>
                </TouchableOpacity>
                {topics.map(tp => (
                  <TouchableOpacity
                    key={tp.id}
                    style={[styles.chip, topicId === tp.id && styles.chipActive]}
                    onPress={() => setTopicId(tp.id)}
                  >
                    <Text style={[styles.chipText, topicId === tp.id && styles.chipTextActive]}>
                      {tp.topic_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Subtopic picker (optional) */}
          {subtopics.length > 0 && (
            <>
              <Text style={styles.label}>{t('teacherQuestions.subtopic')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowContent}>
                <TouchableOpacity
                  style={[styles.chip, !subtopicId && styles.chipActive]}
                  onPress={() => setSubtopicId('')}
                >
                  <Text style={[styles.chipText, !subtopicId && styles.chipTextActive]}>
                    {t('teacherQuestions.noSubtopic')}
                  </Text>
                </TouchableOpacity>
                {subtopics.map(st => (
                  <TouchableOpacity
                    key={st.id}
                    style={[styles.chip, subtopicId === st.id && styles.chipActive]}
                    onPress={() => setSubtopicId(st.id)}
                  >
                    <Text style={[styles.chipText, subtopicId === st.id && styles.chipTextActive]}>
                      {st.subtopic_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Question type */}
          <Text style={styles.label}>{t('teacherQuestions.questionType')} *</Text>
          <View style={styles.typeRow}>
            {(['mcq', 'short_answer'] as QuestionType[]).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, questionType === type && styles.typeButtonActive]}
                onPress={() => { setQuestionType(type); setCorrectAnswer(''); }}
              >
                <Text style={[styles.typeButtonText, questionType === type && styles.typeButtonTextActive]}>
                  {t(`teacherQuestions.types.${type}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Question text */}
          <Text style={styles.label}>{t('teacherQuestions.questionText')} *</Text>
          <TextInput
            style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
            value={questionText}
            onChangeText={setQuestionText}
            placeholder={t('teacherQuestions.questionTextPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            maxLength={3000}
          />

          {/* MCQ options — 5 variants (A–E) */}
          {questionType === 'mcq' && (
            <>
              <Text style={styles.label}>{t('teacherQuestions.options')} *</Text>
              {[
                { key: 'A', value: optionA, set: setOptionA },
                { key: 'B', value: optionB, set: setOptionB },
                { key: 'C', value: optionC, set: setOptionC },
                { key: 'D', value: optionD, set: setOptionD },
                { key: 'E', value: optionE, set: setOptionE },
              ].map(({ key, value, set }) => (
                <View key={key} style={styles.optionRow}>
                  <View style={[styles.optionLabel, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.optionLabelText, { color: colors.primary }]}>{key}</Text>
                  </View>
                  <TextInput
                    style={[styles.optionInput, { color: colors.text, borderColor: colors.border }]}
                    value={value}
                    onChangeText={set}
                    placeholder={`${t('teacherQuestions.option')} ${key}`}
                    placeholderTextColor={colors.textSecondary}
                    maxLength={500}
                  />
                </View>
              ))}

              <Text style={styles.label}>{t('teacherQuestions.correctAnswer')} *</Text>
              <View style={styles.answerRow}>
                {MCQ_ANSWERS.map(ans => (
                  <TouchableOpacity
                    key={ans}
                    style={[
                      styles.answerButton,
                      correctAnswer === ans && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setCorrectAnswer(ans)}
                  >
                    <Text style={[
                      styles.answerButtonText,
                      { color: correctAnswer === ans ? '#fff' : colors.text },
                    ]}>
                      {ans}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Short answer (Açıq tipli) — correct answer field */}
          {questionType === 'short_answer' && (
            <>
              <Text style={styles.label}>{t('teacherQuestions.correctAnswer')} *</Text>
              <TextInput
                style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
                value={correctAnswer}
                onChangeText={setCorrectAnswer}
                placeholder={t('teacherQuestions.correctAnswerPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                maxLength={1000}
              />
            </>
          )}

          {/* Explanation (optional) */}
          <Text style={styles.label}>{t('teacherQuestions.explanation')}</Text>
          <View
            ref={explanationRef}
            onLayout={() => {}}
          >
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
              value={explanation}
              onChangeText={setExplanation}
              placeholder={t('teacherQuestions.explanationPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              maxLength={2000}
              onFocus={() => {
                explanationRef.current?.measureInWindow((_x, y) => {
                  scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
                });
              }}
            />
          </View>

          {/* Difficulty — 3 levels */}
          <Text style={styles.label}>{t('teacherQuestions.difficulty')}</Text>
          <View style={styles.difficultyRow}>
            {DIFFICULTIES.map(({ value, labelKey }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.difficultyButton,
                  difficulty === value && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setDifficulty(value)}
              >
                <Text style={[
                  styles.difficultyText,
                  { color: difficulty === value ? '#fff' : colors.text },
                ]}>
                  {t(labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Save buttons */}
          <View style={styles.saveRow}>
            {!isEditMode && (
              <TouchableOpacity
                style={[styles.saveButton, styles.saveAnotherButton, { borderColor: colors.primary }]}
                onPress={() => handleSave(true)}
                disabled={saving}
              >
                <Text style={[styles.saveAnotherText, { color: colors.primary }]}>
                  {t('teacherQuestions.saveAndAddAnother')}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>
                  {isEditMode
                    ? t('teacherQuestions.update', { defaultValue: 'Update' })
                    : t('teacherQuestions.save')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    savedBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.sm,
    },
    savedBadgeText: { color: '#fff', fontSize: typography.fontSizes.xs, fontWeight: '600' },
    form: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    label: {
      fontSize: typography.fontSizes.sm,
      fontWeight: '600',
      color: colors.text,
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    chipRowContent: {
      flexDirection: 'row',
      paddingBottom: spacing.xs,
      paddingRight: spacing.xl, // ensures last chip fully visible
    },
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginRight: spacing.xs,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.fontSizes.sm, color: colors.text },
    chipTextActive: { color: '#fff' },
    typeRow: { flexDirection: 'row', gap: spacing.sm },
    typeButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    typeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeButtonText: { fontSize: typography.fontSizes.sm, color: colors.text },
    typeButtonTextActive: { color: '#fff', fontWeight: '600' },
    textArea: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: typography.fontSizes.sm,
      textAlignVertical: 'top',
      minHeight: 80,
      backgroundColor: colors.surface,
    },
    optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    optionLabel: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionLabelText: { fontSize: typography.fontSizes.sm, fontWeight: '700' },
    optionInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typography.fontSizes.sm,
      backgroundColor: colors.surface,
    },
    answerRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    answerButton: {
      width: 52,
      height: 52,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    answerButtonText: { fontSize: typography.fontSizes.md, fontWeight: '700' },
    difficultyRow: { flexDirection: 'row', gap: spacing.sm },
    difficultyButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    difficultyText: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
    saveRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    saveButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveAnotherButton: {
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    saveText: { color: '#fff', fontSize: typography.fontSizes.md, fontWeight: '700' },
    saveAnotherText: { fontSize: typography.fontSizes.sm, fontWeight: '600' },
  });
