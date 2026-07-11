// The single Supabase client (anon key + user JWT + RLS). The service-role key
// never exists in this app; privileged flows go through the web BFF (api.ts).
import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { secureSessionStorage } from "./secureStorage";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureSessionStorage,
    storageKey: "olympiq-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js only refreshes tokens while told the app is active.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
