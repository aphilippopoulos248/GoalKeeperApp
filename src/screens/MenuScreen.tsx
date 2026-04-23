import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Picker } from '@react-native-picker/picker';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AttachedRecipeModal } from '../components/AttachedRecipeModal';
import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestRow } from '../components/QuestRow';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useAuthUser } from '../context/AuthUserContext';
import {
  DailyQuestEntry,
  useQuestProgress,
} from '../context/QuestProgressContext';
import type { MainStackParamList } from '../navigation/MainStack';
import type { RootTabParamList } from '../navigation/RootTabs';
import type { AssistFullRecipe } from '../services/spoonacularRecipes';
import type { GoalPriority } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import {
  clearAttachedExercise,
  loadAllAttachedExercises,
  type QuestAttachedExerciseMap,
} from '../lib/questAttachedExerciseStorage';
import {
  loadAllAttachedRecipes,
  type QuestAttachedRecipeMap,
} from '../lib/questAttachedRecipeStorage';
import {
  dailyQuestCountForPriority,
  parseGoalPriority,
} from '../utils/goalPriority';

type DailyQuestSortMode = 'recommended' | 'goal' | 'priority';

type MenuQuestSection = {
  key: 'active' | 'completed';
  data: DailyQuestEntry[];
};

const DEBUG_NARRATIVE_ALERT_MAX = 4000;
/** Per-section cap so combined alert text stays readable on device alerts. */
const DEBUG_JOURNAL_SECTION_MAX = 2200;
const ADMIN_PANEL_EMAIL = 'admin@example.com';

type MenuScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Menu'>,
  NativeStackNavigationProp<MainStackParamList>
>;

function truncateForDebugAlert(s: string, max = DEBUG_NARRATIVE_ALERT_MAX): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function dayOrderValue(quest: DailyQuestEntry['quest']): number {
  return typeof quest.dayOrder === 'number' && Number.isFinite(quest.dayOrder)
    ? quest.dayOrder
    : 500;
}

function prioritySortRank(p: GoalPriority): number {
  switch (p) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'low':
      return 2;
    default:
      return 1;
  }
}

