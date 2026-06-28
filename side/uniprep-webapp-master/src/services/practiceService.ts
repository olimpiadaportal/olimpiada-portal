import { createClient } from '@/lib/supabase/client'
import { TopicWithSubtopics, SubtopicItem } from '@/types/practice'

export interface TopicSelection {
  topicNames: string[]
  subtopicIds: string[]
}

interface Topic {
  id: string
  topic_name: string
  question_count: number
  is_active: boolean
}

interface AnswerHistoryEntry {
  question_id: string
  is_correct: boolean
  was_skipped?: boolean
  answered_at: string
}

export async function upsertPracticeAnswerWithTiming(params: {
  sessionId: string
  questionId: string
  selectedAnswer?: string | null
  textAnswer?: string | null
  isCorrect: boolean
  timeSpentSeconds: number
  answeredAt?: string
}): Promise<void> {
  const supabase = createClient()
  const { error } = await (supabase as any).rpc('upsert_practice_answer_with_timing', {
    p_practice_session_id: params.sessionId,
    p_question_id: params.questionId,
    p_selected_answer: params.selectedAnswer ?? null,
    p_text_answer: params.textAnswer ?? null,
    p_is_correct: params.isCorrect,
    p_time_spent_seconds: Math.max(0, Math.round(params.timeSpentSeconds || 0)),
    p_was_skipped: false,
    p_answered_at: params.answeredAt ?? new Date().toISOString(),
  })

  if (error) throw error
}

/**
 * Get topics for a subject from subject_topics table
 * Matches mobile app implementation
 */
export async function getTopicsBySubject(subjectId: string): Promise<Topic[]> {
  try {
    const supabase = createClient()

    // First get topics from subject_topics table
    const { data: topics, error: topicsError } = await supabase
      .from('subject_topics')
      .select('id, topic_name, is_active')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order')

    if (topicsError) throw topicsError

    // Get question counts for each topic (exclude written_open from practice)
    const topicsWithCounts = await Promise.all(
      (topics || []).map(async (topic) => {
        const { count } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', subjectId)
          .eq('topic', topic.topic_name)
          .eq('is_active', true)
          .eq('exclude_from_practice', false)
          .neq('question_type', 'written_open')

        return {
          id: topic.id,
          topic_name: topic.topic_name,
          question_count: count || 0,
          is_active: topic.is_active,
        }
      })
    )

    // Filter out topics with no questions
    return topicsWithCounts.filter(t => t.question_count > 0)
  } catch (error) {
    console.error('Get topics by subject error:', error)
    return []
  }
}

/**
 * Get topics with their nested subtopics for collapsible topic selection
 */
export async function getTopicsWithSubtopics(subjectId: string): Promise<TopicWithSubtopics[]> {
  try {
    const supabase = createClient()

    const { data: topics, error: topicsError } = await supabase
      .from('subject_topics')
      .select(`id, topic_name, is_active,
        subject_subtopics (id, topic_id, subtopic_name, description, difficulty_level, display_order, is_active)`)
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order')

    if (topicsError) throw topicsError

    const topicsWithData = await Promise.all(
      (topics || []).map(async (topic: any) => {
        const { count } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', subjectId)
          .eq('topic', topic.topic_name)
          .eq('is_active', true)
          .eq('exclude_from_practice', false)
          .neq('question_type', 'written_open')

        const subtopics: SubtopicItem[] = (topic.subject_subtopics || [])
          .filter((s: SubtopicItem) => s.is_active)
          .sort((a: SubtopicItem, b: SubtopicItem) => a.display_order - b.display_order)

        return {
          id: topic.id,
          topic_name: topic.topic_name,
          question_count: count || 0,
          is_active: topic.is_active,
          subtopics,
        }
      })
    )

    return topicsWithData.filter(t => t.question_count > 0 || t.subtopics.length > 0)
  } catch (error) {
    console.error('Get topics with subtopics error:', error)
    return []
  }
}

// ============================================================================
// Adaptive Practice Algorithm (score-based, matches mobile app)
// ============================================================================

/**
 * Get question IDs from the user's last 2 completed practice sessions
 * for cross-session deduplication (−400 score penalty).
 */
