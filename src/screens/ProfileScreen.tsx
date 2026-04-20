import { Image, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

const shieldAsset = require('../../assets/profile-shield.png');

export function ProfileScreen() {
  const { colors, mode } = useAppTheme();
  const { lifetimeQuestPoints } = useQuestProgress();

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
          <Image source={shieldAsset} style={styles.shield} resizeMode="contain" />
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
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
            Account sync and medals will arrive with Supabase in a later step.
          </Text>
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
  shield: {
    width: 200,
    height: 200,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  footerNote: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
  },
});
