const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const appJson = require('./app.json');

/**
 * Loads EXPO_PUBLIC_OPENAI_API_KEY from `.env` in Node (config phase) and exposes
 * it in `extra` so the native app can read it via expo-constants even when
 * Metro does not inline `process.env` as expected.
 */
module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      openAiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
    },
  },
};