export function MenuScreen() {
  const { colors } = useAppTheme();
  const { userEmail, userId } = useAuthUser();
  const showAdminPanel = userEmail === ADMIN_PANEL_EMAIL;
  const navigation = useNavigation<MenuScreenNavigation>();
  const route = useRoute<RouteProp<RootTabParamList, 'Menu'>>();
  const listRef = useRef<SectionList<DailyQuestEntry, MenuQuestSection>>(null);
  const {
    goals,
    refreshAllDailyQuestsForDebug,
    submitProgressJournal,
    clearAiProgressMemory,
    advanceSimulationDay,
    fetchJournalDebugSnapshot,
  } = useActiveGoals();
  const [sortMode, setSortMode] = useState<DailyQuestSortMode>('recommended');
  const [debugRefreshingQuests, setDebugRefreshingQuests] = useState(false);
  const [debugJournalText, setDebugJournalText] = useState('');
  const [debugJournalSaving, setDebugJournalSaving] = useState(false);
  const [debugJournalViewLoading, setDebugJournalViewLoading] = useState(false);
  const [debugClearingAiMemory, setDebugClearingAiMemory] = useState(false);
  const [debugAdvancingDay, setDebugAdvancingDay] = useState(false);
  const [attachedByQuest, setAttachedByQuest] = useState<QuestAttachedRecipeMap>({});
  const [attachedExerciseByQuest, setAttachedExerciseByQuest] =
    useState<QuestAttachedExerciseMap>({});
  const [attachedRecipeViewer, setAttachedRecipeViewer] = useState<AssistFullRecipe | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setAttachedByQuest({});
        setAttachedExerciseByQuest({});
        return;
      }
      void (async () => {
        const recipes = await loadAllAttachedRecipes(userId);
        let exercises = await loadAllAttachedExercises(userId);
        for (const gid of Object.keys(recipes)) {
          const rq = recipes[gid];
          const eq = exercises[gid];
          if (!rq || !eq) continue;
          for (const qid of Object.keys(rq)) {
            if (qid in eq) await clearAttachedExercise(userId, gid, qid);
          }
        }
        exercises = await loadAllAttachedExercises(userId);
        setAttachedByQuest(recipes);
        setAttachedExerciseByQuest(exercises);
      })();
    }, [userId]),
  );
  const {
    completed,
    toggleQuest,
    streak,
    pointsToday,
    dailyQuestEntries,
  } = useQuestProgress();

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.completed),
    [goals],
  );

  const goalMeta = useMemo(() => {
    const m = new Map<string, { index: number; priority: GoalPriority }>();
    activeGoals.forEach((g, i) => {
      m.set(g.id, { index: i, priority: parseGoalPriority(g.priority) });
    });
    return m;
  }, [activeGoals]);

  const displayedDailyQuestEntries = useMemo((): DailyQuestEntry[] => {
    if (sortMode === 'recommended') {
      return dailyQuestEntries;
    }
    const copy = [...dailyQuestEntries];
    const metaFor = (goalId: string) =>
      goalMeta.get(goalId) ?? { index: 999, priority: 'medium' as GoalPriority };

    if (sortMode === 'goal') {
      copy.sort((a, b) => {
        const ai = metaFor(a.goalId).index;
        const bi = metaFor(b.goalId).index;
        if (ai !== bi) return ai - bi;
        const d = dayOrderValue(a.quest) - dayOrderValue(b.quest);
        if (d !== 0) return d;
        return a.quest.id.localeCompare(b.quest.id);
      });
      return copy;
    }

    copy.sort((a, b) => {
      const am = metaFor(a.goalId);
      const bm = metaFor(b.goalId);
      const pr = prioritySortRank(am.priority) - prioritySortRank(bm.priority);
      if (pr !== 0) return pr;
      if (am.index !== bm.index) return am.index - bm.index;
      const d = dayOrderValue(a.quest) - dayOrderValue(b.quest);
      if (d !== 0) return d;
      return a.quest.id.localeCompare(b.quest.id);
    });
    return copy;
  }, [dailyQuestEntries, goalMeta, sortMode]);

  const displayedDailyQuests = useMemo(
    () => displayedDailyQuestEntries.map((e) => e.quest),
    [displayedDailyQuestEntries],
  );

  const incompleteDisplayedEntries = useMemo(
    () => displayedDailyQuestEntries.filter((e) => !completed[e.quest.id]),
    [displayedDailyQuestEntries, completed],
  );

  const completedDisplayedEntries = useMemo(
    () => displayedDailyQuestEntries.filter((e) => !!completed[e.quest.id]),
    [displayedDailyQuestEntries, completed],
  );

  const menuQuestSections = useMemo((): MenuQuestSection[] => {
    const sections: MenuQuestSection[] = [
      { key: 'active', data: incompleteDisplayedEntries },
    ];
    if (completedDisplayedEntries.length > 0) {
      sections.push({ key: 'completed', data: completedDisplayedEntries });
    }
    return sections;
  }, [incompleteDisplayedEntries, completedDisplayedEntries]);

  const awaitingAiQuests = useMemo(
    () =>
      goals.some((g) => {
        if (g.completed) return false;
        const expected = dailyQuestCountForPriority(g.priority ?? 'medium');
        return (g.dailyQuests?.length ?? 0) < expected;
      }),
    [goals],
  );

  const showDailyLoading = awaitingAiQuests && dailyQuestEntries.length === 0;

  const clearFocusParam = useCallback(() => {
    navigation.setParams({ focusQuestId: undefined });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      const id = route.params?.focusQuestId;
      if (!id) return undefined;

      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        const iActive = incompleteDisplayedEntries.findIndex((e) => e.quest.id === id);
        const iDone = completedDisplayedEntries.findIndex((e) => e.quest.id === id);
        if (iActive < 0 && iDone < 0) {
          if (!showDailyLoading) {
            clearFocusParam();
          }
          return;
        }
        try {
          if (iActive >= 0) {
            listRef.current?.scrollToLocation({
              sectionIndex: 0,
              itemIndex: iActive,
              animated: true,
              viewPosition: 0.12,
            });
          } else if (completedDisplayedEntries.length > 0) {
            listRef.current?.scrollToLocation({
              sectionIndex: 1,
              itemIndex: iDone,
              animated: true,
              viewPosition: 0.12,
            });
          }
        } catch {
          /* list not measured yet */
        }
        clearFocusParam();
      };

      const t = setTimeout(run, 120);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }, [
      clearFocusParam,
      completedDisplayedEntries,
      incompleteDisplayedEntries,
      route.params?.focusQuestId,
      showDailyLoading,
    ]),
  );

  const onDebugRefreshQuests = useCallback(() => {
    if (activeGoals.length === 0) {
      return;
    }
    void (async () => {
      setDebugRefreshingQuests(true);
      try {
        await refreshAllDailyQuestsForDebug();
      } catch (e) {
        const message =
          e instanceof Error && e.message.trim() ? e.message : 'Quest refresh failed.';
        Alert.alert('Debug refresh', message, [{ text: 'OK' }]);
      } finally {
        setDebugRefreshingQuests(false);
      }
    })();
  }, [activeGoals.length, refreshAllDailyQuestsForDebug]);

  const onDebugSaveJournal = useCallback(() => {
    const trimmed = debugJournalText.trim();
    if (!trimmed) {
      Alert.alert('Debug journal', 'Enter some text to share with the AI.', [{ text: 'OK' }]);
      return;
    }
    void (async () => {
      setDebugJournalSaving(true);
      try {
        const res = await submitProgressJournal(trimmed, 'debug_menu');
        if (!res.ok) {
          Alert.alert('Debug journal', res.error ?? 'Save failed.', [{ text: 'OK' }]);
          return;
        }
        setDebugJournalText('');
        Alert.alert(
          'Debug journal',
          `Saved. Daily quests were updated in place where possible.\n\n--- AI narrative (debug) ---\n\n${truncateForDebugAlert(res.narrative)}`,
          [{ text: 'OK' }],
        );
      } finally {
        setDebugJournalSaving(false);
      }
    })();
  }, [debugJournalText, submitProgressJournal]);

  const onDebugViewJournal = useCallback(() => {
    void (async () => {
      setDebugJournalViewLoading(true);
      try {
        const snap = await fetchJournalDebugSnapshot();
        if (!snap.ok) {
          Alert.alert('Debug journal', snap.error, [{ text: 'OK' }]);
          return;
        }
        const plannerBlock = snap.plannerContext
          ? truncateForDebugAlert(snap.plannerContext, DEBUG_JOURNAL_SECTION_MAX)
          : '(empty)';
        const rawBlock = truncateForDebugAlert(snap.rawJournalLines, DEBUG_JOURNAL_SECTION_MAX);
        Alert.alert(
          'Debug journal',
          [
            `Simulated day: ${snap.simulationDay}`,
            '',
            '--- AI planner context (in-memory) ---',
            plannerBlock,
            '',
            `--- Raw journal entries (${snap.entryCount}) ---`,
            rawBlock,
          ].join('\n'),
          [{ text: 'OK' }],
        );
      } finally {
        setDebugJournalViewLoading(false);
      }
    })();
  }, [fetchJournalDebugSnapshot]);

  const onDebugClearAiMemory = useCallback(() => {
    Alert.alert(
      'Clear AI progress memory',
      'This deletes all saved progress journal entries. The quest AI will not see your past notes until you add new ones.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDebugClearingAiMemory(true);
              try {
                const res = await clearAiProgressMemory();
                if (!res.ok) {
                  Alert.alert('Clear AI memory', res.error ?? 'Request failed.', [{ text: 'OK' }]);
                  return;
                }
                Alert.alert('Clear AI memory', 'Journal cleared. The AI has no stored progress context.', [
                  { text: 'OK' },
                ]);
              } finally {
                setDebugClearingAiMemory(false);
              }
            })();
          },
        },
      ],
    );
  }, [clearAiProgressMemory]);

  const onDebugAdvanceSimulatedDay = useCallback(() => {
    if (activeGoals.length === 0) {
      return;
    }
    Alert.alert(
      'Advance simulated day',
      'Increments the in-app day counter, updates the AI narrative, and regenerates all daily quests (new quest ids; checkmarks reset), like “refresh all dailies.”',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Advance',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDebugAdvancingDay(true);
              try {
                const res = await advanceSimulationDay();
                if (!res.ok) {
                  Alert.alert('Advance day', res.error, [{ text: 'OK' }]);
                  return;
                }
              } finally {
                setDebugAdvancingDay(false);
              }
            })();
          },
        },
      ],
    );
  }, [activeGoals.length, advanceSimulationDay]);

  const listFooter = useMemo(
    () =>
      showAdminPanel ? (
        <View style={styles.debugFooter}>
          <Text style={[styles.adminPanelTitle, { color: colors.text }]}>Admin Panel</Text>
          <Pressable
          accessibilityLabel="Debug: regenerate all daily quests"
          disabled={activeGoals.length === 0 || debugRefreshingQuests}
          onPress={onDebugRefreshQuests}
          style={({ pressed }) => [
            styles.debugButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              opacity:
                activeGoals.length === 0 || debugRefreshingQuests
                  ? 0.5
                  : pressed
                    ? 0.88
                    : 1,
            },
          ]}
        >
          {debugRefreshingQuests ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : null}
          <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>
            Debug: refresh all daily quests
          </Text>
        </Pressable>
        <Text style={[styles.debugHint, { color: colors.textSecondary }]}>
          Regenerates copy for every active goal (dev only; resets checkmarks).
        </Text>
        <Text
          style={[styles.debugSectionLabel, { color: colors.text }]}
        >
          Share progress with AI (debug)
        </Text>
        <Pressable
          accessibilityLabel="Debug: view current user journal"
          disabled={debugJournalViewLoading}
          onPress={onDebugViewJournal}
          style={({ pressed }) => [
            styles.debugButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              opacity: debugJournalViewLoading ? 0.5 : pressed ? 0.88 : 1,
            },
          ]}
        >
          {debugJournalViewLoading ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : null}
          <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>
            Debug: view current journal
          </Text>
        </Pressable>
        <Text style={[styles.debugHint, { color: colors.textSecondary }]}>
          Shows simulated day, in-memory AI context, and raw saved journal rows.
        </Text>
        <TextInput
          value={debugJournalText}
          onChangeText={setDebugJournalText}
          placeholder="e.g. I found a social event called &quot;Board game night&quot; and want to go."
          placeholderTextColor={colors.textSecondary}
          multiline
          textAlignVertical="top"
          editable={!debugJournalSaving}
          style={[
            styles.debugJournalInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        />
        <Pressable
          accessibilityLabel="Debug: save journal for next quest generation"
          disabled={debugJournalSaving}
          onPress={onDebugSaveJournal}
          style={({ pressed }) => [
            styles.debugButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              marginTop: 4,
              opacity: debugJournalSaving ? 0.5 : pressed ? 0.88 : 1,
            },
          ]}
        >
          {debugJournalSaving ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : null}
          <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>
            Save for next quest refresh
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Debug: clear AI progress memory"
          disabled={debugClearingAiMemory}
          onPress={onDebugClearAiMemory}
          style={({ pressed }) => [
            styles.debugButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              marginTop: spacing.sm,
              opacity: debugClearingAiMemory ? 0.5 : pressed ? 0.88 : 1,
            },
          ]}
        >
          {debugClearingAiMemory ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : null}
          <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>
            Debug: clear AI progress memory
          </Text>
        </Pressable>
        <Text style={[styles.debugHint, { color: colors.textSecondary }]}>
          Saves to your journal and regenerates dailies in place (keeps checkmarks) when you have
          a full set per goal.
        </Text>
        <Pressable
          accessibilityLabel="Debug: advance simulated day"
          disabled={activeGoals.length === 0 || debugAdvancingDay}
          onPress={onDebugAdvanceSimulatedDay}
          style={({ pressed }) => [
            styles.debugButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              marginTop: spacing.lg,
              opacity:
                activeGoals.length === 0 || debugAdvancingDay
                  ? 0.5
                  : pressed
                    ? 0.88
                    : 1,
            },
          ]}
        >
          {debugAdvancingDay ? (
            <ActivityIndicator color={colors.textSecondary} size="small" />
          ) : null}
          <Text style={[styles.debugButtonText, { color: colors.textSecondary }]}>
            Debug: advance simulated day
          </Text>
        </Pressable>
        <Text style={[styles.debugHint, { color: colors.textSecondary }]}>
          Simulated day counter (debug, in memory only—resets when you sign out or clear AI
          memory). Refreshes all daily quests; resets checkmarks.
        </Text>
        </View>
      ) : null,
    [
      showAdminPanel,
      activeGoals.length,
      colors.border,
      colors.surfaceElevated,
      colors.text,
      colors.textSecondary,
      debugAdvancingDay,
      debugClearingAiMemory,
      debugJournalSaving,
      debugJournalText,
      debugJournalViewLoading,
      debugRefreshingQuests,
      onDebugAdvanceSimulatedDay,
      onDebugClearAiMemory,
      onDebugRefreshQuests,
      onDebugSaveJournal,
      onDebugViewJournal,
    ],
  );

  const renderQuestItem = useCallback(
    ({ item: entry }: { item: DailyQuestEntry }) => (
      <View
        style={[
          styles.questCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 3,
              },
              android: { elevation: 2 },
              default: {},
            }),
          },
        ]}
      >
        <View
          style={[
            styles.questCardHeader,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <Text
            style={[styles.questCardHeaderText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {entry.goalTitle}
          </Text>
        </View>
        <QuestRow
          variant="inCard"
          quest={entry.quest}
          completed={!!completed[entry.quest.id]}
          onToggle={() => toggleQuest(entry.quest.id)}
          attachedRecipe={attachedByQuest[entry.goalId]?.[entry.quest.id]}
          onAttachedRecipePress={
            attachedByQuest[entry.goalId]?.[entry.quest.id]
              ? () =>
                  setAttachedRecipeViewer(attachedByQuest[entry.goalId]![entry.quest.id]!)
              : undefined
          }
          attachedExercise={attachedExerciseByQuest[entry.goalId]?.[entry.quest.id]}
          onAssistPress={() =>
            navigation.navigate('QuestAssist', {
              goalId: entry.goalId,
              questId: entry.quest.id,
            })
          }
        />
      </View>
    ),
    [
      attachedByQuest,
      attachedExerciseByQuest,
      colors,
      completed,
      navigation,
      setAttachedRecipeViewer,
      toggleQuest,
    ],
  );

  const listHeader = useMemo(
    () => (
      <DailyQuestProgressCard
        dailyQuests={displayedDailyQuests}
        completed={completed}
        streak={streak}
        pointsToday={pointsToday}
        colors={colors}
      />
    ),
    [colors, completed, displayedDailyQuests, pointsToday, streak],
  );

  const renderQuestSectionHeader = useCallback(
    ({ section }: { section: MenuQuestSection }) => {
      if (section.key === 'active') {
        return (
          <View style={styles.section}>
            <View style={styles.dailyHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                Daily quests
              </Text>
              <View
                style={[
                  styles.sortPickerWrap,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Picker
                  accessibilityLabel="Sort daily quests"
                  selectedValue={sortMode}
                  onValueChange={(v) => setSortMode(v as DailyQuestSortMode)}
                  style={[styles.sortPicker, { color: colors.text }]}
                  mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                  dropdownIconColor={colors.textSecondary}
                >
                  <Picker.Item
                    label="Recommended"
                    value="recommended"
                    color={colors.text}
                  />
                  <Picker.Item label="Goal" value="goal" color={colors.text} />
                  <Picker.Item
                    label="Priority"
                    value="priority"
                    color={colors.text}
                  />
                </Picker>
              </View>
            </View>
            {showDailyLoading ? (
              <Text style={[styles.loadingHint, { color: colors.textSecondary }]}>
                Generating quests…
              </Text>
            ) : null}
          </View>
        );
      }
      return (
        <View style={[styles.section, styles.completedSectionHeader]}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            Quests Completed
          </Text>
        </View>
      );
    },
    [colors, showDailyLoading, sortMode],
  );

  return (
    <Screen scroll={false}>
      <SectionList
        ref={listRef}
        style={styles.menuList}
        sections={menuQuestSections}
        keyExtractor={(e) => e.quest.id}
        renderItem={renderQuestItem}
        renderSectionHeader={renderQuestSectionHeader}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
      />
      <AttachedRecipeModal
        recipe={attachedRecipeViewer}
        onClose={() => setAttachedRecipeViewer(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuList: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  dailyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  sortPickerWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 148,
    overflow: 'hidden',
  },
  sortPicker: {
    width: '100%',
    marginVertical: -4,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  completedSectionHeader: {
    marginTop: spacing.md,
  },
  questCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  questCardHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  questCardHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  debugFooter: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  adminPanelTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  debugButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  debugHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  debugSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  debugJournalInput: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
  },
});