async function getRecentSessionQuestionIds(
  userId: string,
  subjectId: string
): Promise<Set<string>> {
  try {
    const supabase = createClient()
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('question_ids')
      .eq('user_id', userId)
      .eq('subject_id', subjectId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(2)

    const ids = new Set<string>()
    ;(sessions || []).forEach((s: any) => {
      ;(s.question_ids || []).forEach((id: string) => ids.add(id))
    })
    return ids
  } catch {
    return new Set()
  }
}

/**
 * Score-based adaptive selection algorithm.
 *
 * Scoring:
 *   - Never seen: 1000 + jitter(0–50)
 *   - Skipped (most recent): 800 + age bonus
 *   - Incorrect (most recent): 600 + age bonus
 *   - Correct (most recent): 200 + age bonus
 *   - Age bonus: +1 per hour since last answer, capped at 200
 *   - Recent-session penalty: −400 if in last 2 sessions
 *   - Small jitter (+0–10) breaks ties
 *
 * Top N by score, then shuffled for presentation.
 */
function applyAdaptiveSelection(
  questions: any[],
  answerHistory: AnswerHistoryEntry[],
  count: number,
  recentSessionQuestionIds: Set<string> = new Set()
): any[] {
  // No history — prefer fresh questions, deprioritize recent session ones
  if (answerHistory.length === 0) {
    if (recentSessionQuestionIds.size === 0) {
      return questions.sort(() => Math.random() - 0.5).slice(0, count)
    }
    const fresh = questions.filter(q => !recentSessionQuestionIds.has(q.id))
    const recent = questions.filter(q => recentSessionQuestionIds.has(q.id))
    return [...fresh.sort(() => Math.random() - 0.5), ...recent.sort(() => Math.random() - 0.5)].slice(0, count)
  }

  const now = Date.now()

  // Build stats map: most recent answer per question
  const questionStats = new Map<string, { lastAnswered: number; wasCorrect: boolean; wasSkipped: boolean }>()
  answerHistory.forEach((a) => {
    if (!questionStats.has(a.question_id)) {
      questionStats.set(a.question_id, {
        lastAnswered: new Date(a.answered_at).getTime(),
        wasCorrect: a.is_correct,
        wasSkipped: a.was_skipped ?? false,
      })
    }
  })

  const scored: { question: any; score: number }[] = questions.map(q => {
    const stats = questionStats.get(q.id)
    let score: number

    if (!stats) {
      // Never seen — highest priority
      score = 1000 + Math.random() * 50
    } else {
      const hoursSinceAnswer = (now - stats.lastAnswered) / (1000 * 60 * 60)
      const ageBonus = Math.min(hoursSinceAnswer, 200)

      if (stats.wasSkipped)        score = 800 + ageBonus
      else if (!stats.wasCorrect)  score = 600 + ageBonus
      else                         score = 200 + ageBonus

      score += Math.random() * 10 // tie-breaker jitter
    }

    // Penalize questions from last 2 sessions
    if (recentSessionQuestionIds.has(q.id)) score -= 400

    return { question: q, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, count).map(s => s.question).sort(() => Math.random() - 0.5)
}

/**
 * Fetch answer history for a list of question IDs (batched to avoid query limits).
 */
async function fetchAnswerHistory(
  userId: string,
  questionIds: string[]
): Promise<AnswerHistoryEntry[]> {
  const supabase = createClient()
  const allAnswers: AnswerHistoryEntry[] = []
  const batchSize = 100

  for (let i = 0; i < questionIds.length; i += batchSize) {
    const batch = questionIds.slice(i, i + batchSize)
    const { data } = await supabase
      .from('student_answers')
      .select('question_id, is_correct, was_skipped, answered_at')
      .eq('user_id', userId)
      .in('question_id', batch)
      .order('answered_at', { ascending: false })

    if (data) allAnswers.push(...(data as AnswerHistoryEntry[]))
  }

  return allAnswers
}

/**
 * Get questions by selected topics with adaptive selection algorithm
 * Matches mobile app's score-based approach
 */
export async function getQuestionsByTopics(
  subjectId: string,
  selectedTopics: string[],
  totalCount: number,
  subtopicIds?: string[]
): Promise<any[]> {
  // If subtopics specified, filter by subtopic_id instead of topic name
  if (subtopicIds && subtopicIds.length > 0) {
    return getQuestionsBySubtopics(subjectId, subtopicIds, totalCount)
  }
  try {
    const supabase = createClient()

    if (selectedTopics.length === 0) {
      return getSmartQuestions(subjectId, totalCount)
    }

    const { data: { user } } = await supabase.auth.getUser()

    // Get all questions for selected topics
    const { data: allTopicQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('subject_id', subjectId)
      .in('topic', selectedTopics)
      .eq('is_active', true)
      .eq('exclude_from_practice', false)
      .neq('question_type', 'written_open')

    if (!allTopicQuestions || allTopicQuestions.length === 0) {
      return []
    }

    if (!user) {
      return allTopicQuestions.sort(() => Math.random() - 0.5).slice(0, Math.min(totalCount, allTopicQuestions.length))
    }

    const questionIds = allTopicQuestions.map(q => q.id)
    const [answerHistory, recentSessionIds] = await Promise.all([
      fetchAnswerHistory(user.id, questionIds),
      getRecentSessionQuestionIds(user.id, subjectId),
    ])

    return applyAdaptiveSelection(allTopicQuestions, answerHistory, totalCount, recentSessionIds)
  } catch (error) {
    console.error('Get questions by topics error:', error)
    return []
  }
}

/**
 * Get questions filtered by subtopic IDs with adaptive selection
 */
async function getQuestionsBySubtopics(
  subjectId: string,
  subtopicIds: string[],
  totalCount: number
): Promise<any[]> {
  try {
    const supabase = createClient()

    const { data: allQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('subject_id', subjectId)
      .in('subtopic_id', subtopicIds)
      .eq('is_active', true)
      .eq('exclude_from_practice', false)
      .neq('question_type', 'written_open')

    if (!allQuestions || allQuestions.length === 0) return []

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return allQuestions.sort(() => Math.random() - 0.5).slice(0, Math.min(totalCount, allQuestions.length))
    }

    const questionIds = allQuestions.map(q => q.id)
    const [answerHistory, recentSessionIds] = await Promise.all([
      fetchAnswerHistory(user.id, questionIds),
      getRecentSessionQuestionIds(user.id, subjectId),
    ])

    return applyAdaptiveSelection(allQuestions, answerHistory, totalCount, recentSessionIds)
  } catch (error) {
    console.error('Get questions by subtopics error:', error)
    return []
  }
}

/**
 * Get smart questions without topic filter — adaptive selection
 */
async function getSmartQuestions(
  subjectId: string,
  count: number
): Promise<any[]> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: allQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .eq('exclude_from_practice', false)
      .neq('question_type', 'written_open')

    if (!allQuestions || allQuestions.length === 0) {
      return []
    }

    if (!user) {
      return allQuestions.sort(() => Math.random() - 0.5).slice(0, Math.min(count, allQuestions.length))
    }

    const questionIds = allQuestions.map(q => q.id)
    const [answerHistory, recentSessionIds] = await Promise.all([
      fetchAnswerHistory(user.id, questionIds),
      getRecentSessionQuestionIds(user.id, subjectId),
    ])

    return applyAdaptiveSelection(allQuestions, answerHistory, count, recentSessionIds)
  } catch (error) {
    console.error('Get smart questions error:', error)
    return []
  }
}

/**
 * Get random questions from a subject
 * Uses adaptive selection algorithm to prioritize unanswered/incorrect questions
 */
export async function getRandomQuestions(
  subjectId: string,
  count: number
): Promise<any[]> {
  return getSmartQuestions(subjectId, count)
}

/**
 * Record a skipped question in student_answers with was_skipped=true.
 * Matches mobile app's recordSkippedQuestion().
 */
export async function recordSkippedQuestion(
  userId: string,
  questionId: string,
  sessionId: string,
  timeSpentSeconds: number = 0
): Promise<void> {
  try {
    const supabase = createClient()
    // Ownership and duplicate handling live in the canonical timing RPC.
    const { error } = await (supabase as any).rpc('upsert_practice_answer_with_timing', {
      p_practice_session_id: sessionId,
      p_question_id: questionId,
      p_selected_answer: null,
      p_text_answer: null,
      p_is_correct: false,
      p_time_spent_seconds: Math.max(0, Math.round(timeSpentSeconds || 0)),
      p_was_skipped: true,
      p_answered_at: new Date().toISOString(),
    })
    if (error && error.code !== '23505') {
      // Non-critical: skipped-answer tracking should not block finishing practice.
    }
  } catch {
    // Non-critical — fail silently
  }
}

/**
 * Submit question feedback (report an issue with a question).
 */
export async function submitQuestionFeedback(
  userId: string,
  questionId: string,
  feedbackType: string,
  comment?: string
): Promise<{ success: boolean; alreadyReported?: boolean }> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from('question_feedback').insert({
      question_id: questionId,
      user_id: userId,
      feedback_type: feedbackType,
      comment: comment?.trim() || null,
    })

    if (error) {
      if (error.code === '23505') {
        return { success: false, alreadyReported: true }
      }
      throw error
    }

    return { success: true }
  } catch (error) {
    console.error('Submit question feedback error:', error)
    return { success: false }
  }
}

/**
 * Check if user already submitted feedback for a question.
 */
export async function checkExistingFeedback(
  userId: string,
  questionId: string
): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('question_feedback')
      .select('id')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .limit(1)
      .maybeSingle()

    return !!data
  } catch {
    return false
  }
}
