// Supabase type helpers to avoid 'never' type issues
export type SupabaseInsert<T = Record<string, unknown>> = T
export type SupabaseUpdate<T = Record<string, unknown>> = Partial<T>
export type SupabaseUpsert<T = Record<string, unknown>> = T
