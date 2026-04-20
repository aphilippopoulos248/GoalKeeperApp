import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_OPTIONS: {
  id: Difficulty;
  label: string;
}[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export function SettingsScreen() {
  const { colors, mode, setMode } = useAppTheme();
  const dark = mode === 'dark';
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [difficultyModalOpen, setDifficultyModalOpen] = useState(false);

  const difficultyLabel =
    DIFFICULTY_OPTIONS.find((o) => o.id === difficulty)?.label ?? 'Medium';

  return (
    <Screen>
      <View style={styles.stack}>
        <View
          style={[
            styles.row,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Dark mode is the default. Toggle for light mode.
            </Text>
          </View>
          <Switch
            value={dark}
            onValueChange={(on) => setMode(on ? 'dark' : 'light')}
            trackColor={{ false: colors.border, true: colors.primaryMuted }}
            thumbColor={dark ? colors.primary : '#f4f4f5'}
          />
        </View>

        <View
          style={[
            styles.row,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]}>Difficulty</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Daily quests complete at 50% (Easy), 75% (Medium), or 100% (Hard).
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Difficulty, ${difficultyLabel}. Opens menu.`}
            accessibilityState={{ expanded: difficultyModalOpen }}
            onPress={() => setDifficultyModalOpen(true)}
            style={({ pressed }) => [
              styles.difficultyTrigger,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={[styles.difficultyTriggerText, { color: colors.text }]}>
              {difficultyLabel}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={difficultyModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDifficultyModalOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
            onPress={() => setDifficultyModalOpen(false)}
          />
          <View
            style={[
              styles.modalPanel,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            {DIFFICULTY_OPTIONS.map((opt, index) => {
              const selected = opt.id === difficulty;
              const isLast = index === DIFFICULTY_OPTIONS.length - 1;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setDifficulty(opt.id);
                    setDifficultyModalOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalOption,
                    !isLast && [
                      styles.modalOptionBorder,
                      { borderBottomColor: colors.border },
                    ],
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.modalOptionLabel, { color: colors.text }]}>
                    {opt.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={22} color={colors.primary} />
                  ) : (
                    <View style={styles.modalOptionCheckSpacer} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
  },
  difficultyTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 112,
    justifyContent: 'space-between',
  },
  difficultyTriggerText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalPanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  modalOptionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOptionCheckSpacer: {
    width: 22,
    height: 22,
  },
});
