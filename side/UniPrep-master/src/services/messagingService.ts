/**
 * Messaging Service
 * Stage 10 - Phase 2.4: Basic Messaging System
 * 
 * Handles chat conversations and messages between students and teachers.
 * Features:
 * - Create conversations
 * - Send messages
 * - Mark messages as read
 * - Get conversation history
 * - Get unread count
 */

import { supabase } from './supabase';

export interface Conversation {
  id: string;
  student_id: string;
  teacher_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_student: number;
  unread_count_teacher: number;
  is_approved: boolean; // NEW: Teacher approved the chat
  approved_at: string | null; // NEW: When teacher approved
  created_at: string;
  updated_at: string;
  // Joined data
  student?: {
    id: string;
    user_id: string;
    profiles: {
      full_name: string;
      avatar_url: string | null;
    };
  };
  teacher?: {
    id: string;
    user_id: string;
    profiles: {
      full_name: string;
      avatar_url: string | null;
    };
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'student' | 'teacher';
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: 'image' | 'pdf' | 'document' | null;
  file_size_bytes: number | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Messaging eligibility status
 * Determines if a student can message a teacher based on booking status
 */
export interface MessagingEligibility {
  canMessage: boolean;
  hasBooking: boolean;
  bookingStatus: string | null;
  conversationId: string | null;
  isApproved: boolean;
  reason: 'approved' | 'pending_booking' | 'no_booking' | 'error';
}

class MessagingService {
  /**
   * Check if a student is eligible to message a teacher.
   * Messaging is only allowed if:
   * 1. The student has a confirmed or completed booking with the teacher
   * 2. The conversation has been approved (auto-approved when booking is confirmed)
   * 
   * This prevents students from bypassing the booking system by messaging directly.
   */
  async checkMessagingEligibility(
    studentId: string,
    teacherId: string
  ): Promise<MessagingEligibility> {
    try {
      // First, try to use the database function if available
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('check_messaging_eligibility', {
          p_student_id: studentId,
          p_teacher_id: teacherId,
        });

      if (!rpcError && rpcResult && rpcResult.length > 0) {
        const result = rpcResult[0];
        return {
          canMessage: result.can_message,
          hasBooking: result.has_booking,
          bookingStatus: result.booking_status,
          conversationId: result.conversation_id,
          isApproved: result.is_approved,
          reason: result.can_message 
            ? 'approved' 
            : result.has_booking 
              ? 'pending_booking' 
              : 'no_booking',
        };
      }

      // Fallback: Check manually if RPC not available
      console.log('⚠️ RPC not available, checking eligibility manually');
      
      // Check for any confirmed/completed booking
      const { data: activeBooking } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .in('status', ['confirmed', 'completed'])
        .limit(1)
        .maybeSingle();

      const hasActiveBooking = !!activeBooking;

      // Check for pending booking
      const { data: pendingBooking } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      const hasPendingBooking = !!pendingBooking;

      // Check conversation status
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id, is_approved')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .maybeSingle();

      const isApproved = conversation?.is_approved ?? false;

      // Can message if: conversation is approved OR has active booking (fallback)
      const canMessage = isApproved || hasActiveBooking;

      return {
        canMessage,
        hasBooking: hasActiveBooking || hasPendingBooking,
        bookingStatus: hasActiveBooking ? 'confirmed' : (hasPendingBooking ? 'pending' : null),
        conversationId: conversation?.id || null,
        isApproved,
        reason: canMessage
          ? 'approved'
          : hasPendingBooking
            ? 'pending_booking'
            : 'no_booking',
      };
    } catch (error) {
      console.error('Error checking messaging eligibility:', error);
      return {
        canMessage: false,
        hasBooking: false,
        bookingStatus: null,
        conversationId: null,
        isApproved: false,
        reason: 'error',
      };
    }
  }

  /**
   * Get or create a conversation between student and teacher
   */
  async getOrCreateConversation(
    studentId: string,
    teacherId: string
  ): Promise<{ conversation: Conversation | null; error: any }> {
    try {
      // Check if conversation exists (plain select — no FK hint joins)
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('student_id', studentId)
        .eq('teacher_id', teacherId)
        .single();

      if (existing) {
        const enriched = await this.enrichConversation(existing);
        return { conversation: enriched, error: null };
      }

      // Create new conversation
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({ student_id: studentId, teacher_id: teacherId })
        .select('*')
        .single();

      if (createError) {
        console.error('Error creating conversation:', createError);
        return { conversation: null, error: createError };
      }

      console.log('✅ Conversation created:', newConversation.id);
      const enriched = await this.enrichConversation(newConversation);
      return { conversation: enriched, error: null };
    } catch (error) {
      console.error('Error in getOrCreateConversation:', error);
      return { conversation: null, error };
    }
  }

  /**
   * Enrich a raw conversation row with student/teacher profile data.
   * Uses two-step queries: conversations → students/teachers → profiles.
   * This avoids FK hint joins that don't exist in the consolidated DB.
   */
  private async enrichConversation(conv: any): Promise<Conversation> {
    try {
      // Fetch student user_id
      const { data: studentRow } = await supabase
        .from('students')
        .select('id, user_id')
        .eq('id', conv.student_id)
        .single();

      // Fetch teacher user_id
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('id, user_id')
        .eq('id', conv.teacher_id)
        .single();

      // Fetch both profiles in parallel
      const [studentProfile, teacherProfile] = await Promise.all([
        studentRow?.user_id
          ? supabase.from('profiles').select('full_name, avatar_url').eq('id', studentRow.user_id).single()
          : Promise.resolve({ data: null }),
        teacherRow?.user_id
          ? supabase.from('profiles').select('full_name, avatar_url').eq('id', teacherRow.user_id).single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...conv,
        student: studentRow ? {
          id: studentRow.id,
          user_id: studentRow.user_id,
          profiles: studentProfile.data || { full_name: '', avatar_url: null },
        } : undefined,
        teacher: teacherRow ? {
          id: teacherRow.id,
          user_id: teacherRow.user_id,
          profiles: teacherProfile.data || { full_name: '', avatar_url: null },
        } : undefined,
      };
    } catch {
      return conv;
    }
  }

  /**
   * Enrich multiple conversations efficiently (batch profile lookups).
   */
  private async enrichConversations(
    convs: any[],
    role: 'student' | 'teacher'
  ): Promise<Conversation[]> {
    if (!convs.length) return [];

    // Collect IDs for the "other" party we need to look up
    const otherTable = role === 'teacher' ? 'students' : 'teachers';
    const otherIdField = role === 'teacher' ? 'student_id' : 'teacher_id';
    const otherIds = [...new Set(convs.map((c) => c[otherIdField]).filter(Boolean))];

    // Fetch other-party rows (id → user_id)
    const otherUserIdMap = new Map<string, string>();
    if (otherIds.length) {
      const { data: rows } = await supabase
        .from(otherTable)
        .select('id, user_id')
        .in('id', otherIds);
      (rows || []).forEach((r: any) => { if (r.user_id) otherUserIdMap.set(r.id, r.user_id); });
    }

    // Fetch profiles for all other-party user_ids
    const otherUserIds = [...otherUserIdMap.values()];
    const profileMap = new Map<string, { full_name: string; avatar_url: string | null }>();
    if (otherUserIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', otherUserIds);
      (profiles || []).forEach((p: any) => profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url }));
    }

    return convs.map((conv) => {
      const otherId = conv[otherIdField];
      const otherUserId = otherUserIdMap.get(otherId);
      const profile = otherUserId ? profileMap.get(otherUserId) : undefined;
      const otherData = otherId ? {
        id: otherId,
        user_id: otherUserId || '',
        profiles: profile || { full_name: '', avatar_url: null },
      } : undefined;

      return {
        ...conv,
        [role === 'teacher' ? 'student' : 'teacher']: otherData,
      };
    });
  }

  /**
   * Get all conversations for a student (only with messages)
   */
  async getStudentConversations(
    studentId: string
  ): Promise<{ conversations: Conversation[]; error: any }> {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('student_id', studentId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('Error fetching student conversations:', error);
        return { conversations: [], error };
      }

      const enriched = await this.enrichConversations(data || [], 'student');
      return { conversations: enriched, error: null };
    } catch (error) {
      console.error('Error in getStudentConversations:', error);
      return { conversations: [], error };
    }
  }

