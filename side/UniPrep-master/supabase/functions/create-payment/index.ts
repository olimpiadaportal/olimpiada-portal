// ============================================================
// create-payment — Phase 8B (Pay-After-Acceptance)
// ============================================================
// Creates a booking request WITHOUT immediate payment.
// Payment is only triggered AFTER teacher accepts the booking.
//
// Flow:
//   1. Validate JWT → get student user_id
//   2. Check bookings_paid flag in system_settings
//   3. Fetch teacher hourly/monthly rate → calculate estimated price
//   4. Create booking row with status='pending', payment_status='awaiting_acceptance'
//   5. Return { bookingId, estimatedPrice } to client (NO payment yet)
//
// Security:
//   - Price calculated server-side (client cannot manipulate)
//   - No payment collected until teacher accepts
//   - Prevents payment evasion (teacher can't see student contact until paid)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://auth.elmly.app',
  'https://www.elmly.app',
  'https://elmly.app',
  'https://uni-prep-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, req);
  }

  try {
    console.log('create-payment: Starting...');
    
    // ── 1. Auth ──────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401, req);

    // Extract the JWT token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'Invalid authorization format' }, 401, req);

    // Create admin client to verify the user - more reliable than anon client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('create-payment: Verifying user...');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error('Auth error:', authError?.message || 'No user found');
      return json({ error: 'Unauthorized', details: authError?.message }, 401, req);
    }
    console.log('create-payment: User verified:', user.id);

    console.log('create-payment: Fetching bookings_paid flag...');
    const { data: flagRow, error: flagError } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'bookings_paid')
      .single();

    if (flagError) {
      console.error('create-payment: Failed to fetch bookings_paid:', flagError);
    }

    // flagRow.value is JSONB — Supabase auto-parses it, but handle both cases
    const rawVal = flagRow?.value;
    const bookingsPaid = rawVal === true || rawVal === 'true' || (typeof rawVal === 'string' && JSON.parse(rawVal) === true);
    console.log('create-payment: bookingsPaid =', bookingsPaid);

    // ── 3. Parse request body ────────────────────────────────
    const body = await req.json();
    const {
      teacherId,
      subjectId,
      scheduledDate,
      scheduledTime,
      durationHours = 1.0,
      sessionMethod = 'online',
      serviceType = 'hourly',
      notes,
      location,
    } = body;

    console.log('create-payment: Request body:', JSON.stringify(body));

    if (!teacherId || !scheduledDate || !scheduledTime) {
      return json({ error: 'Missing required fields: teacherId, scheduledDate, scheduledTime' }, 400, req);
    }

    if (serviceType !== 'hourly') {
      return json({
        error: 'Monthly teacher access must use the recurring subscription flow.',
      }, 400, req);
    }

    // ── 4. Fetch student record ──────────────────────────────
    console.log('create-payment: Fetching student record for user:', user.id);
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (studentError) {
      console.error('create-payment: Student fetch error:', studentError);
    }
    if (!student) return json({ error: 'Student record not found' }, 404, req);
    console.log('create-payment: Student found:', student.id);

    // ── 5. Fetch teacher rate ────────────────────────────────
    console.log('create-payment: Fetching teacher:', teacherId);
    const { data: teacher, error: teacherError } = await supabaseAdmin
      .from('teachers')
      .select('id, user_id, hourly_rate, monthly_rate')
      .eq('id', teacherId)
      .single();

    if (teacherError) {
      console.error('create-payment: Teacher fetch error:', teacherError);
    }
    if (!teacher) return json({ error: 'Teacher not found' }, 404, req);
    console.log('create-payment: Teacher found:', teacher.id, 'hourly_rate:', teacher.hourly_rate);

    // ── 6. Calculate price (server-side, never trust client) ─
    let price = 0;
    if (bookingsPaid) {
      if (teacher.hourly_rate) {
        price = Number(teacher.hourly_rate) * Number(durationHours);
      }
      // Round to 2 decimal places
      price = Math.round(price * 100) / 100;
    }

    // ── 7. Fetch currency ────────────────────────────────────
    const { data: currencyRow } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'currency')
      .single();
    const rawCurrency = currencyRow?.value;
    const currency = (typeof rawCurrency === 'string' && rawCurrency.startsWith('"')
      ? JSON.parse(rawCurrency)
      : rawCurrency || 'eur'
    ).toString().toLowerCase();

    // ── 8. Create booking with awaiting_acceptance status ────
    // Pay-After-Acceptance: No payment is collected yet.
    // Payment will be triggered when teacher accepts the booking.
    const bookingData = {
      student_id: student.id,
      teacher_id: teacherId,
      subject_id: subjectId || null,
      status: 'pending',
      payment_status: bookingsPaid ? 'awaiting_acceptance' : 'free',
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      price: price,
      duration_hours: durationHours,
      session_method: sessionMethod,
      service_type: serviceType,
      notes: notes || null,
      location: location || null,
      student_user_id: user.id,
      teacher_user_id: teacher.user_id,
    };
    console.log('create-payment: Inserting booking:', JSON.stringify(bookingData));
    
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert(bookingData)
      .select()
      .single();
    
    console.log('create-payment: Booking insert result:', booking ? 'success' : 'failed', bookingError?.message);

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      
      // Provide user-friendly error messages based on error type
      let userMessage = 'Failed to create booking';
      let statusCode = 500;
      
      if (bookingError.code === '23505') {
        // Unique constraint violation - duplicate booking
        userMessage = 'You already have a pending or active booking with this teacher for this date and time. Please choose a different time slot.';
        statusCode = 409; // Conflict
      } else if (bookingError.code === '23503') {
        // Foreign key violation
        userMessage = 'Invalid teacher or subject selected. Please try again.';
        statusCode = 400;
      } else if (bookingError.code === '23514') {
        // Check constraint violation
        userMessage = 'Invalid booking details. Please check your selection and try again.';
        statusCode = 400;
      }
      
      return json({ 
        error: userMessage, 
        details: bookingError.message,
        code: bookingError.code,
        hint: bookingError.hint 
      }, statusCode, req);
    }

    // ── 9. Notify teacher about new booking request ──────────
    // Wrapped in try-catch to prevent notification failure from breaking booking flow
    try {
      const { data: studentProfile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const { data: subjectData } = await supabaseAdmin
        .from('subjects')
        .select('name_en')
        .eq('id', subjectId)
        .single();

      if (teacher.user_id) {
        const { error: notifError } = await supabaseAdmin.rpc('queue_payment_notification', {
          p_user_id: teacher.user_id,
          p_notification_type: 'new_booking_request',
          p_title: '📚 New Booking Request',
          p_body: `${studentProfile?.full_name || 'A student'} has requested a ${subjectData?.name_en || ''} session on ${scheduledDate}.`,
          p_data: {
            type: 'booking',
            bookingId: booking.id,
            studentName: studentProfile?.full_name || 'A student',
            subjectName: subjectData?.name_en || 'session',
            scheduledDate: scheduledDate,
            scheduledTime: scheduledTime,
          },
          p_channels: ['push', 'in_app'],
          p_priority: 8,
        });
        if (notifError) {
          console.warn('Teacher notification failed (non-blocking):', notifError.message);
        }
      }
    } catch (notifErr) {
      // Non-blocking: log but don't fail the booking
      console.warn('Teacher notification error (non-blocking):', notifErr);
    }

    // ── 10. Return booking info (NO payment yet) ──────────────
    // Payment will be triggered via capture-booking-payment when teacher accepts
    return json({
      bookingId: booking.id,
      estimatedPrice: price,
      currency,
      paymentRequired: bookingsPaid && price > 0,
      message: bookingsPaid && price > 0
        ? 'Booking request created. Payment will be required after teacher accepts.'
        : 'Booking request created. No payment required.',
    }, 200, req);

  } catch (err) {
    console.error('create-payment error:', err);
    return json({ error: 'Internal server error' }, 500, req);
  }
});
