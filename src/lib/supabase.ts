import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

function getSupabaseConfig(): { url: string; anonKey: string } {
  const urlFromEnv =
    typeof process.env.EXPO_PUBLIC_SUPABASE_URL === 'string'
      ? process.env.EXPO_PUBLIC_SUPABASE_URL.trim()
      : '';
  const keyFromEnv =
    typeof process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string'
      ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim()
      : '';

  const extra = Constants.expoConfig?.extra;
  const fromExtra =
    extra && typeof extra === 'object' && extra !== null
      ? (extra as { supabaseUrl?: unknown; supabaseAnonKey?: unknown })
      : undefined;
  const urlFromExtra =
    typeof fromExtra?.supabaseUrl === 'string'
      ? fromExtra.supabaseUrl.trim()
      : '';
  const keyFromExtra =
    typeof fromExtra?.supabaseAnonKey === 'string'
      ? fromExtra.supabaseAnonKey.trim()
      : '';

  const url = urlFromEnv || urlFromExtra;
  const anonKey = keyFromEnv || keyFromExtra;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env and restart Expo.',
    );
  }

  return { url, anonKey };
}

const { url, anonKey } = getSupabaseConfig();

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
