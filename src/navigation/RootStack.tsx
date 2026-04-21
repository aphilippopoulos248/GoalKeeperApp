import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/LoginScreen';
import { RootTabs, type RootTabParamList } from './RootTabs';

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Main" component={RootTabs} />
    </Stack.Navigator>
  );
}
