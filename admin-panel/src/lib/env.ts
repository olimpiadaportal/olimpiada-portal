// Client-safe Supabase environment values for the Admin Panel.
// Only the project URL and anon (public) key are read here. The service role key
// is server-only and is intentionally NOT read in this shared module (it must
// never reach the browser bundle). It will be read directly in server-only code
// in a later stage.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
