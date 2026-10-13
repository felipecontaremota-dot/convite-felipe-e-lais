import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { authStorage } from "../storage/driver";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const eventId = (process.env.EXPO_PUBLIC_EVENT_ID || "").toLowerCase();
if (url && key && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(eventId))
  throw new Error("Configure EXPO_PUBLIC_EVENT_ID para este ambiente.");
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
