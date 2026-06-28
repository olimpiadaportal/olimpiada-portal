import { supabase } from './supabase';

export interface CompetitiveSession {
  id: string;
  student_id: string;
  subject_id: string;
  subject_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_spent_seconds: number;
  weak_topics_covered: string[];
  completed_at: string;
  cache_expires_at: string;
}

export interface QuestionResult {
  id: string;
  session_id: string;
  question_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  student_answer: string | null;
  is_correct: boolean;
  time_spent_seconds: number;
}

export interface CreateSessionData {
  student_id: string;
  subject_id: string;
  subject_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_spent_seconds: number;
  weak_topics_covered: string[];
  completed_at: string;
  questions: Omit<QuestionResult, 'id' | 'session_id'>[];
}

export interface UpdateSessionData {
  student_id?: string; // Allow updating student_id for cached sessions
  score: number;
  correct_answers: number;
  time_spent_seconds: number;
  completed_at: string;
  cache_expires_at: string;
}

class CompetitiveSessionService {
  /**
   * Create a new competitive session with question results
   */
  async createSession(data: CreateSessionData): Promise<CompetitiveSession | null> {
    try {
      console.log('💾 Creating new session:', {
        student_id: data.student_id,
        subject_name: data.subject_name,
        score: data.score,
        completed_at: data.completed_at
      });

      // Calculate cache expiry (3 days from now)
      const cacheExpiresAt = new Date();
      cacheExpiresAt.setDate(cacheExpiresAt.getDate() + 3);

      // 1. Create session
      const { data: session, error: sessionError } = await supabase
        .from('competitive_sessions')
        .insert({
          student_id: data.student_id,
          subject_id: data.subject_id,
          subject_name: data.subject_name,
          score: data.score,
          correct_answers: data.correct_answers,
          total_questions: data.total_questions,
          time_spent_seconds: data.time_spent_seconds,
          weak_topics_covered: data.weak_topics_covered,
          completed_at: data.completed_at,
          cache_expires_at: cacheExpiresAt.toISOString(),
        })
        .select()
        .single();

      if (sessionError) {
        console.error('❌ Error creating session:', sessionError);
        return null;
      }

      console.log('✅ Session created in DB:', {
        id: session.id,
        student_id: session.student_id,
        subject_name: session.subject_name,
        score: session.score,
        completed_at: session.completed_at
      });

      // 2. Create question results
      const questionResults = data.questions.map(q => ({
        session_id: session.id,
        student_id: data.student_id,
        question_id: q.question_id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        student_answer: q.student_answer,
        is_correct: q.is_correct,
        time_spent_seconds: q.time_spent_seconds,
      }));

      const { error: questionsError } = await supabase
        .from('competitive_question_results')
        .insert(questionResults);

      if (questionsError) {
        console.error('Error creating question results:', questionsError);
        // Session created but questions failed - still return session
      }

      console.log('✅ Session created:', session.id);
      return session as CompetitiveSession;
    } catch (error) {
      console.error('Error in createSession:', error);
      return null;
    }
  }

