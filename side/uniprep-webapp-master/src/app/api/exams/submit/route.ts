import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Group scoring configuration
const GROUP_SCORING: Record<string, any> = {
  'I': {
    subjects: [
      { name: 'Mathematics', coefficient: 1.5 },
      { name: 'Physics', coefficient: 1.5 },
      { name: 'Chemistry', coefficient: 1.0 },
    ]
  },
  'II': {
    subjects: [
      { name: 'Biology', coefficient: 1.5 },
      { name: 'Chemistry', coefficient: 1.5 },
      { name: 'Physics', coefficient: 1.0 },
    ]
  },
  'III': {
    subjects: [
      { name: 'Azerbaijani Language', coefficient: 1.5 },
      { name: 'History', coefficient: 1.5 },
      { name: 'Geography', coefficient: 1.0 },
    ]
  },
  'IV': {
    subjects: [
      { name: 'English', coefficient: 1.5 },
      { name: 'Azerbaijani Language', coefficient: 1.5 },
      { name: 'History', coefficient: 1.0 },
    ]
  },
  'V': {
    subjects: [
      { name: 'Mathematics', coefficient: 1.0 },
      { name: 'Azerbaijani Language', coefficient: 1.0 },
      { name: 'General Knowledge', coefficient: 1.0 },
    ]
  }
}

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Auth check — verify the user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { attemptId, deferLeaderboardUpdate = false } = await request.json()

    if (!attemptId) {
      return NextResponse.json(
        { error: 'Attempt ID is required' },
        { status: 400 }
      )
    }

    // Get attempt details
    const { data: rawAttempt, error: attemptError } = await supabase
      .from('mock_exam_attempts')
      .select('*, mock_exams(*)')
      .eq('id', attemptId)
      .single()

    if (attemptError || !rawAttempt) {
      return NextResponse.json(
        { error: 'Attempt not found' },
        { status: 404 }
      )
    }

    const attempt = rawAttempt as any

    // Ownership check — user can only submit their own attempt
    if (attempt.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    if (attempt.status === 'completed' && attempt.completed_at) {
      return NextResponse.json({
        success: true,
        alreadySubmitted: true,
        result: {
          attempt_id: attemptId,
          mock_exam_id: attempt.mock_exam_id,
          total_score: attempt.total_score,
          percentage: attempt.percentage,
          completed_at: attempt.completed_at,
        },
      })
    }

    const mockExam = attempt.mock_exams
    const targetGroup = mockExam.target_group
    const examType = mockExam.exam_type
    const scoringConfig = GROUP_SCORING[targetGroup]

    // Determine max possible score
    let maxPossibleScore: number
    if (examType === 'individual') {
      maxPossibleScore = mockExam.total_questions || 0
    } else if (examType === 'first_stage') {
      maxPossibleScore = 300
    } else if (examType === 'second_stage') {
      maxPossibleScore = 400
    } else if (examType === 'full_exam') {
      maxPossibleScore = 700
    } else {
      maxPossibleScore = 300
    }

    // Get all answers. Load question metadata separately instead of relying on
    // an exam_answers -> questions embed, which can be absent or hidden by RLS.
    const { data: answers } = await supabase
      .from('exam_answers')
      .select('*')
      .eq('attempt_id', attemptId)

    // Get all exam questions
    const { data: examQuestions } = await supabase
      .from('mock_exam_questions')
      .select('question_id')
      .eq('mock_exam_id', mockExam.id)

    const totalQuestions = mockExam.uses_teacher_questions
      ? (mockExam.total_questions || 0)
      : (examQuestions || []).length
    const answeredQuestions = (answers || []).filter((a: any) =>
      a.selected_answer || (a.text_answer && a.text_answer.trim() !== '') || a.image_url
    ).length

    let allExamQuestions: any[] = []

    if (mockExam.uses_teacher_questions) {
      const { data: teacherQuestions, error: teacherQuestionsError } = await supabase
        .rpc('get_teacher_exam_questions', { p_exam_id: mockExam.id })

      if (teacherQuestionsError) {
        throw teacherQuestionsError
      }

      allExamQuestions = (teacherQuestions || []).map((question: any) => ({
        questions: {
          id: question.question_id,
          subject_id: question.subject_id,
          question_type: question.question_type || 'mcq',
          correct_answer: question.correct_answer,
          expected_answer: null,
          max_points: 1,
          subjects: { name_en: question.subject_name || 'Unknown' },
        },
      }))

      if (examType === 'individual' || maxPossibleScore === 0) {
        maxPossibleScore = allExamQuestions.length || mockExam.total_questions || 0
      }
    } else {
      const { data: officialQuestions, error: officialQuestionsError } = await supabase
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
        .order('question_order')

      if (officialQuestionsError) {
        throw officialQuestionsError
      }

      allExamQuestions = officialQuestions || []
    }

    const questionById = new Map<string, any>()
    ;(allExamQuestions || []).forEach((item: any) => {
      if (item.questions?.id) {
        questionById.set(String(item.questions.id), item.questions)
      }
    })

    // Get unique subjects
    const uniqueSubjectsInExam = new Set<string>()
    ;(allExamQuestions || []).forEach((item: any) => {
      if (!item.questions?.subject_id) return

      const subjectName = item.questions?.subjects?.name_en
      if (subjectName) {
        uniqueSubjectsInExam.add(subjectName)
      }
    })
    const numSubjectsInExam = uniqueSubjectsInExam.size || 1

    // Calculate subject max points
    const getMaxPointsForSubject = (subjectName: string): number => {
      if (examType === 'individual') {
        return (allExamQuestions || []).filter(
          (item: any) => item.questions?.subjects?.name_en === subjectName
        ).length
      }

      if (examType === 'first_stage' || !scoringConfig) {
        return Math.round(maxPossibleScore / numSubjectsInExam)
      } else {
        const subjectConfig = scoringConfig.subjects.find((s: any) => s.name === subjectName)
        if (!subjectConfig) {
          return 0
        }
        const totalCoefficient = scoringConfig.subjects.reduce((sum: number, s: any) => sum + s.coefficient, 0)
        return Math.round((subjectConfig.coefficient / totalCoefficient) * maxPossibleScore)
      }
    }

    // Calculate scores per subject
    const subjectScores = new Map<string, any>()

    // Initialize all subjects
    ;(allExamQuestions || []).forEach((item: any) => {
      const question = item.questions
      if (!question?.subject_id) return

      const subjectId = question.subject_id
      const subjectName = question.subjects?.name_en

      if (!subjectScores.has(subjectId)) {
        const subjectConfig = scoringConfig?.subjects?.find((s: any) => s.name === subjectName)
        const coefficient = examType === 'first_stage' || !scoringConfig ? 1.0 : (subjectConfig?.coefficient || 1.0)
        const maxPoints = getMaxPointsForSubject(subjectName)

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
        })
      }
    })

    // Count questions per subject
    ;(allExamQuestions || []).forEach((item: any) => {
      const question = item.questions
      if (!question?.subject_id) return

      const subjectId = question.subject_id
      const subjectScore = subjectScores.get(subjectId)
      if (subjectScore) {
        subjectScore.total_questions++
      }
    })

    // Process answers - handle different question types
    ;(answers || []).forEach((answer: any) => {
      const question = questionById.get(String(answer.question_id))
      if (!question?.subject_id) return

      const subjectId = question.subject_id
      const isCorrect = isAnswerCorrect(answer, question)

      const subjectScore = subjectScores.get(subjectId)
      if (subjectScore && isCorrect) {
        subjectScore.correct_answers++
      }
    })

    // Calculate scores and percentages
    const subjectPerformances: any[] = []
    subjectScores.forEach(score => {
      const scorePercentage = score.total_questions > 0
        ? score.correct_answers / score.total_questions
        : 0
      
      score.weighted_score = scorePercentage * score.max_possible
      score.raw_score = score.correct_answers * 10
      score.percentage = scorePercentage * 100
      
      subjectPerformances.push(score)
    })

    // Calculate total score
    const totalScore = subjectPerformances.reduce((sum, s) => sum + s.weighted_score, 0)
    const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0

    // Identify strengths and weaknesses
    const strengths = subjectPerformances
      .filter(s => s.percentage >= 70)
      .map(s => s.subject_name)
    const weaknesses = subjectPerformances
      .filter(s => s.percentage < 50)
      .map(s => s.subject_name)

    // Save subject scores
    for (const score of subjectPerformances) {
      const scoreRow = {
        attempt_id: attemptId,
        subject_id: score.subject_id,
        coefficient: score.coefficient,
        total_questions: score.total_questions,
        correct_answers: score.correct_answers,
        raw_score: score.raw_score,
        weighted_score: score.weighted_score,
        max_possible: score.max_possible,
        percentage: score.percentage,
      }

      const { error: insertError } = await supabase.from('exam_subject_scores').insert(scoreRow)
      if (insertError) {
        await supabase
          .from('exam_subject_scores')
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
          .eq('subject_id', score.subject_id)
      }
    }

    // Update attempt
    const { error: updateError } = await supabase
      .from('mock_exam_attempts')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        total_score: totalScore,
        percentage: percentage,
      })
      .eq('id', attemptId)

    if (updateError) {
      throw updateError
    }

    if (!mockExam.uses_teacher_questions && !deferLeaderboardUpdate) {
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (student?.id) {
        const { error: leaderboardError } = await supabase.rpc('update_leaderboard_score_after_exam', {
          p_student_id: student.id,
          p_attempt_id: attemptId,
        })

        if (leaderboardError) {
          console.error('Leaderboard score update failed after exam submit:', leaderboardError)
        }
      }
    }

    const correctAnswers = subjectPerformances.reduce((sum, s) => sum + s.correct_answers, 0)
    const incorrectAnswers = answeredQuestions - correctAnswers
    const unansweredQuestions = totalQuestions - answeredQuestions

    const timeTaken = Math.floor(
      (new Date().getTime() - new Date(attempt.started_at).getTime()) / 1000 / 60
    )

    return NextResponse.json({
      success: true,
      result: {
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
        total_score: Math.round(totalScore * 100) / 100,
        max_possible_score: maxPossibleScore,
        percentage: Math.round(percentage * 100) / 100,
        subject_performances: subjectPerformances,
        strengths,
        weaknesses,
      }
    })
  } catch (error: any) {
    console.error('Submit exam error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit exam' },
      { status: 500 }
    )
  }
}
