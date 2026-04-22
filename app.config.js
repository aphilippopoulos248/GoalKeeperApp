const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const appJson = require('./app.json');

/**
 * Loads keys from `.env` in Node (config phase) and exposes them in `extra` so
 * the native app can read them via expo-constants when Metro does not inline
 * `process.env` as expected (OpenAI, Supabase, Spoonacular).
 */
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      openAiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      spoonacularApiKey: process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY ?? '',
    },
  },
};