  /**
   * Update an existing session (when retaking cached quiz)
   */
  async updateSession(
    sessionId: string,
    data: UpdateSessionData,
    questions: Omit<QuestionResult, 'id' | 'session_id'>[]
  ): Promise<boolean> {
    try {
      console.log('🔄 Updating session:', {
        sessionId,
        completed_at: data.completed_at,
        score: data.score,
        correct_answers: data.correct_answers
      });

      // 1. Update session
      const updateData: any = {
        score: data.score,
        correct_answers: data.correct_answers,
        time_spent_seconds: data.time_spent_seconds,
        completed_at: data.completed_at,
        cache_expires_at: data.cache_expires_at,
      };
      
      // Update student_id if provided (for cached sessions)
      if (data.student_id) {
        updateData.student_id = data.student_id;
      }

      const { data: updatedData, error: sessionError } = await supabase
        .from('competitive_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select();

      if (sessionError) {
        console.error('Error updating session:', sessionError);
        return false;
      }

      console.log('✅ Session updated in DB:', {
        id: updatedData?.[0]?.id,
        student_id: updatedData?.[0]?.student_id,
        subject_name: updatedData?.[0]?.subject_name,
        score: updatedData?.[0]?.score,
        completed_at: updatedData?.[0]?.completed_at
      });

      // 2. Delete old question results
      const { error: deleteError } = await supabase
        .from('competitive_question_results')
        .delete()
        .eq('session_id', sessionId);

      if (deleteError) {
        console.error('Error deleting old question results:', deleteError);
      }

      // 3. Insert new question results (include student_id from updated session)
      const studentId = data.student_id || updatedData?.[0]?.student_id;
      const questionResults = questions.map(q => ({
        session_id: sessionId,
        student_id: studentId,
        question_id: q.question_id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        student_answer: q.student_answer,
        is_correct: q.is_correct,
        time_spent_seconds: q.time_spent_seconds,
      }));

      const { error: questionsError } = await supabase
        .from('competitive_question_results')
        .insert(questionResults);

      if (questionsError) {
        console.error('Error creating new question results:', questionsError);
        return false;
      }

      console.log('✅ Session updated:', sessionId);
      return true;
    } catch (error) {
      console.error('Error in updateSession:', error);
      return false;
    }
  }

  /**
   * Get session history for a student (optionally filtered by subject)
   */
  async getSessionHistory(
    studentId: string,
    subjectId?: string
  ): Promise<CompetitiveSession[]> {
    try {
      console.log('📊 Fetching session history for:', { studentId, subjectId });
      
      let query = supabase
        .from('competitive_sessions')
        .select('*')
        .eq('student_id', studentId)
        .not('completed_at', 'is', null) // Only show completed sessions
        .order('completed_at', { ascending: false });

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching session history:', error);
        return [];
      }

      console.log('📊 Session history query result:', {
        studentId,
        count: data?.length || 0,
        firstSession: data?.[0] ? {
          id: data[0].id,
          student_id: data[0].student_id,
          subject_name: data[0].subject_name,
          completed_at: data[0].completed_at
        } : null
      });

      return (data || []) as CompetitiveSession[];
    } catch (error) {
      console.error('❌ Error in getSessionHistory:', error);
      return [];
    }
  }

  /**
   * Get session details with all question results
   */
  async getSessionDetails(sessionId: string): Promise<{
    session: CompetitiveSession | null;
    questions: QuestionResult[];
  }> {
    try {
      // 1. Get session
      const { data: session, error: sessionError } = await supabase
        .from('competitive_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        console.error('Error fetching session:', sessionError);
        return { session: null, questions: [] };
      }

      // 2. Get question results
      const { data: questions, error: questionsError } = await supabase
        .from('competitive_question_results')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (questionsError) {
        console.error('Error fetching question results:', questionsError);
        return { session: session as CompetitiveSession, questions: [] };
      }

      return {
        session: session as CompetitiveSession,
        questions: (questions || []) as QuestionResult[],
      };
    } catch (error) {
      console.error('Error in getSessionDetails:', error);
      return { session: null, questions: [] };
    }
  }

  /**
   * Check if session cache is still valid
   */
  isCacheValid(session: CompetitiveSession): boolean {
    const now = new Date();
    const expiresAt = new Date(session.cache_expires_at);
    return now < expiresAt;
  }

  /**
   * Get statistics for a student
   */
  async getStatistics(studentId: string): Promise<{
    totalSessions: number;
    averageScore: number;
    totalQuestions: number;
    totalCorrect: number;
  }> {
    try {
      const sessions = await this.getSessionHistory(studentId);

      if (sessions.length === 0) {
        return {
          totalSessions: 0,
          averageScore: 0,
          totalQuestions: 0,
          totalCorrect: 0,
        };
      }

      const totalScore = sessions.reduce((sum, s) => sum + s.score, 0);
      const totalQuestions = sessions.reduce((sum, s) => sum + s.total_questions, 0);
      const totalCorrect = sessions.reduce((sum, s) => sum + s.correct_answers, 0);

      return {
        totalSessions: sessions.length,
        averageScore: Math.round(totalScore / sessions.length),
        totalQuestions,
        totalCorrect,
      };
    } catch (error) {
      console.error('Error in getStatistics:', error);
      return {
        totalSessions: 0,
        averageScore: 0,
        totalQuestions: 0,
        totalCorrect: 0,
      };
    }
  }

  /**
   * Delete a session and its question results
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      // Question results will be deleted automatically due to CASCADE
      const { error } = await supabase
        .from('competitive_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) {
        console.error('Error deleting session:', error);
        return false;
      }

      console.log('✅ Session deleted:', sessionId);
      return true;
    } catch (error) {
      console.error('Error in deleteSession:', error);
      return false;
    }
  }
}

export const competitiveSessionService = new CompetitiveSessionService();
