import {
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveGoalsProvider } from './src/context/ActiveGoalsContext';
import { QuestProgressProvider } from './src/context/QuestProgressContext';
import { RootStack } from './src/navigation/RootStack';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeProvider';

function AppNavigation() {
  const { colors, mode } = useAppTheme();

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
          <ActiveGoalsProvider>
            <QuestProgressProvider>
              <AppNavigation />
            </QuestProgressProvider>
          </ActiveGoalsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
