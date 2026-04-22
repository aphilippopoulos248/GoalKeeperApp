import {
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useEffect } from 'react';

import { ActiveGoalsProvider } from './src/context/ActiveGoalsContext';
import { AuthUserProvider } from './src/context/AuthUserContext';
import { QuestProgressProvider } from './src/context/QuestProgressContext';
import { initProgressReflectionNotificationHandler } from './src/lib/progressReflectionNotifications';
import { RootStack } from './src/navigation/RootStack';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeProvider';

function AppNavigation() {
  const { colors, mode } = useAppTheme();

  useEffect(() => {
    initProgressReflectionNotificationHandler();
  }, []);

  const navTheme: Theme = {
    dark: mode === 'dark',
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
    fonts: DefaultTheme.fonts,
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthUserProvider>
            <ActiveGoalsProvider>
              <QuestProgressProvider>
                <AppNavigation />
              </QuestProgressProvider>
            </ActiveGoalsProvider>
          </AuthUserProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