  /**
   * Get all conversations for a teacher (only with messages)
   */
  async getTeacherConversations(
    teacherId: string
  ): Promise<{ conversations: Conversation[]; error: any }> {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('Error fetching teacher conversations:', error);
        return { conversations: [], error };
      }

      const enriched = await this.enrichConversations(data || [], 'teacher');
      return { conversations: enriched, error: null };
    } catch (error) {
      console.error('Error in getTeacherConversations:', error);
      return { conversations: [], error };
    }
  }

  /**
   * Get ALL messages for a conversation
   * Returns complete message history in chronological order
   */
  async getMessages(
    conversationId: string
  ): Promise<{ messages: Message[]; error: any }> {
    try {
      console.log('📨 [getMessages] Fetching ALL messages for conversation:', conversationId);
      
      // Get ALL messages in chronological order (no limit)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ [getMessages] Error fetching messages:', error);
        return { messages: [], error };
      }

      const messages = data || [];
      
      console.log('✅ [getMessages] Fetched', messages.length, 'messages (full history)');
      if (messages.length > 0) {
        console.log('📨 [getMessages] First message:', messages[0]?.content?.substring(0, 30));
        console.log('📨 [getMessages] Last message:', messages[messages.length - 1]?.content?.substring(0, 30));
      }

      return { messages, error: null };
    } catch (error) {
      console.error('❌ [getMessages] Exception:', error);
      return { messages: [], error };
    }
  }

  /**
   * Check if user can send messages in a conversation.
   * With booking-based approval, the RLS policy enforces that messages can only
   * be inserted into approved conversations. This method provides a client-side
   * check for better UX (show error before attempting to send).
   */
  async canSendMessage(
    conversationId: string,
    senderType: 'student' | 'teacher'
  ): Promise<{ canSend: boolean; reason?: string }> {
    try {
      // Get conversation approval status
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('is_approved')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        return { canSend: false, reason: 'Conversation not found' };
      }

      // Teachers can always send (their message auto-approves the conversation)
      if (senderType === 'teacher') {
        return { canSend: true };
      }

      // Students can only send if conversation is approved (via confirmed booking)
      if (!conversation.is_approved) {
        return { 
          canSend: false, 
          reason: 'Messaging is locked until your booking is confirmed by the teacher.'
        };
      }

      return { canSend: true };
    } catch (error) {
      console.error('Error in canSendMessage:', error);
      return { canSend: false, reason: 'Error checking permissions' };
    }
  }

  /**
   * Send a message in a conversation.
   * Supports optional file attachment (image or PDF).
   * Note: RLS policy enforces that messages can only be sent in approved conversations.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    senderType: 'student' | 'teacher',
    content: string,
    file?: { url: string; name: string; type: 'image' | 'pdf' | 'document'; sizeBytes: number }
  ): Promise<{ message: Message | null; error: any }> {
    try {
      console.log('📤 Sending message:', { conversationId, senderId, senderType, contentLength: content?.length, hasFile: !!file });
      
      // Check if can send
      const { canSend, reason } = await this.canSendMessage(conversationId, senderType);
      
      if (!canSend) {
        console.log('❌ Cannot send message:', reason);
        return { message: null, error: { message: reason } };
      }

      // Prepare message data
      const messageData: any = {
        conversation_id: conversationId,
        sender_id: senderId,
        sender_type: senderType,
        content: content?.trim() || null,
      };

      if (file) {
        messageData.file_url = file.url;
        messageData.file_name = file.name;
        messageData.file_type = file.type;
        messageData.file_size_bytes = file.sizeBytes;
      }
      
      console.log('📝 Message data:', messageData);

      // Send message
      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error sending message:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return { message: null, error };
      }

      if (!data) {
        console.error('❌ No data returned after insert');
        return { message: null, error: { message: 'Message not saved' } };
      }

      // If teacher sent message, auto-approve conversation
      if (senderType === 'teacher') {
        await this.approveConversation(conversationId);
      }

      console.log('✅ Message sent successfully:', data.id);
      return { message: data, error: null };
    } catch (error) {
      console.error('❌ Exception in sendMessage:', error);
      return { message: null, error };
    }
  }

  /**
   * Approve a conversation (teacher accepts inquiry)
   */
  async approveConversation(conversationId: string): Promise<{ success: boolean; error: any }> {
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('is_approved', false); // Only update if not already approved

      if (error) {
        console.error('Error approving conversation:', error);
        return { success: false, error };
      }

      console.log('✅ Conversation approved:', conversationId);
      return { success: true, error: null };
    } catch (error) {
      console.error('Error in approveConversation:', error);
      return { success: false, error };
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    conversationId: string,
    userId: string
  ): Promise<{ count: number; error: any }> {
    try {
      const { data, error } = await supabase.rpc('mark_messages_as_read', {
        p_conversation_id: conversationId,
        p_user_id: userId,
      });

      if (error) {
        console.error('Error marking messages as read:', error);
        return { count: 0, error };
      }

      console.log(`✅ Marked ${data} messages as read`);
      return { count: data || 0, error: null };
    } catch (error) {
      console.error('Error in markMessagesAsRead:', error);
      return { count: 0, error };
    }
  }

  /**
   * Get total unread count for a user
   */
  async getUnreadCount(
    userId: string,
    userType: 'student' | 'teacher'
  ): Promise<{ count: number; error: any }> {
    try {
      let query = supabase.from('conversations').select('*', { count: 'exact', head: false });

      if (userType === 'student') {
        // Get student's conversations with unread messages
        const { data: studentData } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (!studentData) {
          return { count: 0, error: null };
        }

        const { data, error } = await supabase
          .from('conversations')
          .select('unread_count_student')
          .eq('student_id', studentData.id);

        if (error) {
          return { count: 0, error };
        }

        const total = data?.reduce((sum, conv) => sum + (conv.unread_count_student || 0), 0) || 0;
        return { count: total, error: null };
      } else {
        // Get teacher's conversations with unread messages
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (!teacherData) {
          return { count: 0, error: null };
        }

        const { data, error } = await supabase
          .from('conversations')
          .select('unread_count_teacher')
          .eq('teacher_id', teacherData.id);

        if (error) {
          return { count: 0, error };
        }

        const total = data?.reduce((sum, conv) => sum + (conv.unread_count_teacher || 0), 0) || 0;
        return { count: total, error: null };
      }
    } catch (error) {
      console.error('Error in getUnreadCount:', error);
      return { count: 0, error };
    }
  }

  /**
   * Delete a conversation (soft delete - just clear messages)
   */
  async deleteConversation(conversationId: string): Promise<{ success: boolean; error: any }> {
    try {
      // Delete all messages in the conversation
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      if (messagesError) {
        console.error('Error deleting messages:', messagesError);
        return { success: false, error: messagesError };
      }

      // Delete the conversation
      const { error: conversationError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (conversationError) {
        console.error('Error deleting conversation:', conversationError);
        return { success: false, error: conversationError };
      }

      console.log('✅ Conversation deleted:', conversationId);
      return { success: true, error: null };
    } catch (error) {
      console.error('Error in deleteConversation:', error);
      return { success: false, error };
    }
  }
}

// Export singleton instance
export const messagingService = new MessagingService();
