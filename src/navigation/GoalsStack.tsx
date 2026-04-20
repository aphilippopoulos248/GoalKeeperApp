import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddGoalScreen } from '../screens/AddGoalScreen';
import { GoalDetailScreen } from '../screens/GoalDetailScreen';
import { GoalListScreen } from '../screens/GoalListScreen';
import { GoalsStackParamList } from './goalsStackTypes';

const Stack = createNativeStackNavigator<GoalsStackParamList>();

export function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GoalList" component={GoalListScreen} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
    </Stack.Navigator>
  );
}
