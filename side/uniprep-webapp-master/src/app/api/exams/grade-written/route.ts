import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

const normalizeChoice = (value?: string | null): string =>
  (value || '').trim().toUpperCase()

const normalizeText = (value?: string | null): string =>
  (value || '').trim().toLowerCase()

const isAnswerCorrect = (answer: any, question: any): boolean => {
  const questionType = question?.question_type || 'mcq'

  if (questionType === 'mcq') {
    return normalizeChoice(answer?.selected_answer) === normalizeChoice(question?.correct_answer)
  }

  if (questionType === 'codable_open') {
    return !!answer?.text_answer
      && !!question?.correct_answer
      && normalizeText(answer.text_answer) === normalizeText(question.correct_answer)
  }

  if (questionType === 'written_open') {
    if (answer?.text_answer && question?.expected_answer) {
      if (normalizeText(answer.text_answer) === normalizeText(question.expected_answer)) {
        return true
      }
    }

    if (answer?.ai_score !== null && answer?.ai_score !== undefined && answer.ai_score >= 70) {
      return true
    }

    if (answer?.final_score !== null && answer?.final_score !== undefined) {
      return answer.final_score >= 70
    }
  }

  return false
}

async function updateLeaderboardAfterOfficialExam(supabase: any, userId: string, attemptId: string) {
  const { data: attempt } = await supabase
    .from('mock_exam_attempts')
    .select('mock_exams(uses_teacher_questions, is_official)')
    .eq('id', attemptId)
    .single()

  const exam = (attempt as any)?.mock_exams
  if (exam?.uses_teacher_questions === true || exam?.is_official === false) {
    return
  }

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('user_id', userId)
    .single()

  const studentId = (student as any)?.id
  if (!studentId) {
    return
  }

  const { error: leaderboardError } = await supabase.rpc('update_leaderboard_score_after_exam', {
    p_student_id: studentId,
    p_attempt_id: attemptId,
  })

  if (leaderboardError) {
    console.error('Leaderboard score update failed after written grading:', leaderboardError)
  }
}

