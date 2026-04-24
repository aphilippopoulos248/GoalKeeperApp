const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const appJson = require('./app.json');

/**
 * Loads keys from `.env` in Node (config phase) and exposes them in `extra` so
 * the native app can read them via expo-constants when Metro does not inline
 * `process.env` as expected (OpenAI, Supabase, Spoonacular, RapidAPI).
 *
 * EAS Build: set the same `EXPO_PUBLIC_*` vars in the Expo project (env/secrets)
 * so cloud builds embed Supabase and other keys.
 */
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      eas: {
        projectId: 'f3b5eabe-81c1-481e-8280-ab089bef92a4',
      },
      openAiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      spoonacularApiKey: process.env.EXPO_PUBLIC_SPOONACULAR_API_KEY ?? '',
      rapidApiKey: process.env.EXPO_PUBLIC_RAPIDAPI_KEY ?? '',
    },
  },
};
