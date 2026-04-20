import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { mockActiveGoals } from '../data/mockGoal';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Nav = NativeStackNavigationProp<GoalsStackParamList, 'GoalList'>;

export function GoalListScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<Nav>();

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Active goals</Text>
      {mockActiveGoals.map((item) => (
        <Pressable
          key={item.id}
          onPress={() =>
            navigation.navigate('GoalDetail', { goalId: item.id })
          }
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.rowText}>
            <Text style={[styles.title, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text
              style={[styles.subtitle, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>
            ›
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add goal"
        onPress={() => {}}
        style={({ pressed }) => [
          styles.addGoalButton,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        <Text style={[styles.addGoalLabel, { color: colors.primary }]}>
          Add goal
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  addGoalLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
});
