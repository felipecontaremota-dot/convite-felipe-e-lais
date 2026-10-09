import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { authStorage } from "../storage/driver";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const eventId =
  process.env.EXPO_PUBLIC_EVENT_ID || "00000000-0000-4000-8000-000000000001";
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
export const demoEnabled =
  __DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === "true";
