// ============================================
// AI INSIGHTS - WORKING VERSION
// Simplified with better error handling
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, safeErrorResponse, rateLimitResponse } from '../_shared/security.ts';

// MEDIUM-08: Dynamic CORS with origin allowlist
const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'https://uni-prep-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];
function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Quality Scoring Utility (Stage 5.5)
function calculateQualityScore(params: {
  status: string;
  latency_ms: number;
  cost_usd: number;
  error_message?: string | null;
  total_tokens?: number;
}): { quality_score: number; flagged_for_review: boolean; review_status: string | null } {
  let score = 0;
  
  // Success status (30%)
  if (params.status === 'success') score += 0.30;
  
  // Low latency (20%)
  if (params.latency_ms < 2000) score += 0.20;
  else if (params.latency_ms < 5000) score += 0.10;
  
  // Reasonable cost (20%)
  if (params.cost_usd < 0.01) score += 0.20;
  else if (params.cost_usd < 0.05) score += 0.10;
  
  // No errors (30%)
  if (!params.error_message) score += 0.30;
  
  score = Math.max(0, Math.min(1, score));
  const flagged_for_review = score < 0.50;
  
  return {
    quality_score: Number(score.toFixed(2)),
    flagged_for_review,
    review_status: flagged_for_review ? 'pending' : null,
  };
}

