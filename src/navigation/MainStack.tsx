import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { QuestAssistScreen } from '../screens/QuestAssistScreen';
import { useAppTheme } from '../theme/ThemeProvider';
import { RootTabs } from './RootTabs';

export type MainStackParamList = {
  RootTabs: undefined;
  QuestAssist: { goalId: string; questId: string };
};

const NativeStack = createNativeStackNavigator<MainStackParamList>();

export function MainAppStack() {
  const { colors } = useAppTheme();

  return (
    <NativeStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <NativeStack.Screen name="RootTabs" component={RootTabs} />
      <NativeStack.Screen
        name="QuestAssist"
        component={QuestAssistScreen}
        options={{
          animation: 'fade',
        }}
      />
    </NativeStack.Navigator>
  );
}
