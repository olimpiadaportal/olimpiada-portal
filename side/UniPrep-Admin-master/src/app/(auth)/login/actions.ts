'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;


  // Get client IP for rate limiting
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const ipAddress = forwardedFor?.split(',')[0] || realIp || null;
  const userAgent = headersList.get('user-agent') || null;

  // Step 1: Check rate limiting
  const { data: rateLimitData, error: rateLimitError } = await supabase.rpc('check_login_allowed', {
    p_email: email,
    p_ip_address: ipAddress,
  });


  // If rate limit check succeeds and login is not allowed
  if (!rateLimitError && rateLimitData) {
    const result = rateLimitData[0] || rateLimitData;
    if (result && !result.allowed) {
      return { 
        error: result.reason || 'Too many login attempts. Please try again later.',
        retryAfter: result.retry_after_seconds,
      };
    }
  }

  // Step 2: Sign in with Supabase
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });


  if (authError) {
    // Log failed attempt
    await supabase.rpc('log_login_attempt', {
      p_email: email,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_success: false,
      p_failure_reason: authError.message,
    });
    return { error: authError.message };
  }

  if (!authData.user) {
    await supabase.rpc('log_login_attempt', {
      p_email: email,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_success: false,
      p_failure_reason: 'No user returned',
    });
    return { error: 'No user returned from authentication' };
  }

  // Step 3: Verify user is an admin
  const { data: adminData, error: adminError } = await supabase
    .from('admins')
    .select('id, role, is_active')
    .eq('user_id', authData.user.id)
    .eq('is_active', true)
    .single();


  if (adminError || !adminData) {
    // Not an admin - sign out and log
    await supabase.auth.signOut();
    await supabase.rpc('log_login_attempt', {
      p_email: email,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_success: false,
      p_failure_reason: 'Not an admin',
    });
    return { error: 'Access denied. Admin privileges required.' };
  }

  // Step 4: Log successful login
  await supabase.rpc('log_login_attempt', {
    p_email: email,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
    p_success: true,
    p_failure_reason: null,
  });

  // Step 5: Check if MFA is required
  const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  

  // If user has MFA enabled but hasn't verified yet (AAL1 -> AAL2 required)
  if (mfaData?.nextLevel === 'aal2' && mfaData?.currentLevel === 'aal1') {
    // Return to client to show MFA verification
    return { requiresMFA: true };
  }

  // Success - revalidate and redirect
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
