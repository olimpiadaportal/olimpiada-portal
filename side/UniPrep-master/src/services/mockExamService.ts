import { supabase } from './supabase';
import {
  MockExam,
  MockExamWithStatus,
  ExamType,
  ExamGroup,
  ExamAttempt,
  ExamQuestion,
  ExamAnswer,
  ExamResult,
  SubjectPerformance,
  QuestionReview,
  GROUP_SCORING,
  getSubjectMaxPoints,
} from '../types/mockExam';
import { streakService } from './streakService';

const normalizeChoice = (value?: string | null): string =>
  (value || '').trim().toUpperCase();

const normalizeText = (value?: string | null): string =>
  (value || '').trim().toLowerCase();

const isAnswerCorrect = (answer: any, question: any): boolean => {
  const questionType = question?.question_type || 'mcq';

  if (questionType === 'mcq') {
    return normalizeChoice(answer?.selected_answer) === normalizeChoice(question?.correct_answer);
  }

  if (questionType === 'codable_open') {
    return !!answer?.text_answer
      && !!question?.correct_answer
      && normalizeText(answer.text_answer) === normalizeText(question.correct_answer);
  }

  if (questionType === 'written_open') {
    if (answer?.text_answer && question?.expected_answer) {
      if (normalizeText(answer.text_answer) === normalizeText(question.expected_answer)) {
        return true;
      }
    }

    if (answer?.ai_score !== null && answer?.ai_score !== undefined && answer.ai_score >= 70) {
      return true;
    }

    if (answer?.final_score !== null && answer?.final_score !== undefined) {
      return answer.final_score >= 70;
    }
  }

  return false;
};

class MockExamService {
  // Get all mock exams with user's attempt status
  async getMockExams(
    userId: string,
    examType?: ExamType,
    targetGroup?: ExamGroup,
    isOfficial?: boolean
  ): Promise<MockExamWithStatus[]> {
    try {
      let query = supabase
        .from('mock_exams')
        .select('*')
        .order('created_at', { ascending: false });

      if (examType) {
        query = query.eq('exam_type', examType);
      }

      if (targetGroup) {
        query = query.eq('target_group', targetGroup);
      }

      if (isOfficial !== undefined) {
        query = query.eq('is_official', isOfficial);
      }

      const { data: exams, error } = await query;

      if (error) throw error;

      // Get user's attempts for these exams
      const examIds = (exams || []).map((e: any) => e.id);
      const { data: attempts } = await supabase
        .from('mock_exam_attempts')
        .select('*')
        .eq('user_id', userId)
        .in('mock_exam_id', examIds);

      // Combine exam data with attempt status
      return (exams || []).map((exam: any) => {
        const examAttempts = (attempts || []).filter(
          (a: any) => a.mock_exam_id === exam.id
        );

        const completedAttempts = examAttempts.filter(
          (a: any) => a.status === 'completed'
        );

        const inProgressAttempt = examAttempts.find(
          (a: any) => a.status === 'in_progress'
        );

        const bestScore = completedAttempts.length > 0
          ? Math.max(...completedAttempts.map((a: any) => a.total_score || 0))
          : undefined;

        const lastAttempt = examAttempts.length > 0
          ? examAttempts.sort(
              (a: any, b: any) =>
                new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
            )[0]
          : undefined;

        return {
          ...exam,
          attempt_count: completedAttempts.length,
          best_score: bestScore,
          last_attempt_date: lastAttempt?.started_at,
          current_attempt_id: inProgressAttempt?.id,
          current_attempt_status: inProgressAttempt?.status,
        };
      });
    } catch (error) {
      console.error('Get mock exams error:', error);
      return [];
    }
  }

  // Get single mock exam details
  async getMockExamDetails(examId: string, userId: string): Promise<MockExamWithStatus | null> {
    try {
      const { data: exam, error } = await supabase
        .from('mock_exams')
        .select('*')
        .eq('id', examId)
        .single();

      if (error) throw error;

      // Get user's attempts
      const { data: attempts } = await supabase
        .from('mock_exam_attempts')
        .select('*')
        .eq('user_id', userId)
        .eq('mock_exam_id', examId);

      const completedAttempts = (attempts || []).filter(
        (a: any) => a.status === 'completed'
      );

      const inProgressAttempt = (attempts || []).find(
        (a: any) => a.status === 'in_progress'
      );

      const bestScore = completedAttempts.length > 0
        ? Math.max(...completedAttempts.map((a: any) => a.total_score || 0))
        : undefined;

      const lastAttempt = (attempts || []).length > 0
        ? (attempts || []).sort(
            (a: any, b: any) =>
              new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )[0]
        : undefined;

      return {
        ...exam,
        attempt_count: completedAttempts.length,
        best_score: bestScore,
        last_attempt_date: lastAttempt?.started_at,
        current_attempt_id: inProgressAttempt?.id,
        current_attempt_status: inProgressAttempt?.status,
      };
    } catch (error) {
      console.error('Get mock exam details error:', error);
      return null;
    }
  }

