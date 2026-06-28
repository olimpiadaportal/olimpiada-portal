// ============================================
// DATABASE HELPERS FOR EDGE FUNCTIONS
// ============================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { StudentPerformanceData, SubjectPerformance, UsageLog } from './types.ts';

/**
 * Create Supabase client for Edge Functions
 */
export function createSupabaseClient(authHeader: string): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Get student ID from authenticated user
 */
export async function getStudentId(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (studentError || !student) {
    throw new Error('Student not found');
  }

  return student.id;
}

/**
 * Fetch student performance data for AI analysis
 */
export async function getStudentPerformance(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudentPerformanceData> {
  console.log(`📊 Fetching performance data for student: ${studentId}`);

  // Get study progress for all subjects
  const { data: progressData, error: progressError } = await supabase
    .from('study_progress')
    .select(`
      subject_id,
      questions_attempted,
      questions_correct,
      study_time,
      subjects (
        id,
        name_en
      )
    `)
    .eq('student_id', studentId);

  if (progressError) {
    console.error('Error fetching study progress:', progressError);
    throw progressError;
  }

  // Get recent exam attempts
  const { data: recentAttempts, error: attemptsError } = await supabase
    .from('student_exam_attempts')
    .select(`
      score,
      completed_at,
      mock_exams (
        title,
        exam_type
      )
    `)
    .eq('student_id', studentId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (attemptsError) {
    console.error('Error fetching exam attempts:', attemptsError);
  }

  // Calculate subject performance
  const subjects: SubjectPerformance[] = (progressData || []).map((progress: any) => {
    const accuracy = progress.questions_attempted > 0
      ? (progress.questions_correct / progress.questions_attempted) * 100
      : 0;

    return {
      subject_id: progress.subject_id,
      subject_name: progress.subjects?.name_en || 'Unknown',
      total_attempted: progress.questions_attempted || 0,
      total_correct: progress.questions_correct || 0,
      accuracy: Math.round(accuracy * 10) / 10,
      weak_topics: [], // TODO: Implement topic tracking
      recent_scores: [],
    };
  });

  // Calculate overall accuracy
  const totalAttempted = subjects.reduce((sum, s) => sum + s.total_attempted, 0);
  const totalCorrect = subjects.reduce((sum, s) => sum + s.total_correct, 0);
  const overallAccuracy = totalAttempted > 0
    ? Math.round((totalCorrect / totalAttempted) * 1000) / 10
    : 0;

  // Calculate total practice time (in minutes)
  const totalPracticeTime = subjects.reduce((sum, s) => sum + (s as any).study_time || 0, 0);

  // Format recent activity
  const recentActivity = (recentAttempts || []).map((attempt: any) => ({
    date: attempt.completed_at,
    subject: attempt.mock_exams?.title || 'Exam',
    score: attempt.score || 0,
  }));

  return {
    student_id: studentId,
    subjects,
    overall_accuracy: overallAccuracy,
    total_practice_time: totalPracticeTime,
    recent_activity: recentActivity,
  };
}

/**
 * Get cached AI insights
 */
export async function getCachedInsights(
  supabase: SupabaseClient,
  studentId: string
): Promise<any[] | null> {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('student_id', studentId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cached insights:', error);
    return null;
  }

  if (!data || data.length === 0) {
    console.log('📭 No cached insights found');
    return null;
  }

  console.log(`📬 Found ${data.length} cached insights`);
  return data;
}

/**
 * Save AI insights to cache
 */
export async function cacheInsights(
  supabase: SupabaseClient,
  studentId: string,
  insights: any[]
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 6); // Cache for 6 hours

  const insightsToInsert = insights.map(insight => ({
    student_id: studentId,
    insight_type: insight.type,
    subject_id: insight.subject_id || null,
    title: insight.title,
    content: insight.content,
    priority: insight.priority,
    expires_at: expiresAt.toISOString(),
    metadata: insight.metadata || {},
  }));

  const { error } = await supabase
    .from('ai_insights')
    .insert(insightsToInsert);

  if (error) {
    console.error('Error caching insights:', error);
    throw error;
  }

  console.log(`💾 Cached ${insights.length} insights (expires in 6 hours)`);
}

/**
 * Log AI usage for monitoring
 */
export async function logUsage(
  supabase: SupabaseClient,
  log: UsageLog
): Promise<void> {
  const { error } = await supabase
    .from('ai_usage_logs')
    .insert({
      student_id: log.student_id || null,
      request_type: log.request_type,
      model_used: log.model_used,
      tokens_used: log.tokens_used,
      cost_usd: log.cost_usd,
      processing_time_ms: log.processing_time_ms,
      success: log.success,
      error_message: log.error_message || null,
    });

  if (error) {
    console.error('Error logging usage:', error);
    // Don't throw - logging failure shouldn't break the request
  } else {
    console.log(`📝 Logged usage: ${log.request_type} (${log.tokens_used} tokens, $${log.cost_usd.toFixed(4)})`);
  }
}

/**
 * Get subject name by ID
 */
export async function getSubjectName(
  supabase: SupabaseClient,
  subjectId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('subjects')
    .select('name_en')
    .eq('id', subjectId)
    .single();

  if (error || !data) {
    throw new Error('Subject not found');
  }

  return data.name_en;
}

/**
 * Get student's weak topics for a subject
 */
export async function getWeakTopics(
  supabase: SupabaseClient,
  studentId: string,
  subjectId: string
): Promise<string[]> {
  // TODO: Implement topic-level tracking
  // For now, return general weak areas based on accuracy
  
  const { data, error } = await supabase
    .from('study_progress')
    .select('questions_attempted, questions_correct')
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .single();

  if (error || !data) {
    return [];
  }

  const accuracy = data.questions_attempted > 0
    ? (data.questions_correct / data.questions_attempted) * 100
    : 0;

  // If accuracy is low, return general topics
  // This is a placeholder - implement proper topic tracking in the future
  if (accuracy < 70) {
    return ['General Concepts', 'Problem Solving', 'Application'];
  }

  return [];
}
