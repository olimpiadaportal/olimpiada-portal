// Public runtime config. EXPO_PUBLIC_* values are compiled into the JS bundle —
// ONLY the Supabase URL, the anon key and the BFF origin may ever live here.
// The service-role key never exists in this app in any form.

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const bffUrl = (process.env.EXPO_PUBLIC_BFF_URL ?? "").replace(/\/+$/, "");

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
export const isBffConfigured = bffUrl.length > 0;