  // Start new exam attempt
  async startExamAttempt(
    userId: string,
    mockExamId: string,
    durationMinutes: number,
    questionIds: string[] = []
  ): Promise<string | null> {
    try {
      // No resume feature - always create new attempt
      // First, delete any existing in-progress attempts for this exam
      await supabase
        .from('mock_exam_attempts')
        .delete()
        .eq('user_id', userId)
        .eq('mock_exam_id', mockExamId)
        .eq('status', 'in_progress');

      // Create new attempt
      const { data, error } = await supabase
        .from('mock_exam_attempts')
        .insert({
          user_id: userId,
          mock_exam_id: mockExamId,
          status: 'in_progress',
          time_remaining_seconds: durationMinutes * 60,
          started_at: new Date().toISOString(),
          question_ids: questionIds,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data?.id || null;
    } catch (error) {
      console.error('Start exam attempt error:', error);
      return null;
    }
  }

  // Get exam questions (supports both official and teacher exams)
  async getExamQuestions(mockExamId: string): Promise<ExamQuestion[]> {
    try {
      // Check if this is a teacher exam (uses_teacher_questions = true)
      const { data: examMeta } = await supabase
        .from('mock_exams')
        .select('uses_teacher_questions')
        .eq('id', mockExamId)
        .single();

      if (examMeta?.uses_teacher_questions) {
        return this.getTeacherExamQuestions(mockExamId);
      }

      const { data, error } = await supabase
        .from('mock_exam_questions')
        .select(`
          question_order,
          questions (
            id,
            subject_id,
            question_type,
            question_text,
            question_image_url,
            option_a,
            option_b,
            option_c,
            option_d,
            option_e,
            correct_answer,
            expected_answer,
            max_points,
            difficulty,
            group_id,
            group_order,
            subjects (name_en),
            question_groups (context_text, context_image_url)
          )
        `)
        .eq('mock_exam_id', mockExamId)
        .order('question_order');

      if (error) throw error;

      return (data || []).map((item: any) => ({
        ...item.questions,
        // Default to 'mcq' if question_type is not set (backward compatibility)
        question_type: item.questions.question_type || 'mcq',
        subject_name: item.questions.subjects?.name_en || '',
        question_order: item.question_order,
        // Get context from question_groups if available
        context_text: item.questions.question_groups?.context_text || null,
        context_image_url: item.questions.question_groups?.context_image_url || item.questions.question_image_url,
      }));
    } catch (error) {
      console.error('Get exam questions error:', error);
      return [];
    }
  }

  // Fetch questions for a teacher exam via SECURITY DEFINER RPC
  private async getTeacherExamQuestions(mockExamId: string): Promise<ExamQuestion[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_teacher_exam_questions', { p_exam_id: mockExamId });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.question_id || item.teacher_question_id,
        subject_id: item.subject_id || '',
        subject_name: item.subject_name || '',
        question_type: item.question_type || 'mcq',
        question_text: item.question_text,
        option_a: item.option_a,
        option_b: item.option_b,
        option_c: item.option_c,
        option_d: item.option_d,
        option_e: item.option_e ?? undefined,
        correct_answer: item.correct_answer,
        explanation: item.explanation,
        question_image_url: item.image_url,
        difficulty: 'medium' as const,
        question_order: item.question_order,
        teacher_name: item.teacher_name,
        // No group context for teacher questions
        context_text: undefined,
        context_image_url: undefined,
      }));
    } catch (error) {
      console.error('Get teacher exam questions error:', error);
      return [];
    }
  }

  // Get approved teacher exams for a specific teacher
  async getTeacherApprovedExams(teacherId: string, userId: string): Promise<MockExamWithStatus[]> {
    try {
      const { data: exams, error } = await supabase
        .from('mock_exams')
        .select('*')
        .eq('created_by_teacher', teacherId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const examIds = (exams || []).map((e: any) => e.id);
      const { data: attempts } = examIds.length > 0
        ? await supabase
            .from('mock_exam_attempts')
            .select('*')
            .eq('user_id', userId)
            .in('mock_exam_id', examIds)
        : { data: [] };

      return (exams || []).map((exam: any) => {
        const examAttempts = (attempts || []).filter((a: any) => a.mock_exam_id === exam.id);
        const completedAttempts = examAttempts.filter((a: any) => a.status === 'completed');
        const bestScore = completedAttempts.length > 0
          ? Math.max(...completedAttempts.map((a: any) => a.total_score || 0))
          : undefined;
        const lastAttempt = examAttempts.sort(
          (a: any, b: any) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        )[0];
        return {
          ...exam,
          attempt_count: completedAttempts.length,
          best_score: bestScore,
          last_attempt_date: lastAttempt?.started_at,
          current_attempt_id: examAttempts.find((a: any) => a.status === 'in_progress')?.id,
          current_attempt_status: examAttempts.find((a: any) => a.status === 'in_progress') ? 'in_progress' : undefined,
        } as MockExamWithStatus;
      });
    } catch (error) {
      console.error('Get teacher approved exams error:', error);
      return [];
    }
  }

  // Get exam attempt with answers
  async getExamAttempt(attemptId: string): Promise<ExamAttempt | null> {
    try {
      const { data: attempt, error: attemptError } = await supabase
        .from('mock_exam_attempts')
        .select('*')
        .eq('id', attemptId)
        .single();

      if (attemptError) throw attemptError;

      // Get answers
      const { data: answers } = await supabase
        .from('exam_answers')
        .select('*')
        .eq('attempt_id', attemptId);

      const answersMap = new Map<string, ExamAnswer>();
      (answers || []).forEach((answer: any) => {
        answersMap.set(answer.question_id, {
          question_id: answer.question_id,
          selected_answer: answer.selected_answer,
          text_answer: answer.text_answer, // For codable_open and written_open
          image_url: answer.image_url, // For written_open image uploads
          is_marked: answer.is_marked,
          time_spent_seconds: answer.time_spent_seconds,
        });
      });

      return {
        ...attempt,
        answers: answersMap,
      };
    } catch (error) {
      console.error('Get exam attempt error:', error);
      return null;
    }
  }

  // Save/update answer (for MCQ)
  async saveAnswer(
    attemptId: string,
    questionId: string,
    selectedAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | null,
    isMarked: boolean = false,
    timeSpentSeconds: number = 0
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('exam_answers')
        .upsert(
          {
            attempt_id: attemptId,
            question_id: questionId,
            selected_answer: selectedAnswer,
            is_marked: isMarked,
            time_spent_seconds: timeSpentSeconds,
            answered_at: new Date().toISOString(),
          },
          {
            onConflict: 'attempt_id,question_id',
          }
        );

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Save answer error:', error);
      return false;
    }
  }

  // Save/update text answer (for codable_open and written_open)
  async saveTextAnswer(
    attemptId: string,
    questionId: string,
    textAnswer: string,
    isMarked: boolean = false,
    timeSpentSeconds: number = 0,
    imageUrl?: string
  ): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {
        attempt_id: attemptId,
        question_id: questionId,
        text_answer: textAnswer,
        is_marked: isMarked,
        time_spent_seconds: timeSpentSeconds,
        answered_at: new Date().toISOString(),
      };
      
      // Only include image_url if provided
      if (imageUrl !== undefined) {
        updateData.image_url = imageUrl;
      }

      const { error } = await supabase
        .from('exam_answers')
        .upsert(updateData, {
          onConflict: 'attempt_id,question_id',
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Save text answer error:', error);
      return false;
    }
  }

  // Update time remaining
  async updateTimeRemaining(attemptId: string, timeRemainingSeconds: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('mock_exam_attempts')
        .update({ time_remaining_seconds: timeRemainingSeconds })
        .eq('id', attemptId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Update time remaining error:', error);
      return false;
    }
  }

  // Grade open questions using AI (Supabase Edge Function)
  async gradeOpenQuestions(attemptId: string, openAnswers: {
    answer_id: string;
    question_id: string;
    text_answer: string;
    image_url?: string;
  }[]): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      if (openAnswers.length === 0) {
        return { success: true, results: [] };
      }

      console.log(`🤖 [gradeOpenQuestions] Grading ${openAnswers.length} open questions...`);

      const { data, error } = await supabase.functions.invoke('grade-open-questions', {
        body: {
          attempt_id: attemptId,
          answers: openAnswers,
        },
      });

      if (error) {
        console.error('❌ [gradeOpenQuestions] Edge function error:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ [gradeOpenQuestions] Grading complete:`, data);
      return { success: true, results: data?.results || [] };
    } catch (error: any) {
      console.error('❌ [gradeOpenQuestions] Error:', error);
      return { success: false, error: error.message };
    }
  }

  // Recalculate scores after AI grading completes
  async recalculateScoresAfterAIGrading(attemptId: string): Promise<boolean> {
    try {
      console.log('🔄 [recalculateScores] Recalculating scores after AI grading...');
      
      // Get all answers and load question metadata separately. This mirrors
      // submitExam/review and avoids relying on an exam_answers -> questions
      // embed that may be unavailable in the live schema.
      const { data: answers, error: answersError } = await supabase
        .from('exam_answers')
        .select('*')
        .eq('attempt_id', attemptId);

      if (answersError) throw answersError;

      const questionIds = [...new Set((answers || []).map((a: any) => a.question_id).filter(Boolean))];
      const { data: questions, error: questionsError } = questionIds.length > 0
        ? await supabase
            .from('questions')
            .select('id, subject_id, question_type, correct_answer, expected_answer, max_points')
            .in('id', questionIds)
        : { data: [], error: null };

      if (questionsError) throw questionsError;

      const questionById = new Map<string, any>(
        (questions || []).map((question: any) => [String(question.id), question])
      );

      // Get subject scores to update
      const { data: subjectScores, error: scoresError } = await supabase
        .from('exam_subject_scores')
        .select('*')
        .eq('attempt_id', attemptId);

      if (scoresError) throw scoresError;

      // Recalculate correct answers per subject
      const subjectCorrectCounts = new Map<string, number>();
      
      console.log(`  📋 [recalculate] Processing ${(answers || []).length} answers...`);
      
      (answers || []).forEach((answer: any, index: number) => {
        const question = questionById.get(String(answer.question_id));
        if (!question?.subject_id) {
          console.warn(`  ${index + 1}. [recalculate] Question metadata missing for ${answer.question_id}`);
          return;
        }

        const subjectId = question.subject_id;
        const questionType = question.question_type || 'mcq';
        let isCorrect = isAnswerCorrect(answer, question);
        
        if (questionType === 'mcq') {
          isCorrect = answer.selected_answer === question.correct_answer;
          console.log(`  ${index + 1}. [MCQ] Question ${answer.question_id}: ${isCorrect ? '✅' : '❌'} (subject: ${subjectId})`);
        } else if (questionType === 'codable_open') {
          // Codable_open: exact match against correct_answer
          console.log(`  🔍 [recalculate][codable_open] Question ${answer.question_id}:`, {
            hasTextAnswer: !!answer.text_answer,
            textAnswer: answer.text_answer,
            hasCorrectAnswer: !!question.correct_answer,
            correctAnswer: question.correct_answer,
          });
          
          if (answer.text_answer && question.correct_answer) {
            const studentAnswer = answer.text_answer.trim().toLowerCase();
            const correctAnswer = question.correct_answer.trim().toLowerCase();
            isCorrect = studentAnswer === correctAnswer;
            console.log(`  ✅ [recalculate][codable_open] Comparison:`, {
              studentAnswer,
              correctAnswer,
              isCorrect,
            });
          } else {
            console.log(`  ⚠️ [recalculate][codable_open] Missing data`);
          }
          console.log(`  ${index + 1}. [CODABLE] Question ${answer.question_id}: ${isCorrect ? '✅' : '❌'} (subject: ${subjectId})`);
        } else if (questionType === 'written_open') {
          // Written_open: use final_score from AI grading
          if (answer.final_score !== null && answer.final_score !== undefined) {
            isCorrect = answer.final_score > 0;
          }
          console.log(`  ${index + 1}. [WRITTEN] Question ${answer.question_id}: ${isCorrect ? '✅' : '❌'} (subject: ${subjectId}, score: ${answer.final_score})`);
        }
        
        if (isCorrect) {
          const current = subjectCorrectCounts.get(subjectId) || 0;
          subjectCorrectCounts.set(subjectId, current + 1);
          console.log(`    ➕ Added to subject ${subjectId}: now ${current + 1} correct`);
        }
      });
      
      console.log(`  📊 [recalculate] Final subject counts:`, Array.from(subjectCorrectCounts.entries()));

      // Update each subject score
      let totalScore = 0;
      for (const score of (subjectScores || [])) {
        const correctAnswers = subjectCorrectCounts.get(score.subject_id) || 0;
        const scorePercentage = score.total_questions > 0
          ? correctAnswers / score.total_questions
          : 0;
        const weightedScore = scorePercentage * score.max_possible;
        const percentage = scorePercentage * 100;

        console.log(`  📊 [recalculate] Updating subject ${score.subject_id} (row id: ${score.id}):`, {
          oldCorrectAnswers: score.correct_answers,
          newCorrectAnswers: correctAnswers,
          totalQuestions: score.total_questions,
          oldPercentage: score.percentage,
          newPercentage: percentage,
          oldWeightedScore: score.weighted_score,
          newWeightedScore: weightedScore,
        });

        const { data: updateData, error: updateError } = await supabase
          .from('exam_subject_scores')
          .update({
            correct_answers: correctAnswers,
            raw_score: correctAnswers * 10,
            weighted_score: weightedScore,
            percentage: percentage,
          })
          .eq('id', score.id)
          .select();

        if (updateError) {
          console.error(`  ❌ [recalculate] Failed to update subject ${score.subject_id}:`, updateError);
        } else {
          console.log(`  ✅ [recalculate] Subject ${score.subject_id} updated successfully. Returned data:`, JSON.stringify(updateData));
        }

        totalScore += weightedScore;
      }

      // Get max possible score from attempt
      const { data: attempt } = await supabase
        .from('mock_exam_attempts')
        .select('mock_exams(exam_type)')
        .eq('id', attemptId)
        .single();

      const examType = (attempt as any)?.mock_exams?.exam_type || 'first_stage';
      let maxPossibleScore = 300;
      if (examType === 'second_stage') maxPossibleScore = 400;
      else if (examType === 'full_exam') maxPossibleScore = 700;

      const percentage = (totalScore / maxPossibleScore) * 100;

      // Update attempt with new scores
      await supabase
        .from('mock_exam_attempts')
        .update({
          total_score: totalScore,
          percentage: percentage,
        })
        .eq('id', attemptId);

      console.log('✅ [recalculateScores] Scores recalculated:', { totalScore, percentage });
      
      // VERIFICATION: Re-fetch the data to confirm it was written correctly
      const { data: verifyScores } = await supabase
        .from('exam_subject_scores')
        .select('*, subjects(name_en)')
        .eq('attempt_id', attemptId);
      
      console.log('🔍 [recalculateScores] VERIFICATION - Data in DB after update:', JSON.stringify(verifyScores?.map((s: any) => ({
        subject: s.subjects?.name_en,
        correct_answers: s.correct_answers,
        total_questions: s.total_questions,
        percentage: s.percentage,
      }))));
      
      return true;
    } catch (error) {
      console.error('❌ [recalculateScores] Error:', error);
      return false;
    }
  }

  // Get question counts by type for grading screen — queries the exam itself,
  // not exam_answers, so counts are always accurate regardless of answer state.
  async getQuestionCountsByType(attemptId: string): Promise<{
    mcq: number;
    codable: number;
    written: number;
  }> {
    try {
      // Step 1: get mock_exam_id from attempt (separate query — avoids PostgREST
      // embedding RLS issues that silently return null for the joined mock_exams row)
      const { data: attempt } = await supabase
        .from('mock_exam_attempts')
        .select('mock_exam_id')
        .eq('id', attemptId)
        .single();

      if (!attempt) return { mcq: 0, codable: 0, written: 0 };

      // Step 2: fetch exam flags separately for the same reason
      const { data: exam } = await supabase
        .from('mock_exams')
        .select('uses_teacher_questions')
        .eq('id', attempt.mock_exam_id)
        .single();

      const isTeacherExam = exam?.uses_teacher_questions === true;
      let mcq = 0, codable = 0, written = 0;

      if (isTeacherExam) {
        // Use SECURITY DEFINER RPC — bypasses RLS on teacher_questions and questions tables.
        // Returns question_type for every question in the exam (both Elmly and teacher-owned).
        const { data: teqRows } = await supabase
          .rpc('get_teacher_exam_questions', { p_exam_id: attempt.mock_exam_id });

        (teqRows || []).forEach((item: any) => {
          const type: string = item.question_type || 'mcq';
          if (type === 'mcq') mcq++;
          else if (type === 'codable_open') codable++;
          else if (type === 'written_open') written++;
          else mcq++; // 'short_answer' (teacher question type) → counts as mcq
        });
      } else {
        // Official Elmly exams: questions in mock_exam_questions
        const { data: examQuestions } = await supabase
          .from('mock_exam_questions')
          .select('questions(question_type)')
          .eq('mock_exam_id', attempt.mock_exam_id);

        (examQuestions || []).forEach((item: any) => {
          const type: string = item.questions?.question_type || 'mcq';
          if (type === 'mcq') mcq++;
          else if (type === 'codable_open') codable++;
          else if (type === 'written_open') written++;
        });
      }

      return { mcq, codable, written };
    } catch (error) {
      console.error('Get question counts error:', error);
      return { mcq: 0, codable: 0, written: 0 };
    }
  }

  // Submit exam and calculate score
  async submitExam(attemptId: string): Promise<ExamResult | null> {
    try {
      console.log('📝 [submitExam] Starting for attemptId:', attemptId);
      
      // Get attempt details
      const { data: attempt, error: attemptError } = await supabase
        .from('mock_exam_attempts')
        .select('*, mock_exams(*)')
        .eq('id', attemptId)
        .single();

      if (attemptError) {
        console.error('❌ [submitExam] Error fetching attempt:', attemptError);
        throw attemptError;
      }
      
      console.log('✅ [submitExam] Attempt fetched:', attempt?.id);

      const mockExam = attempt.mock_exams;
      const targetGroup = mockExam.target_group as ExamGroup;
      const examType = mockExam.exam_type as ExamType;
      const scoringConfig = GROUP_SCORING[targetGroup];

      if (!scoringConfig) {
        // Graceful fallback: equal-distribution scoring for null target_group / practice exams.
        console.log(`[submitExam] No GROUP_SCORING config for target_group="${targetGroup}" — using equal distribution.`);
        // scoringConfig stays undefined; getMaxPointsForSubject checks for this below.
      }

      // ── Teacher exam scoring path ──────────────────────────────────────────
      // Teacher exams (uses_teacher_questions=true) use teacher_exam_questions,
      // not mock_exam_questions. Individual type scores 1 pt per correct answer.
      if (mockExam.uses_teacher_questions) {
        // 1. Fetch questions via secure RPC (has subject_id, subject_name, correct_answer)
        const { data: teacherQRaw } = await supabase
          .rpc('get_teacher_exam_questions', { p_exam_id: mockExam.id });
        const teacherQs = (teacherQRaw || []) as any[];
        const totalQuestions = teacherQs.length || mockExam.total_questions || 0;

        // 2. Determine max possible score
        let maxScore: number;
        if (examType === 'individual') {
          maxScore = totalQuestions;
        } else if (examType === 'first_stage') {
          maxScore = 300;
        } else if (examType === 'second_stage') {
          maxScore = 400;
        } else {
          maxScore = totalQuestions;
        }

        // 3. Fetch answers (no FK join needed)
        const { data: rawAnswers } = await supabase
          .from('exam_answers')
          .select('question_id, selected_answer, text_answer, time_spent_seconds')
          .eq('attempt_id', attemptId);

        const answersMap = new Map<string, any>(
          (rawAnswers || []).map((a: any) => [String(a.question_id), a])
        );
        const answeredCount = (rawAnswers || []).filter((a: any) =>
          a.selected_answer || (a.text_answer && a.text_answer.trim() !== '')
        ).length;

        // 4. Build per-subject scoring map
        const subjectMap = new Map<string, SubjectPerformance>();
        const subjectIds = [...new Set(teacherQs.map((q: any) => q.subject_id).filter(Boolean))];
        const numSubjects = subjectIds.length || 1;

        subjectIds.forEach(sid => {
          const q = teacherQs.find((tq: any) => tq.subject_id === sid);
          let coefficient: 1.0 | 1.5 = 1.0;
          let maxPts: number;

          if (examType === 'individual') {
            maxPts = teacherQs.filter((tq: any) => tq.subject_id === sid).length;
          } else if (examType === 'second_stage' && scoringConfig) {
            const cfg = scoringConfig.subjects.find(s => s.name === q?.subject_name);
            coefficient = (cfg?.coefficient || 1.0) as 1.0 | 1.5;
            const totalCoeff = scoringConfig.subjects.reduce((sum, s) => sum + s.coefficient, 0);
            maxPts = Math.round((coefficient / totalCoeff) * maxScore);
          } else {
            maxPts = Math.round(maxScore / numSubjects);
          }

          subjectMap.set(sid, {
            subject_id: sid,
            subject_name: q?.subject_name || 'Unknown',
            coefficient,
            total_questions: 0,
            correct_answers: 0,
            raw_score: 0,
            weighted_score: 0,
            max_possible: maxPts,
            percentage: 0,
          });
        });

        // 5. Grade answers
        teacherQs.forEach((q: any) => {
          const perf = subjectMap.get(q.subject_id);
          if (!perf) return;
          perf.total_questions++;
          const answer = answersMap.get(String(q.question_id));
          if (!answer?.selected_answer) return;
          if (normalizeChoice(answer.selected_answer) === normalizeChoice(q.correct_answer)) {
            perf.correct_answers++;
          }
        });

        // 6. Calculate weighted scores
        const subjectPerformances: SubjectPerformance[] = [];
        subjectMap.forEach(perf => {
          const pct = perf.total_questions > 0 ? perf.correct_answers / perf.total_questions : 0;
          perf.weighted_score = examType === 'individual'
            ? perf.correct_answers
            : pct * perf.max_possible;
          perf.raw_score = perf.correct_answers * (examType === 'individual' ? 1 : 10);
          perf.percentage = pct * 100;
          subjectPerformances.push(perf);
        });

        const totalScore = subjectPerformances.reduce((sum, s) => sum + s.weighted_score, 0);
        const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
        const correctAnswers = subjectPerformances.reduce((sum, s) => sum + s.correct_answers, 0);

        // 7. Save subject scores
        for (const perf of subjectPerformances) {
          const row = {
            attempt_id: attemptId,
            subject_id: perf.subject_id,
            coefficient: perf.coefficient,
            total_questions: perf.total_questions,
            correct_answers: perf.correct_answers,
            raw_score: perf.raw_score,
            weighted_score: perf.weighted_score,
            max_possible: perf.max_possible,
            percentage: perf.percentage,
          };
          const { error: insErr } = await supabase.from('exam_subject_scores').insert(row);
          if (insErr) {
            await supabase.from('exam_subject_scores').update({
              coefficient: row.coefficient,
              total_questions: row.total_questions,
              correct_answers: row.correct_answers,
              raw_score: row.raw_score,
              weighted_score: row.weighted_score,
              max_possible: row.max_possible,
              percentage: row.percentage,
            }).eq('attempt_id', attemptId).eq('subject_id', perf.subject_id);
          }
        }

        // 8. Update attempt status + score
        await supabase.from('mock_exam_attempts').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          total_score: totalScore,
          percentage,
        }).eq('id', attemptId);

        // 9. Streak update (best-effort)
        try { await streakService.updateStreakRealtime('exam'); } catch {}

        const timeTaken = Math.floor(
          (new Date().getTime() - new Date(attempt.started_at).getTime()) / 1000 / 60
        );
        return {
          attempt_id: attemptId,
          mock_exam_id: mockExam.id,
          exam_title: mockExam.title,
          exam_type: examType,
          target_group: targetGroup,
          started_at: attempt.started_at,
          completed_at: new Date().toISOString(),
          duration_minutes: mockExam.duration_minutes,
          time_taken_minutes: timeTaken,
          total_questions: totalQuestions,
          answered_questions: answeredCount,
          correct_answers: correctAnswers,
          incorrect_answers: answeredCount - correctAnswers,
          unanswered_questions: totalQuestions - answeredCount,
          total_score: totalScore,
          max_possible_score: maxScore,
          percentage,
          subject_performances: subjectPerformances,
          strengths: subjectPerformances.filter(s => s.percentage >= 70).map(s => s.subject_name),
          weaknesses: subjectPerformances.filter(s => s.percentage < 50).map(s => s.subject_name),
          uses_teacher_questions: true,
        };
      }
      // ── End teacher exam scoring ────────────────────────────────────────────

      // Determine max possible score based on exam type
      // SCORING RULES (as per Nov 16, 2025 clarification):
      // - Groups I-IV: Can have 1st stage (300) OR 2nd stage (400) OR full exam (700)
      // - Group V: Only has 1st stage (300) exams
      // - 1st stage: 90 questions, 300 points max
      // - 2nd stage: 90 questions, 400 points max (weighted coefficients)
      // - Full exam: 125 questions (5 subjects × 25), 700 points max (1st+2nd combined)
      //   Note: Full exam is old Azerbaijan exam format, kept for potential future use
      let maxPossibleScore: number;
      if (examType === 'first_stage') {
        maxPossibleScore = 300;
      } else if (examType === 'second_stage') {
        maxPossibleScore = 400;
      } else if (examType === 'full_exam') {
        // Combined 1st + 2nd stages
        maxPossibleScore = 700;
      } else if (examType === 'individual') {
        // Individual: each correct answer = 1 point
        const { count } = await supabase
          .from('mock_exam_questions')
          .select('*', { count: 'exact', head: true })
          .eq('mock_exam_id', mockExam.id);
        maxPossibleScore = count ?? mockExam.total_questions ?? 0;
      } else {
        // Fallback
        maxPossibleScore = 300;
      }

      // Get all answers. Load question metadata separately below instead of
      // relying on a PostgREST exam_answers -> questions embed, which is not
      // guaranteed after the live FK/RLS hardening work.
      const { data: answers } = await supabase
        .from('exam_answers')
        .select('*')
        .eq('attempt_id', attemptId);

      // Get all exam questions
      const { data: examQuestions } = await supabase
        .from('mock_exam_questions')
        .select('question_id')
        .eq('mock_exam_id', mockExam.id);

      const totalQuestions = (examQuestions || []).length;

      const answeredQuestions = (answers || []).filter((a: any) =>
        a.selected_answer || (a.text_answer && a.text_answer.trim() !== '') || a.image_url
      ).length;

      // Calculate scores per subject
      const subjectScores = new Map<string, SubjectPerformance>();

      // Get all exam questions with subjects to ensure we have all subjects
      const { data: allExamQuestions } = await supabase
        .from('mock_exam_questions')
        .select(`
          question_order,
          questions (
            id,
            subject_id,
            question_type,
            correct_answer,
            expected_answer,
            max_points,
            subjects (name_en)
          )
        `)
        .eq('mock_exam_id', mockExam.id)
        .order('question_order');

      const questionById = new Map<string, any>();
      (allExamQuestions || []).forEach((item: any) => {
        if (item.questions?.id) {
          questionById.set(String(item.questions.id), item.questions);
        }
      });

      // Get unique subjects from the actual exam questions
      const uniqueSubjectsInExam = new Set<string>();
      (allExamQuestions || []).forEach((item: any) => {
        const subjectName = item.questions?.subjects?.name_en;
        if (subjectName) {
          uniqueSubjectsInExam.add(subjectName);
        }
      });
      const numSubjectsInExam = uniqueSubjectsInExam.size || 1;

      // Calculate subject max points based on exam type
      // First stage: equal distribution among ALL subjects in the exam (300 / num_subjects)
      // Second stage: weighted by coefficient from GROUP_SCORING (400 total)
      const getMaxPointsForSubject = (subjectName: string): number => {
        if (examType === 'first_stage' || !scoringConfig) {
          // First stage OR unconfigured exam: equal distribution among all subjects
          return numSubjectsInExam > 0 ? Math.round(maxPossibleScore / numSubjectsInExam) : maxPossibleScore;
        } else {
          // Second stage: use GROUP_SCORING coefficients
          const subjectConfig = scoringConfig.subjects.find(s => s.name === subjectName);
          if (!subjectConfig) {
            console.warn(`⚠️ Subject "${subjectName}" not found in GROUP_SCORING for Group ${targetGroup} Stage II`);
            return 0;
          }
          const totalCoefficient = scoringConfig.subjects.reduce((sum, s) => sum + s.coefficient, 0);
          return Math.round((subjectConfig.coefficient / totalCoefficient) * maxPossibleScore);
        }
      };

      // Initialize all subjects first
      (allExamQuestions || []).forEach((item: any) => {
        const question = item.questions;
        if (!question?.subject_id) return;

        const subjectId = question.subject_id;
        const subjectName = question.subjects?.name_en;

        if (!subjectScores.has(subjectId)) {
          const subjectConfig = scoringConfig?.subjects?.find(s => s.name === subjectName);
          // For first stage or unconfigured exams, use coefficient 1.0; for second stage, use actual coefficient
          const coefficient = (examType === 'first_stage' || !scoringConfig)
            ? 1.0 as 1.0 | 1.5
            : (subjectConfig?.coefficient || 1.0) as 1.0 | 1.5;
          const maxPoints = getMaxPointsForSubject(subjectName);

          subjectScores.set(subjectId, {
            subject_id: subjectId,
            subject_name: subjectName || 'Unknown',
            coefficient,
            total_questions: 0,
            correct_answers: 0,
            raw_score: 0,
            weighted_score: 0,
            max_possible: maxPoints,
            percentage: 0,
          });
        }
      });

      // Count questions per subject
      (allExamQuestions || []).forEach((item: any) => {
        const question = item.questions;
        if (!question?.subject_id) return;

        const subjectId = question.subject_id;
        const subjectScore = subjectScores.get(subjectId);
        if (subjectScore) {
          subjectScore.total_questions++;
        }
      });

      // Process answers
      (answers || []).forEach((answer: any) => {
        const question = questionById.get(String(answer.question_id));
        if (!question?.subject_id) return;

        const subjectId = question.subject_id;
        const isCorrect = isAnswerCorrect(answer, question);

        const subjectScore = subjectScores.get(subjectId);
        if (subjectScore && isCorrect) {
          subjectScore.correct_answers++;
        }
      });

      // Calculate scores and percentages
      const subjectPerformances: SubjectPerformance[] = [];
      subjectScores.forEach(score => {
        // Calculate points: (correct / total) * max_possible
        const scorePercentage = score.total_questions > 0
          ? score.correct_answers / score.total_questions
          : 0;
        
        score.weighted_score = scorePercentage * score.max_possible;
        score.raw_score = score.correct_answers * 10;
        score.percentage = scorePercentage * 100;
        
        subjectPerformances.push(score);
      });

      // Calculate total score
      const totalScore = subjectPerformances.reduce((sum, s) => sum + s.weighted_score, 0);
      const percentage = (totalScore / maxPossibleScore) * 100;

      // Identify strengths and weaknesses
      const strengths = subjectPerformances
        .filter(s => s.percentage >= 70)
        .map(s => s.subject_name);
      const weaknesses = subjectPerformances
        .filter(s => s.percentage < 50)
        .map(s => s.subject_name);

      // Save subject scores — use insert-or-update so re-submissions don't crash
      for (const score of subjectPerformances) {
        const { error: insertErr } = await supabase.from('exam_subject_scores').insert({
          attempt_id: attemptId,
          subject_id: score.subject_id,
          coefficient: score.coefficient,
          total_questions: score.total_questions,
          correct_answers: score.correct_answers,
          raw_score: score.raw_score,
          weighted_score: score.weighted_score,
          max_possible: score.max_possible,
          percentage: score.percentage,
        });
        if (insertErr) {
          // Duplicate on retry — overwrite with latest scores
          await supabase.from('exam_subject_scores')
            .update({
              coefficient: score.coefficient,
              total_questions: score.total_questions,
              correct_answers: score.correct_answers,
              raw_score: score.raw_score,
              weighted_score: score.weighted_score,
              max_possible: score.max_possible,
              percentage: score.percentage,
            })
            .eq('attempt_id', attemptId)
            .eq('subject_id', score.subject_id);
        }
      }

      // Update attempt
      console.log('📊 [submitExam] Updating attempt with score:', totalScore, 'percentage:', percentage);
      const { error: updateError } = await supabase
        .from('mock_exam_attempts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          total_score: totalScore,
          percentage: percentage,
        })
        .eq('id', attemptId);

      if (updateError) {
        console.error('❌ [submitExam] Error updating attempt:', updateError);
        throw updateError;
      }
      
      console.log('✅ [submitExam] Attempt updated successfully');

      const correctAnswers = subjectPerformances.reduce((sum, s) => sum + s.correct_answers, 0);
      const incorrectAnswers = answeredQuestions - correctAnswers;
      const unansweredQuestions = totalQuestions - answeredQuestions;

      const timeTaken = Math.floor(
        (new Date().getTime() - new Date(attempt.started_at).getTime()) / 1000 / 60
      );

      // ============================================
      // STAGE 10.2: Update Streak
      // (ELO is handled atomically by update_leaderboard_score_after_exam
      //  called in ExamResultsScreen — do NOT call scoringService here to
      //  avoid applying the ELO change twice.)
      // ============================================
      try {
        const streakUpdate = await streakService.updateStreakRealtime('exam');
        if (streakUpdate) {
          console.log('✅ Streak updated:', {
            newStreak: streakUpdate.newStreak,
            status: streakUpdate.status,
            message: streakUpdate.message,
          });
        }
      } catch (scoringError) {
        // Don't fail exam submission if streak update fails
        console.error('Error updating streak:', scoringError);
      }
      // ============================================

      return {
        attempt_id: attemptId,
        mock_exam_id: mockExam.id,
        exam_title: mockExam.title,
        exam_type: mockExam.exam_type,
        target_group: targetGroup,
        started_at: attempt.started_at,
        completed_at: new Date().toISOString(),
        duration_minutes: mockExam.duration_minutes,
        time_taken_minutes: timeTaken,
        total_questions: totalQuestions,
        answered_questions: answeredQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
        unanswered_questions: unansweredQuestions,
        total_score: totalScore,
        max_possible_score: maxPossibleScore,
        percentage: percentage,
        subject_performances: subjectPerformances,
        strengths,
        weaknesses,
      };
    } catch (error: any) {
      console.error('❌ [submitExam] Error:', error?.message || error);
      return null;
    }
  }

  // Get exam results
  async getExamResults(attemptId: string): Promise<ExamResult | null> {
    try {
      console.log('📊 [getExamResults] Fetching results for attempt:', attemptId);
      
      const { data: attempt, error: attemptError } = await supabase
        .from('mock_exam_attempts')
        .select('*, mock_exams(*)')
        .eq('id', attemptId)
        .single();

      if (attemptError) throw attemptError;

      // Force fresh data fetch by using a new query with no caching
      const { data: subjectScores } = await supabase
        .from('exam_subject_scores')
        .select('*, subjects(name_en)')
        .eq('attempt_id', attemptId)
        .order('created_at', { ascending: true }); // Force fresh query

      console.log('📊 [getExamResults] Subject scores from DB:', JSON.stringify(subjectScores?.map((s: any) => ({
        subject: s.subjects?.name_en,
        correct_answers: s.correct_answers,
        total_questions: s.total_questions,
        percentage: s.percentage,
      }))));

      const { data: answers } = await supabase
        .from('exam_answers')
        .select('*')
        .eq('attempt_id', attemptId);

      const { data: examQuestions } = await supabase
        .from('mock_exam_questions')
        .select('question_id')
        .eq('mock_exam_id', attempt.mock_exam_id);

      // For teacher exams, mock_exam_questions is empty — use stored total_questions instead
      const totalQuestions = attempt.mock_exams.uses_teacher_questions
        ? (attempt.mock_exams.total_questions || 0)
        : (examQuestions || []).length;
      // Count answered questions: MCQ with selected_answer OR open questions with text_answer/image_url
      const answeredQuestions = (answers || []).filter((a: any) => 
        a.selected_answer || (a.text_answer && a.text_answer.trim() !== '') || a.image_url
      ).length;
      const correctAnswers = (subjectScores || []).reduce(
        (sum: number, s: any) => sum + s.correct_answers,
        0
      );
      
      console.log('📊 [getExamResults] Calculated totals:', {
        totalQuestions,
        answeredQuestions,
        correctAnswers,
        incorrectAnswers: answeredQuestions - correctAnswers,
      });

      const subjectPerformances: SubjectPerformance[] = (subjectScores || []).map((s: any) => ({
        subject_id: s.subject_id,
        subject_name: s.subjects.name_en,
        coefficient: s.coefficient,
        total_questions: s.total_questions,
        correct_answers: s.correct_answers,
        raw_score: s.raw_score,
        weighted_score: s.weighted_score,
        max_possible: s.max_possible,
        percentage: s.percentage,
      }));

      const strengths = subjectPerformances
        .filter(s => s.percentage >= 70)
        .map(s => s.subject_name);
      const weaknesses = subjectPerformances
        .filter(s => s.percentage < 50)
        .map(s => s.subject_name);

      const timeTaken = Math.floor(
        (new Date(attempt.completed_at).getTime() - new Date(attempt.started_at).getTime()) /
          1000 /
          60
      );

      // Determine max possible score based on exam type
      const examType = attempt.mock_exams.exam_type as ExamType;
      let maxPossibleScore: number;
      if (examType === 'first_stage') {
        maxPossibleScore = 300;
      } else if (examType === 'second_stage') {
        maxPossibleScore = 400;
      } else if (examType === 'full_exam') {
        maxPossibleScore = 700;
      } else if (examType === 'individual') {
        maxPossibleScore = attempt.mock_exams.total_questions || totalQuestions;
      } else {
        maxPossibleScore = 300;
      }

      return {
        attempt_id: attemptId,
        mock_exam_id: attempt.mock_exam_id,
        exam_title: attempt.mock_exams.title,
        exam_type: attempt.mock_exams.exam_type,
        target_group: attempt.mock_exams.target_group,
        started_at: attempt.started_at,
        completed_at: attempt.completed_at,
        duration_minutes: attempt.mock_exams.duration_minutes,
        time_taken_minutes: timeTaken,
        total_questions: totalQuestions,
        answered_questions: answeredQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: answeredQuestions - correctAnswers,
        unanswered_questions: totalQuestions - answeredQuestions,
        total_score: attempt.total_score,
        max_possible_score: maxPossibleScore,
        percentage: attempt.percentage,
        subject_performances: subjectPerformances,
        strengths,
        weaknesses,
        uses_teacher_questions: attempt.mock_exams.uses_teacher_questions ?? false,
      };
    } catch (error) {
      console.error('Get exam results error:', error);
      return null;
    }
  }

  // Abandon exam attempt (when user exits without completing)
  async abandonExamAttempt(attemptId: string): Promise<boolean> {
    try {
      console.log('🗑️ Abandoning exam attempt:', attemptId);
      
      // Delete the in-progress attempt (CASCADE will delete related answers)
      const { error } = await supabase
        .from('mock_exam_attempts')
        .delete()
        .eq('id', attemptId);

      if (error) {
        console.error('❌ Delete error:', error);
        return false;
      }
      
      console.log('✅ Deleted attempt successfully');
      return true;
    } catch (error) {
      console.error('Abandon exam attempt error:', error);
      return false;
    }
  }

  // Get questions for review
  async getQuestionReviews(attemptId: string, filter?: 'all' | 'correct' | 'incorrect'): Promise<QuestionReview[]> {
    try {
      // 1. Get attempt + exam metadata (needed to detect teacher vs Elmly exam)
      const { data: attempt, error: attemptError } = await supabase
        .from('mock_exam_attempts')
        .select('question_ids, mock_exam_id, mock_exams(uses_teacher_questions)')
        .eq('id', attemptId)
        .single();

      if (attemptError) throw attemptError;

      const isTeacherExam = (attempt.mock_exams as any)?.uses_teacher_questions === true;
      const mockExamId = attempt.mock_exam_id;

      // 2. Fetch answers WITHOUT join (FK exam_answers→questions was dropped in hotfix 80)
      const { data: answers, error: answersError } = await supabase
        .from('exam_answers')
        .select('question_id, selected_answer, text_answer, image_url, ai_explanation, final_score, time_spent_seconds, is_marked')
        .eq('attempt_id', attemptId);

      if (answersError) throw answersError;

      // 3. Build question data map depending on exam type
      const questionMap = new Map<string, any>();
      let questionOrderList: string[] = [];

      if (isTeacherExam) {
        // Teacher exam: use get_teacher_exam_questions RPC (SECURITY DEFINER — bypasses RLS)
        const { data: teacherQs, error: tqError } = await supabase
          .rpc('get_teacher_exam_questions', { p_exam_id: mockExamId });

        if (tqError) throw tqError;

        (teacherQs || []).forEach((q: any) => {
          const key = String(q.question_id);
          questionMap.set(key, {
            id: q.question_id,
            subject_id: q.subject_id || '',
            question_type: q.question_type || 'mcq',
            question_text: q.question_text,
            question_image_url: undefined,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            option_e: q.option_e || undefined,
            correct_answer: q.correct_answer,
            expected_answer: null,
            grading_rubric: null,
            explanation: q.explanation,
            difficulty: q.difficulty,
            group_id: null,
            context_text: undefined,
            context_image_url: undefined,
            subject_name: q.subject_name || 'Unknown',
            question_order: q.question_order,
          });
        });

        // Use RPC ordering as the definitive question order
        questionOrderList = (teacherQs || [])
          .sort((a: any, b: any) => (a.question_order || 0) - (b.question_order || 0))
          .map((q: any) => String(q.question_id));
      } else {
        // Elmly exam: fetch from questions table by collected IDs
        const allIds = new Set<string>();
        (answers || []).forEach((a: any) => { if (a.question_id) allIds.add(String(a.question_id)); });
        (attempt.question_ids || []).forEach((id: string) => allIds.add(id));

        if (allIds.size > 0) {
          const { data: questions, error: qError } = await supabase
            .from('questions')
            .select(`
              id, subject_id, question_type, question_text, question_image_url,
              option_a, option_b, option_c, option_d, option_e, correct_answer,
              expected_answer, grading_rubric, explanation, difficulty, group_id,
              question_groups (context_text, context_image_url),
              subjects (name_en)
            `)
            .in('id', [...allIds]);

          if (qError) throw qError;

          (questions || []).forEach((q: any) => {
            questionMap.set(String(q.id), {
              ...q,
              context_text: (q.question_groups as any)?.context_text || undefined,
              context_image_url: (q.question_groups as any)?.context_image_url || undefined,
              subject_name: (q.subjects as { name_en?: string } | null)?.name_en || 'Unknown',
            });
          });
        }

        questionOrderList = (attempt.question_ids || []).map(String);
      }

      // 4. Build lookup maps
      const answersMap = new Map<string, any>();
      (answers || []).forEach((a: any) => answersMap.set(String(a.question_id), a));

      const questionOrderMap = new Map<string, number>();
      questionOrderList.forEach((qId, idx) => questionOrderMap.set(String(qId), idx + 1));

      // ── Helper: grade a single answer ──────────────────────────────────────
      const gradeAnswer = (questionType: string, answer: any, question: any): boolean | null => {
        if (questionType === 'written_open' && (answer.final_score === null || answer.final_score === undefined)) {
          return null;
        }

        return isAnswerCorrect(answer, question);
      };

      const isAnswered = (questionType: string, answer: any): boolean => {
        if (!answer) return false;
        if (questionType === 'mcq') return answer.selected_answer !== null && answer.selected_answer !== undefined;
        return !!(answer.text_answer && answer.text_answer.trim() !== '') || !!answer.image_url;
      };

      const getOrder = (questionId: string, question: any): number => {
        if (isTeacherExam) return question.question_order || 0;
        return questionOrderMap.get(String(questionId)) || 0;
      };

      // ── "all" filter: iterate all questions in order ────────────────────────
      if (filter === 'all') {
        const orderedIds = questionOrderList.length > 0 ? questionOrderList : [...questionMap.keys()];
        const reviews: QuestionReview[] = [];

        for (const rawId of orderedIds) {
          const questionId = String(rawId);
          const question = questionMap.get(questionId);
          if (!question) continue;

          const answer = answersMap.get(questionId);
          const questionType = question.question_type || 'mcq';
          const questionOrder = getOrder(questionId, question);
          const answered = isAnswered(questionType, answer);

          console.log(`🔍 [getQuestionReviews] Q${questionOrder}:`, {
            questionId, questionType,
            hasAnswer: !!answer, answered,
            selectedAnswer: answer?.selected_answer,
            finalScore: answer?.final_score,
          });

          if (answered) {
            reviews.push({
              question: { ...question, question_order: questionOrder },
              user_answer: answer.selected_answer,
              text_answer: answer.text_answer,
              image_url: answer.image_url,
              correct_answer: question.correct_answer,
              is_correct: gradeAnswer(questionType, answer, question),
              ai_explanation: answer.ai_explanation,
              time_spent_seconds: answer.time_spent_seconds || 0,
              was_marked: answer.is_marked || false,
              is_skipped: false,
            });
          } else {
            reviews.push({
              question: { ...question, question_order: questionOrder },
              user_answer: null,
              correct_answer: question.correct_answer,
              is_correct: null,
              time_spent_seconds: answer?.time_spent_seconds || 0,
              was_marked: answer?.is_marked || false,
              is_skipped: true,
            });
          }
        }

        return reviews;
      }

      // ── correct/incorrect filters: only answered questions ─────────────────
      let reviews: QuestionReview[] = (answers || [])
        .filter((answer: any) => {
          const question = questionMap.get(String(answer.question_id));
          const qType = question?.question_type || 'mcq';
          return isAnswered(qType, answer);
        })
        .map((answer: any): QuestionReview | null => {
          const question = questionMap.get(String(answer.question_id));
          if (!question) return null;

          const questionType = question.question_type || 'mcq';
          const questionOrder = getOrder(String(answer.question_id), question);

          return {
            question: { ...question, question_order: questionOrder },
            user_answer: answer.selected_answer,
            text_answer: answer.text_answer,
            image_url: answer.image_url,
            correct_answer: question.correct_answer,
            is_correct: gradeAnswer(questionType, answer, question),
            ai_explanation: answer.ai_explanation,
            time_spent_seconds: answer.time_spent_seconds,
            was_marked: answer.is_marked,
            is_skipped: false,
          };
        })
        .filter((r): r is QuestionReview => r !== null);

      if (filter === 'correct') {
        reviews = reviews.filter(r => r.is_correct === true);
      } else if (filter === 'incorrect') {
        reviews = reviews.filter(r => r.is_correct === false);
      }

      reviews.sort((a, b) => (a.question.question_order || 0) - (b.question.question_order || 0));
      return reviews;
    } catch (error) {
      console.error('Get question reviews error:', error);
      return [];
    }
  }
}

export const mockExamService = new MockExamService();
