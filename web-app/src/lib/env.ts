// Client-safe Supabase environment values.
// Only the project URL and the anon (public) key are read here — both are safe to
// expose to the browser. The service role key must NEVER be referenced in this app.
//
// Values are read leniently (empty string when unset) so the skeleton can still
// build/run before `.env.local` is filled; the UI surfaces a clear "not configured"
// state instead of crashing.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
