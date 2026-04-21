import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useQuestProgress } from '../context/QuestProgressContext';
import { supabase } from '../lib/supabase';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

import { BronzeRankIcon } from '../components/ranks/BronzeRankIcon';
import type { ProfileStackParamList } from '../navigation/profileStackTypes';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>;

export function ProfileScreen({ navigation }: Props) {
  const { colors, mode } = useAppTheme();
  const { lifetimeQuestPoints, questsCompletedCount } = useQuestProgress();
  const { goals } = useActiveGoals();
  const goalsCompletedCount = goals.filter((g) => g.completed).length;
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const onLogOut = async () => {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setLogoutError(error.message);
      }
    } finally {
      setLoggingOut(false);
    }
  };

  const glowOuterOpacity = mode === 'dark' ? 0.22 : 0.12;
  const glowInnerOpacity = mode === 'dark' ? 0.35 : 0.18;

  return (
    <Screen>
      <View style={styles.centerColumn}>
        <View style={styles.hero}>
          <View
            style={[
              styles.glowOuter,
              {
                backgroundColor: `rgba(234, 88, 12, ${glowOuterOpacity})`,
              },
            ]}
          />
          <View
            style={[
              styles.glowInner,
              {
                backgroundColor: `rgba(251, 146, 60, ${glowInnerOpacity})`,
              },
            ]}
          />
          <BronzeRankIcon size={200} />
        </View>

        <Text style={[styles.displayName, { color: colors.text }]}>Alex Runner</Text>
        <Text style={[styles.points, { color: colors.textSecondary }]}>
          {lifetimeQuestPoints.toLocaleString()}
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Account info
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
          <Text style={[styles.fieldValue, { color: colors.text }]}>alex@example.com</Text>

          <View style={styles.statsRow}>
            <View style={styles.statColumn}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign: 'center' }]}>
                Quests completed
              </Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{questsCompletedCount}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statColumn}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, textAlign: 'center' }]}>
                Goals completed
              </Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{goalsCompletedCount}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
            Account sync and medals will arrive with Supabase in a later step.
          </Text>

          {logoutError ? (
            <Text style={styles.logoutError} accessibilityLiveRegion="polite">
              {logoutError}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => navigation.navigate('Settings')}
            disabled={loggingOut}
            style={({ pressed }) => [
              styles.settingsButton,
              {
                borderColor: colors.primary,
                backgroundColor: colors.surfaceElevated,
              },
              (pressed || loggingOut) && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.settingsLabel, { color: colors.primary }]}>
              Settings
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={() => void onLogOut()}
            disabled={loggingOut}
            style={({ pressed }) => [
              styles.logoutButton,
              {
                borderColor: '#ef4444',
                backgroundColor: colors.surfaceElevated,
              },
              (pressed || loggingOut) && { opacity: 0.85 },
            ]}
          >
            {loggingOut ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={styles.logoutLabel}>Log out</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerColumn: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  hero: {
    width: 220,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  glowOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  glowInner: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  displayName: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  points: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  fieldValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.lg,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  footerNote: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
    marginBottom: spacing.md,
  },
  logoutError: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    color: '#ef4444',
  },
  settingsButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  settingsLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  logoutButton: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  logoutLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ef4444',
  },
});