// Helper function to fix common JSON issues
function fixMalformedJSON(content: string): string {
  try {
    // Remove markdown code blocks
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Remove any leading/trailing non-JSON characters
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
    
    // Fix unterminated strings by finding and closing them
    const quoteCount = (content.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      const lastQuoteIndex = content.lastIndexOf('"');
      const afterLastQuote = content.substring(lastQuoteIndex + 1);
      
      if (!afterLastQuote.includes('"') && afterLastQuote.trim().length > 0) {
        const nextSpecialChar = afterLastQuote.search(/[,}\]]/);
        if (nextSpecialChar !== -1) {
          content = content.substring(0, lastQuoteIndex + 1 + nextSpecialChar) + 
                   '"' + 
                   content.substring(lastQuoteIndex + 1 + nextSpecialChar);
        } else {
          content += '"';
        }
      }
    }
    
    // Fix unescaped quotes within strings
    content = content.replace(
      /"([^"]*?)":\s*"([^"]*?)"/g,
      (match, key, value) => {
        const escapedValue = value.replace(/(?<!\\)"/g, '\\"');
        return `"${key}": "${escapedValue}"`;
      }
    );
    
    // Fix unquoted values after colons
    content = content.replace(
      /"(\w+)":\s*([A-Z][^",}\]]+?)(?=[,}\]])/g,
      (match, key, value) => {
        if (/^(true|false|null|\d+\.?\d*)$/.test(value.trim())) {
          return match;
        }
        return `"${key}": "${value.trim()}"`;
      }
    );
    
    return content;
  } catch (error) {
    console.error('Error fixing JSON:', error);
    return content;
  }
}

const getAzerbaijaniSubjectName = (subject: any): string =>
  subject?.name_az || subject?.name_en || 'Unknown';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('🚀 AI Insights request received');

    // Get environment variables with validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = req.headers.get('Authorization');

    // Diagnostic logging
    console.log('🔑 ENV check:', {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasServiceKey: !!supabaseServiceKey,
      hasAuthHeader: !!authHeader,
    });

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return new Response(JSON.stringify({
        error: 'Server configuration error',
        message: 'Edge function environment not configured properly',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!authHeader) {
      console.log('❌ No Authorization header present');
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing Authorization header. Please log in first.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Create Supabase client for auth (with user's JWT)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    // Create Supabase client for database operations (with service role key - bypasses RLS)
    const supabase = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });

    if (!supabaseServiceKey) {
      console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not set - using auth client for DB operations (RLS will apply)');
    }

    // Get authenticated user (using auth client with JWT)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      console.log('❌ Authentication failed:', authError?.message || 'No user returned');
      console.log('❌ Auth error details:', JSON.stringify(authError));
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please log in to access insights',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    console.log('✅ User authenticated:', user.id);

    // Try to get student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (studentError) {
      console.error('❌ Database error:', studentError);
      throw studentError;
    }

    if (!student) {
      console.log('⚠️ No student record found');
      // Return default insights for non-students
      return new Response(JSON.stringify({
        insights: [
          {
            type: 'recommendation',
            title: 'Elmly-yə xoş gəlmisiniz!',
            content: 'Fərdiləşdirilmiş məsləhətlər almaq üçün tələbə qeydiyyatını tamamlayın.',
            priority: 'high',
          }
        ],
        cached: false,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log('✅ Student found:', student.id);

    // Rate limit: 10 insight requests per hour per user
    const rateCheck = await checkRateLimit(supabase, user.id, 'student_insights', 10, 60);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders);
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const forceRefresh = body.forceRefresh || false;

    // If force refresh, delete all existing insights for this student
    if (forceRefresh) {
      console.log('🗑️ Force refresh: Deleting old insights...');
      const { error: deleteError } = await supabase
        .from('ai_insights')
        .delete()
        .eq('student_id', student.id);
      
      if (deleteError) {
        console.error('⚠️ Failed to delete old insights:', deleteError);
      } else {
        console.log('✅ Old insights deleted');
      }
    }

    // Check for cached insights (if not forcing refresh)
    if (!forceRefresh) {
      const { data: cachedInsights } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('student_id', student.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (cachedInsights && cachedInsights.length > 0) {
        console.log('✅ Returning cached insights');
        return new Response(JSON.stringify({
          insights: cachedInsights.map(i => ({
            type: i.insight_type,
            subject_id: i.subject_id,
            title: i.title,
            content: i.content,
            priority: i.priority,
          })),
          cached: true,
          generatedAt: cachedInsights[0].created_at,
          expiresAt: cachedInsights[0].expires_at,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
    }

    // Get student performance data from multiple sources
    console.log('📊 Fetching comprehensive performance data...');
    
    // 1. Study progress (overall subject performance)
    const { data: progressData } = await supabase
      .from('study_progress')
      .select('subject_id, questions_attempted, questions_correct, subjects(name_en, name_az)')
      .eq('student_id', student.id);

    // 2. Topic-level weak areas from competitive question results
    const { data: topicResults } = await supabase
      .from('competitive_question_results')
      .select(`
        topic,
        is_correct,
        competitive_sessions!inner(student_id, subject_id, subjects(name_en, name_az))
      `)
      .eq('competitive_sessions.student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(200);

    // 3. Recent exam attempts for trend analysis
    const { data: examAttempts } = await supabase
      .from('student_exam_attempts')
      .select('score, completed_at, mock_exams(title)')
      .eq('student_id', student.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);

    // 4. Practice/Quiz session answers (from Practice and Quiz modes)
    const { data: practiceAnswers } = await supabase
      .from('student_answers')
      .select(`
        is_correct,
        answered_at,
        questions!inner(topic, difficulty, subject_id, subtopic_id, subjects(name_en, name_az), subject_subtopics(subtopic_name))
      `)
      .eq('student_id', student.id)
      .order('answered_at', { ascending: false })
      .limit(300);

    // 5. Recent practice sessions for activity analysis
    const { data: practiceSessions } = await supabase
      .from('practice_sessions')
      .select('mode, total_questions, correct_answers, completed_at, subjects(name_en, name_az)')
      .eq('student_id', student.id)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(20);

    // 6. Available topics & subtopics from DB — so AI only recommends real ones
    const studentSubjectIds = (progressData || []).map((p: any) => p.subject_id).filter(Boolean);
    // Map subject_id → subject name for all subjects the student studies
    const studentSubjectNames: Record<string, string> = {};
    (progressData || []).forEach((p: any) => {
      if (p.subject_id) studentSubjectNames[p.subject_id] = getAzerbaijaniSubjectName(p.subjects);
    });

    let availableTopicsMap: Record<string, string[]> = {};
    const subjectsWithTopics = new Set<string>(); // track which subjects have topic data

    if (studentSubjectIds.length > 0) {
      const { data: dbTopics } = await supabase
        .from('subject_topics')
        .select('topic_name, subject_id, subjects(name_en, name_az), subject_subtopics(subtopic_name)')
        .in('subject_id', studentSubjectIds)
        .eq('is_active', true)
        .order('display_order');

      (dbTopics || []).forEach((t: any) => {
        const subjectName = getAzerbaijaniSubjectName(t.subjects) || studentSubjectNames[t.subject_id] || 'Unknown';
        subjectsWithTopics.add(subjectName);
        const subtopics = (t.subject_subtopics || []).map((st: any) => st.subtopic_name).filter(Boolean);
        const key = `${subjectName} → ${t.topic_name}`;
        availableTopicsMap[key] = subtopics;
      });
    }

    // Subjects the student studies but with NO topics configured in DB yet
    const subjectsWithoutTopics = Object.values(studentSubjectNames)
      .filter(name => name !== 'Unknown' && !subjectsWithTopics.has(name));

    // If no data at all, return default insights
    if ((!progressData || progressData.length === 0) && 
        (!topicResults || topicResults.length === 0) && 
        (!examAttempts || examAttempts.length === 0) &&
        (!practiceAnswers || practiceAnswers.length === 0)) {
      console.log('⚠️ No performance data found');
      const defaultInsights = [
        {
          type: 'recommendation',
          title: 'Səyahətinə başla',
          content: 'Fərdiləşdirilmiş təhsil məsləhətləri almaq üçün sualları həll etməyə başla.',
          priority: 'high',
        },
        {
          type: 'study_tip',
          title: 'Gündəlik məşq',
          content: 'Ən yaxşı nəticələr üçün hər gün 30 dəqiqə məşq etməyə çalış.',
          priority: 'medium',
        }
      ];

      return new Response(JSON.stringify({
        insights: defaultInsights,
        cached: false,
        generatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log('✅ Performance data found:', {
      subjects: progressData?.length || 0,
      topicResults: topicResults?.length || 0,
      examAttempts: examAttempts?.length || 0,
      practiceAnswers: practiceAnswers?.length || 0,
      practiceSessions: practiceSessions?.length || 0,
    });

    // Process topic-level weak areas from competitive mode
    const topicStats: Record<string, { correct: number; total: number; subject: string }> = {};
    (topicResults || []).forEach((result: any) => {
      const topic = result.topic || 'General';
      const subject = getAzerbaijaniSubjectName(result.competitive_sessions?.subjects);
      const key = `${subject}:${topic}`;
      
      if (!topicStats[key]) {
        topicStats[key] = { correct: 0, total: 0, subject };
      }
      topicStats[key].total++;
      if (result.is_correct) topicStats[key].correct++;
    });

    // Also process practice/quiz answers for topic analysis
    (practiceAnswers || []).forEach((answer: any) => {
      const topic = answer.questions?.topic || 'General';
      const subject = getAzerbaijaniSubjectName(answer.questions?.subjects);
      const key = `${subject}:${topic}`;
      
      if (!topicStats[key]) {
        topicStats[key] = { correct: 0, total: 0, subject };
      }
      topicStats[key].total++;
      if (answer.is_correct) topicStats[key].correct++;
    });

    // Find weak topics (accuracy < 60% with at least 5 attempts)
    const weakTopics = Object.entries(topicStats)
      .filter(([_, stats]) => stats.total >= 5 && (stats.correct / stats.total) < 0.6)
      .map(([key, stats]) => ({
        topic: key.split(':')[1],
        subject: stats.subject,
        accuracy: Math.round((stats.correct / stats.total) * 100),
        attempts: stats.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Find strong topics (accuracy >= 80% with at least 10 attempts)
    const strongTopics = Object.entries(topicStats)
      .filter(([_, stats]) => stats.total >= 10 && (stats.correct / stats.total) >= 0.8)
      .map(([key, stats]) => ({
        topic: key.split(':')[1],
        subject: stats.subject,
        accuracy: Math.round((stats.correct / stats.total) * 100),
        attempts: stats.total,
      }))
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 3);

    // Stage 7: Process subtopic-level weak areas from practice answers
    const subtopicStats: Record<string, { correct: number; total: number; topic: string }> = {};
    (practiceAnswers || []).forEach((answer: any) => {
      const subtopicName = answer.questions?.subject_subtopics?.subtopic_name;
      const topic = answer.questions?.topic || 'General';
      if (!subtopicName) return;
      if (!subtopicStats[subtopicName]) {
        subtopicStats[subtopicName] = { correct: 0, total: 0, topic };
      }
      subtopicStats[subtopicName].total++;
      if (answer.is_correct) subtopicStats[subtopicName].correct++;
    });

    const weakSubtopics = Object.entries(subtopicStats)
      .filter(([_, s]) => s.total >= 5 && (s.correct / s.total) < 0.6)
      .map(([subtopic, s]) => ({
        subtopic,
        topic: s.topic,
        accuracy: Math.round((s.correct / s.total) * 100),
        attempts: s.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Analyze exam trend
    let examTrend = 'stable';
    if (examAttempts && examAttempts.length >= 3) {
      const recentAvg = examAttempts.slice(0, 3).reduce((sum: number, e: any) => sum + (e.score || 0), 0) / 3;
      const olderAvg = examAttempts.slice(3, 6).reduce((sum: number, e: any) => sum + (e.score || 0), 0) / Math.min(3, examAttempts.length - 3);
      if (olderAvg > 0) {
        if (recentAvg > olderAvg * 1.1) examTrend = 'improving';
        else if (recentAvg < olderAvg * 0.9) examTrend = 'declining';
      }
    }

    // Analyze practice session activity
    const recentPracticeSessions = (practiceSessions || []).slice(0, 10);
    const practiceStats = {
      totalSessions: recentPracticeSessions.length,
      quizSessions: recentPracticeSessions.filter((s: any) => s.mode === 'quiz').length,
      practiceSessions: recentPracticeSessions.filter((s: any) => s.mode === 'practice').length,
      avgAccuracy: recentPracticeSessions.length > 0 
        ? Math.round(recentPracticeSessions.reduce((sum: number, s: any) => 
            sum + (s.total_questions > 0 ? (s.correct_answers / s.total_questions) * 100 : 0), 0) / recentPracticeSessions.length)
        : 0,
      lastPractice: recentPracticeSessions[0]?.completed_at || null,
    };

    // Generate AI insights using DeepSeek
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY')!;
    const model = Deno.env.get('DEEPSEEK_MODEL_CHAT') || 'deepseek-chat';

    const performanceSummary = (progressData || []).map((p: any) => ({
      subject: getAzerbaijaniSubjectName(p.subjects),
      attempted: p.questions_attempted,
      correct: p.questions_correct,
      accuracy: p.questions_attempted > 0 ? Math.round((p.questions_correct / p.questions_attempted) * 100) : 0
    }));

    // Build available topics/subtopics list for the prompt
    const availableTopicsList = Object.entries(availableTopicsMap).map(([topicKey, subtopics]) => {
      if (subtopics.length > 0) {
        return `  ${topicKey}: [${subtopics.join(', ')}]`;
      }
      return `  ${topicKey}`;
    }).join('\n');

    // Build comprehensive prompt with all data sources
    const prompt = `Sən ciddi və tələbkar müəllimsən. Tələbənin zəif yerlərini birbaşa göstər və konkret tapşırıqlar ver.

QATİ QAYDALAR:
1. Yumşaq danışma — birbaşa de ki nə etməlidir: "Gərək bu gün...", "Bu gün mütləq...", "Bu həftə..."
2. Hər məsləhət KONKRET tapşırıq olsun — neçə sual, hansı mövzu
3. Tərif vermə, "yaxşısan" deməyin yox — yalnız iş ver, nəticəyə fokuslan
4. Ən vacib tapşırığı birinci yaz — prioritet sırası ilə
5. Salamlama YOX, giriş YOX — birbaşa tapşırığa keç
6. MÜTLƏQ "MÖVCUD MÖVZULAR" siyahısındakı adları istifadə et — özündən mövzu UYDURMA!
7. Saatı MƏNASIZDIR — "saat 18:00-a qədər", "axşam 6-da" kimi KONKRET SAAT YAZMA, yalnız "bu gün", "sabah", "bu həftə" işlət
8. Mövzu/altmövzu məlumatı olmayan fənnlər üçün fənn adıyla ümumi tövsiyə ver, mövzu adı UYDURMA

CAVAB FORMATI (MÜTLƏQ bu formatda qaytar):
{"insights": [{"type": "recommendation", "title": "Başlıq", "content": "Məzmun", "priority": "medium"}]}

Hər məsləhət bunları ehtiva etməlidir:
- type: recommendation, weak_area, strength, və ya study_tip
- title: maks 40 simvol
- content: maks 180 simvol
- priority: high, medium, və ya low

MÜTLƏQ Azərbaycan dilində yaz. Tələbəyə "sən" kimi müraciət et.

MÖVCUD MÖVZULAR VƏ ALTMÖVZULAR (yalnız bunlardan istifadə et):
${availableTopicsList || '(Hələ heç bir fənn üçün mövzu konfiqurasiya edilməyib)'}
${subjectsWithoutTopics.length > 0 ? `\nMÖVZU MƏLUMATı OLMAYAN FƏNNLƏR (bu fənnlər üçün mövzu adı YAZMA, yalnız fənn adı ilə ümumi tövsiyə ver):\n${subjectsWithoutTopics.map(s => `  ${s}`).join('\n')}` : ''}

ÜMUMİ PERFORMANS: ${JSON.stringify(performanceSummary)}

ZƏİF MÖVZULAR: ${weakTopics.length > 0 ? JSON.stringify(weakTopics) : 'Hələ kifayət qədər məlumat yoxdur'}

ZƏİF ALT MÖVZULAR: ${weakSubtopics.length > 0 ? JSON.stringify(weakSubtopics) : 'Hələ kifayət qədər məlumat yoxdur'}

GÜCLÜ MÖVZULAR: ${strongTopics.length > 0 ? JSON.stringify(strongTopics) : 'Hələ kifayət qədər məlumat yoxdur'}

MƏŞQİYYƏT AKTİVLİYİ: ${JSON.stringify(practiceStats)}

İMTAHAN TRENDİ: ${examTrend === 'improving' ? 'Yaxşılaşır' : examTrend === 'declining' ? 'Azalır' : 'Sabit'}
${examAttempts && examAttempts.length > 0 ? `Son imtahan balları: ${examAttempts.slice(0, 5).map((e: any) => e.score).join(', ')}` : ''}

Yalnız düzgün JSON obyekt qaytar: {"insights": [...]}`;


    console.log('🤖 Calling DeepSeek API...');

    // Create AbortController for timeout (30 seconds - insights are simpler than questions)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      console.error('❌ DeepSeek API error:', aiResponse.status);
      throw new Error(`DeepSeek API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    console.log('✅ AI response received');

    // Parse AI response with JSON fixing
    let insights;
    const fixedContent = fixMalformedJSON(aiContent);
    
    try {
      const parsed = JSON.parse(fixedContent);
      // Handle both formats: {"insights": [...]} or direct array [...]
      if (parsed.insights && Array.isArray(parsed.insights)) {
        insights = parsed.insights;
      } else if (Array.isArray(parsed)) {
        insights = parsed;
      } else {
        insights = [parsed];
      }
      console.log('✅ JSON parsed successfully');
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError);
      console.log('Using fallback insights...');
      insights = [{
        type: 'recommendation',
        title: 'Məşq etməyə davam et',
        content: 'Performansını yaxşılaşdırmaq üçün təhsilini davam etdir.',
        priority: 'medium',
      }];
    }

    // Validate and clean insights
    insights = insights
      .filter(i => i.title && i.content)
      .map(i => ({
        type: i.type || 'recommendation',
        subject_id: i.subject_id || null,
        title: String(i.title).substring(0, 100),
        content: String(i.content).substring(0, 300),
        priority: i.priority || 'medium',
      }))
      .slice(0, 5);

    // Cache insights (3 days - same as competitive mode)
    console.log('💾 Saving insights to database...');
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    const { data: insertedInsights, error: insertError } = await supabase
      .from('ai_insights')
      .insert(
        insights.map(i => ({
          student_id: student.id,
          insight_type: i.type,
          subject_id: i.subject_id,
          title: i.title,
          content: i.content,
          priority: i.priority,
          expires_at: expiresAt.toISOString(),
        }))
      )
      .select();

    if (insertError) {
      console.error('❌ Failed to save insights to database:', insertError);
      console.error('Insert error details:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Successfully saved', insertedInsights?.length || 0, 'insights to database');
    }

    // Log usage with new schema (Stage 5.5)
    const requestId = `insights_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const promptTokens = aiData.usage?.prompt_tokens || 0;
    const completionTokens = aiData.usage?.completion_tokens || 0;
    const totalTokens = aiData.usage?.total_tokens || 0;
    
    // Deepseek pricing: $0.14/1M input, $0.28/1M output
    const inputCost = (promptTokens / 1_000_000) * 0.14;
    const outputCost = (completionTokens / 1_000_000) * 0.28;
    const totalCost = inputCost + outputCost;
    const latencyMs = Date.now() - startTime;
    
    // Calculate quality score (Stage 5.5)
    const qualityResult = calculateQualityScore({
      status: 'success',
      latency_ms: latencyMs,
      cost_usd: totalCost,
      error_message: null,
      total_tokens: totalTokens,
    });
    
    const { error: logError } = await supabase.from('ai_usage_logs').insert({
      request_id: requestId,
      user_id: user.id,
      feature_type: 'student_insights',
      provider: 'deepseek',
      model: model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usd: totalCost,
      latency_ms: latencyMs,
      status: 'success',
      quality_score: qualityResult.quality_score,
      flagged_for_review: qualityResult.flagged_for_review,
      review_status: qualityResult.review_status,
      request_metadata: {
        student_id: student.id,
        subjects_analyzed: progressData.length,
      },
      response_metadata: {
        insights_generated: insights.length,
      },
    });

    if (logError) {
      console.error('⚠️ Failed to log AI usage:', logError);
      console.error('Log error details:', JSON.stringify(logError, null, 2));
    } else {
      console.log('✅ AI usage logged successfully');
    }

    console.log('✅ Request completed successfully');

    return new Response(JSON.stringify({
      insights,
      cached: false,
      generatedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return safeErrorResponse(corsHeaders);
  }
});
