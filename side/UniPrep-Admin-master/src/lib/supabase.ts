import { createClient } from '@supabase/supabase-js';

// Get environment variables with validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Environment validation (only log errors, not sensitive info)

// Validate required environment variables
if (!supabaseUrl) {
  const error = 'Missing NEXT_PUBLIC_SUPABASE_URL environment variable. Check your .env file!';
  console.error('❌', error);
  throw new Error(error);
}

if (!supabaseAnonKey) {
  const error = 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. Check your .env file!';
  console.error('❌', error);
  throw new Error(error);
}

// Supabase client for client-side operations with session persistence
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);

// Supabase client with service role for server-side operations
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : supabase; // Fallback to regular client if service key not provided

// Helper to check if user is admin
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', userId)
    .single();

  if (error || !data) return false;
  return data.user_type === 'admin';
}

// Helper to get current admin user
export async function getCurrentAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const isAdminUser = await isAdmin(user.id);
  if (!isAdminUser) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}
