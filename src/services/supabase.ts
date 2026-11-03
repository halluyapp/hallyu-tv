import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

/**
 * Supabase control-plane client (Rork Auth mode).
 * The Rork Auth JWT is fed via the accessToken callback so RLS `user_id()`
 * policies apply. No Supabase auth session is used.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than silently at query time.
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl ?? "https://invalid.invalid", supabaseAnonKey ?? "invalid", {
  auth: { persistSession: false },
  accessToken: async () => SecureStore.getItemAsync("access_token"),
});