// API endpoint to grade written_open questions using Supabase Edge Function
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { attemptId } = body

    if (!attemptId) {
      return NextResponse.json({ error: "Missing attemptId" }, { status: 400 })
    }

    // Ownership check — verify user owns this attempt
    const { data: attemptCheck } = await supabase
      .from('mock_exam_attempts')
      .select('id')
      .eq('id', attemptId)
      .eq('user_id', user.id)
      .single()

    if (!attemptCheck) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    console.log(`🤖 [grade-written] Starting AI grading for attempt: ${attemptId}`)

    // Get answers and question metadata separately. exam_answers.question_id no
    // longer has a direct FK to questions because teacher-question answers share
    // the same table, so PostgREST embedding is not reliable here.
    const { data: answers, error: fetchError } = await supabase
      .from('exam_answers')
      .select('id, question_id, text_answer, image_url')
      .eq('attempt_id', attemptId)

    if (fetchError) {
      console.error('❌ [grade-written] Error fetching answers:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const questionIds = [...new Set((answers || []).map((answer: any) => answer.question_id).filter(Boolean))]
    const { data: questions, error: questionsError } = questionIds.length > 0
      ? await supabase
          .from('questions')
          .select('id, question_type, question_text, expected_answer, answer_keywords, max_points, grading_rubric')
          .in('id', questionIds)
      : { data: [], error: null }

    if (questionsError) {
      console.error('❌ [grade-written] Error fetching questions:', questionsError)
      return NextResponse.json({ error: questionsError.message }, { status: 500 })
    }

    const questionById = new Map<string, any>(
      (questions || []).map((question: any) => [String(question.id), question])
    )

    // Filter only written_open questions
    const writtenAnswers = (answers || [])
      .filter((a: any) => questionById.get(String(a.question_id))?.question_type === 'written_open')
      .map((a: any) => ({
        answer_id: a.id,
        question_id: a.question_id,
        text_answer: a.text_answer || '',
        image_url: a.image_url,
      }))

    console.log(`📊 [grade-written] Found ${writtenAnswers.length} written_open answers to grade`)

    if (writtenAnswers.length === 0) {
      await updateLeaderboardAfterOfficialExam(supabase, user.id, attemptId)
      return NextResponse.json({ 
        success: true, 
        message: "No written_open questions to grade",
        results: [] 
      })
    }

    const hasWrittenContent = writtenAnswers.some((answer: any) =>
      (answer.text_answer && answer.text_answer.trim() !== '') || answer.image_url
    )

    if (!hasWrittenContent) {
      await updateLeaderboardAfterOfficialExam(supabase, user.id, attemptId)
      return NextResponse.json({
        success: true,
        message: "Written_open questions are blank; skipped AI grading",
        results: [],
      })
    }

    // Call Supabase Edge Function for AI grading
    const { data: gradingResult, error: gradingError } = await supabase.functions.invoke('grade-open-questions', {
      body: {
        attempt_id: attemptId,
        answers: writtenAnswers,
      },
    })

    if (gradingError) {
      console.error('❌ [grade-written] Edge function error:', gradingError)
      // Don't fail completely - mark questions as pending and continue
      return NextResponse.json({ 
        success: false, 
        error: gradingError.message,
        message: "AI grading failed, questions marked as pending"
      })
    }

    console.log(`✅ [grade-written] AI grading complete:`, gradingResult)

    // Recalculate scores after AI grading
    await recalculateScoresAfterAIGrading(supabase, attemptId)

    await updateLeaderboardAfterOfficialExam(supabase, user.id, attemptId)

    return NextResponse.json({ 
      success: true, 
      results: gradingResult?.results || [],
      message: `Successfully graded ${writtenAnswers.length} written_open questions`
    })

  } catch (error: any) {
    console.error('❌ [grade-written] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Recalculate scores after AI grading completes
async function recalculateScoresAfterAIGrading(supabase: any, attemptId: string): Promise<boolean> {
  try {
    console.log('🔄 [recalculateScores] Recalculating scores after AI grading...')
    
    // Get all answers and question metadata separately. See note above about
    // exam_answers.question_id intentionally not having a direct FK.
    const { data: answers, error: answersError } = await supabase
      .from('exam_answers')
      .select('*')
      .eq('attempt_id', attemptId)

    if (answersError) throw answersError

    const questionIds = [...new Set((answers || []).map((answer: any) => answer.question_id).filter(Boolean))]
    const { data: questions, error: questionsError } = questionIds.length > 0
      ? await supabase
          .from('questions')
          .select('id, subject_id, question_type, correct_answer, expected_answer, max_points')
          .in('id', questionIds)
      : { data: [], error: null }

    if (questionsError) throw questionsError

    const questionById = new Map<string, any>(
      (questions || []).map((question: any) => [String(question.id), question])
    )

    // Get subject scores to update
    const { data: subjectScores, error: scoresError } = await supabase
      .from('exam_subject_scores')
      .select('*')
      .eq('attempt_id', attemptId)

    if (scoresError) throw scoresError

    // Recalculate correct answers per subject
    const subjectCorrectCounts = new Map<string, number>()
    const subjectTotalCounts = new Map<string, number>()
    
    let totalCorrect = 0

    for (const answer of answers || []) {
      const question = questionById.get(String(answer.question_id))
      const subjectId = question?.subject_id
      if (!subjectId) continue

      // Initialize counts
      if (!subjectCorrectCounts.has(subjectId)) {
        subjectCorrectCounts.set(subjectId, 0)
        subjectTotalCounts.set(subjectId, 0)
      }
      subjectTotalCounts.set(subjectId, (subjectTotalCounts.get(subjectId) || 0) + 1)

      const isCorrect = isAnswerCorrect(answer, question)

      if (isCorrect) {
        subjectCorrectCounts.set(subjectId, (subjectCorrectCounts.get(subjectId) || 0) + 1)
        totalCorrect++
      }

    }

    // Update subject scores
    let totalScore = 0
    for (const score of subjectScores || []) {
      const correctCount = subjectCorrectCounts.get(score.subject_id) || 0
      const totalCount = subjectTotalCounts.get(score.subject_id) || score.total_questions
      const scorePercentage = totalCount > 0 ? correctCount / totalCount : 0
      const weightedScore = scorePercentage * score.max_possible
      const percentage = scorePercentage * 100

      await supabase
        .from('exam_subject_scores')
        .update({
          correct_answers: correctCount,
          raw_score: correctCount * 10,
          weighted_score: weightedScore,
          percentage,
        })
        .eq('id', score.id)

      totalScore += weightedScore
    }

    const { data: attempt } = await supabase
      .from('mock_exam_attempts')
      .select('mock_exams(exam_type, total_questions)')
      .eq('id', attemptId)
      .single()

    const examType = (attempt as any)?.mock_exams?.exam_type
    const maxPossibleScore =
      examType === 'first_stage'
        ? 300
        : examType === 'second_stage'
          ? 400
          : examType === 'full_exam'
            ? 700
            : ((attempt as any)?.mock_exams?.total_questions || 0)

    const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0

    // Update attempt total score
    await supabase
      .from('mock_exam_attempts')
      .update({
        total_score: totalScore,
        percentage,
      })
      .eq('id', attemptId)

    console.log(`✅ [recalculateScores] Updated scores - Total correct: ${totalCorrect}, Total score: ${totalScore}`)
    return true
  } catch (error) {
    console.error('❌ [recalculateScores] Error:', error)
    return false
  }
}
