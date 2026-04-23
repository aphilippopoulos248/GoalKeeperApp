import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddGoalScreen } from '../screens/AddGoalScreen';
import { GoalDetailScreen } from '../screens/GoalDetailScreen';
import { GoalListScreen } from '../screens/GoalListScreen';
import { MilestoneExplainScreen } from '../screens/MilestoneExplainScreen';
import { NewGoalRevealScreen } from '../screens/NewGoalRevealScreen';
import { GoalsStackParamList } from './goalsStackTypes';

const Stack = createNativeStackNavigator<GoalsStackParamList>();

export function GoalsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GoalList" component={GoalListScreen} />
      <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
      <Stack.Screen name="AddGoal" component={AddGoalScreen} />
      <Stack.Screen
        name="NewGoalReveal"
        component={NewGoalRevealScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="MilestoneExplain"
        component={MilestoneExplainScreen}
        options={{ animation: 'fade' }}
      />
    </Stack.Navigator>
  );
}
