import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../navigation/MainStack';
import {
  fallbackChatOnlyReply,
  fallbackQuestAssistIntro,
  planQuestAssistTurn,
  type QuestAssistHistoryEntry,
} from '../services/questAssistOpenai';
import {
  fetchFullRecipeInformation,
  fetchRecipeNutritionSummary,
  fetchRecipeSuggestionsForAssist,
  resolveAssistNutritionRecipeId,
  searchRecipeIdByTitle,
  type AssistFullRecipe,
  type AssistRecipe,
} from '../services/spoonacularRecipes';
import {
  clearAttachedRecipe,
  getAttachedRecipe,
  setAttachedRecipe,
} from '../lib/questAttachedRecipeStorage';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useAuthUser } from '../context/AuthUserContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const INTRO_MESSAGE = 'Would you like me to help you with this quest?';
const TYPE_MS = 38;
const ENTER_MS = 320;
const INPUT_FADE_MS = 380;

type ChatRole = 'user' | 'assistant';

type ChatMessage =
  | { id: string; role: ChatRole; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      recipes?: AssistRecipe[];
      fullRecipe?: AssistFullRecipe;
    };

function extractRecentRecipesFromMessages(messages: ChatMessage[]): {
  id: number;
  title: string;
}[] {
  const out: { id: number; title: string }[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    if ('recipes' in m && m.recipes?.length) {
      for (const r of m.recipes) {
        out.push({ id: r.id, title: r.title });
      }
    }
    if ('fullRecipe' in m && m.fullRecipe) {
      out.push({ id: m.fullRecipe.spoonacularId, title: m.fullRecipe.title });
    }
  }
  return out;
}

function toPlannerHistory(messages: ChatMessage[]): QuestAssistHistoryEntry[] {
  return messages.map((m) => {
    if (m.role === 'user') {
      return { role: 'user', text: m.text };
    }
    const ids =
      'recipes' in m && m.recipes?.length
        ? m.recipes.map((r) => r.id)
        : undefined;
    const fullRecipeSpoonacularId =
      'fullRecipe' in m && m.fullRecipe ? m.fullRecipe.spoonacularId : undefined;
    return { role: 'assistant', text: m.text, recipeIds: ids, fullRecipeSpoonacularId };
  });
}

export function QuestAssistScreen() {
  const { colors } = useAppTheme();
  const { userId } = useAuthUser();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'QuestAssist'>>();
  const { goalId, questId } = route.params;
  const { goals } = useActiveGoals();
  const [savedToQuest, setSavedToQuest] = useState<AssistFullRecipe | null>(null);

  const goal = useMemo(
    () => goals.find((g) => g.id === goalId),
    [goals, goalId],
  );
  const quest = useMemo(
    () => goal?.dailyQuests?.find((q) => q.id === questId),
    [goal, questId],
  );

  const pageFade = useRef(new Animated.Value(0)).current;
  const introFade = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(0.92)).current;
  const inputFade = useRef(new Animated.Value(0)).current;
  const [shownIntro, setShownIntro] = useState('');
  const [introDone, setIntroDone] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!goal || !quest) {
      navigation.goBack();
    }
  }, [goal, quest, navigation]);

  useEffect(() => {
    if (!userId || !goal || !quest) {
      setSavedToQuest(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await getAttachedRecipe(userId, goal.id, quest.id);
      if (!cancelled) setSavedToQuest(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, goal, quest]);

  useEffect(() => {
    Animated.timing(pageFade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [pageFade]);

  useEffect(() => {
    if (!goal || !quest) return;

    let cancelled = false;
    setShownIntro('');
    introFade.setValue(0);
    introScale.setValue(0.92);
    inputFade.setValue(0);
    setIntroDone(false);

    let typeInterval: ReturnType<typeof setInterval> | null = null;

    const enter = Animated.parallel([
      Animated.timing(introFade, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.timing(introScale, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
    ]);

    enter.start(({ finished }) => {
      if (cancelled || !finished) return;
      let i = 0;
      typeInterval = setInterval(() => {
        if (cancelled) return;
        i += 1;
        setShownIntro(INTRO_MESSAGE.slice(0, i));
        if (i >= INTRO_MESSAGE.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          setIntroDone(true);
          Animated.timing(inputFade, {
            toValue: 1,
            duration: INPUT_FADE_MS,
            useNativeDriver: true,
          }).start();
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
    };
  }, [goal, quest, introFade, introScale, inputFade]);

  const runAssist = useCallback(
    async (allMessages: ChatMessage[]) => {
      if (!goal || !quest) return;
      const last = allMessages[allMessages.length - 1];
      if (!last || last.role !== 'user') return;

      const userMessage = last.text;
      const prior = allMessages.slice(0, -1);
      const recentRecipes = extractRecentRecipesFromMessages(prior);
      const history = toPlannerHistory(prior);

      const plan = await planQuestAssistTurn({
        goalTitle: goal.title,
        goalDescription: goal.description,
        goalTimeBound: goal.timeBound,
        questTitle: quest.title,
        questDescription: quest.description,
        recentRecipes,
        history,
        latestUserMessage: userMessage,
      });

      let recipes: AssistRecipe[] | undefined;
      let fullRecipe: AssistFullRecipe | undefined;
      let text = plan.reply.trim();

      if (plan.intent === 'suggest_recipes') {
        const list = await fetchRecipeSuggestionsForAssist({
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalTimeBound: goal.timeBound,
          questTitle: quest.title,
          questDescription: quest.description,
          userMessage,
        });
        recipes = list ?? undefined;
        if (!text) text = fallbackQuestAssistIntro(!!recipes?.length);
      } else if (plan.intent === 'full_recipe') {
        let rid = resolveAssistNutritionRecipeId({
          explicitId: plan.fullRecipeSpoonacularId,
          titleHint: plan.fullRecipeTitleHint,
          recentRecipes,
          userMessage,
        });
        if (rid == null && plan.fullRecipeTitleHint?.trim()) {
          rid = await searchRecipeIdByTitle(plan.fullRecipeTitleHint.trim());
        }
        const full = rid != null ? await fetchFullRecipeInformation(rid) : null;
        if (full) {
          fullRecipe = full;
          if (!text) text = 'Here is the full recipe with ingredients and steps:';
        } else {
          text =
            text ||
            "I couldn’t load that recipe. Try a dish name from the list above or be more specific.";
        }
      } else if (plan.intent === 'nutrition_for_recipe') {
        let rid = resolveAssistNutritionRecipeId({
          explicitId: plan.nutritionRecipeId,
          titleHint: plan.nutritionRecipeTitleHint,
          recentRecipes,
          userMessage,
        });
        if (rid == null && plan.nutritionRecipeTitleHint?.trim()) {
          rid = await searchRecipeIdByTitle(plan.nutritionRecipeTitleHint.trim());
        }
        const nut = rid != null ? await fetchRecipeNutritionSummary(rid) : null;
        if (nut) {
          text = text ? `${text}\n\n${nut}` : nut;
        } else {
          text =
            text ||
            "I couldn’t load nutrition for that dish. Try naming the recipe, or pick one from the list above again.";
        }
      } else if (!text) {
        text = fallbackChatOnlyReply();
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text,
        recipes,
        fullRecipe,
      };
      setMessages([...allMessages, assistantMsg]);
    },
    [goal, quest],
  );

  const onRecipeStarPress = useCallback(
    async (recipe: AssistFullRecipe) => {
      if (!userId || !goal || !quest) return;
      if (savedToQuest?.spoonacularId === recipe.spoonacularId) {
        await clearAttachedRecipe(userId, goal.id, quest.id);
        setSavedToQuest(null);
      } else {
        await setAttachedRecipe(userId, goal.id, quest.id, recipe);
        setSavedToQuest(recipe);
      }
    },
    [userId, goal, quest, savedToQuest],
  );

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !introDone) return;
    setInput('');
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setSending(true);
    try {
      await runAssist(nextThread);
    } finally {
      setSending(false);
    }
  }, [input, sending, introDone, messages, runAssist]);

  if (!goal || !quest) {
    return null;
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <Animated.View style={[styles.flex1, { opacity: pageFade }]}>
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Back to menu"
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
              <Text style={[styles.backLabel, { color: colors.primary }]}>
                Menu
              </Text>
            </Pressable>
            <Text style={[styles.title, { color: colors.text }]}>AI Assist</Text>
            <View style={styles.topBarSpacer} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              style={{
                opacity: introFade,
                transform: [{ scale: introScale }],
              }}
            >
              <Text
                style={[styles.introText, { color: colors.text }]}
                accessibilityLiveRegion="polite"
              >
                {shownIntro}
              </Text>
            </Animated.View>

            {messages.map((msg) => (
              <View key={msg.id} style={styles.msgBlock}>
                <View
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                    {
                      backgroundColor:
                        msg.role === 'user'
                          ? colors.primary
                          : colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      {
                        color:
                          msg.role === 'user' ? '#ffffff' : colors.text,
                      },
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
                {msg.role === 'assistant' && msg.recipes && msg.recipes.length > 0 ? (
                  <View style={styles.recipeList}>
                    {msg.recipes.map((r) => (
                      <Pressable
                        key={`${msg.id}-${r.id}`}
                        onPress={() => {
                          if (r.sourceUrl) void Linking.openURL(r.sourceUrl);
                        }}
                        style={[
                          styles.recipeCard,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {r.image ? (
                          <Image
                            source={{ uri: r.image }}
                            style={styles.recipeImage}
                          />
                        ) : null}
                        <Text
                          style={[styles.recipeTitle, { color: colors.text }]}
                          numberOfLines={2}
                        >
                          {r.title}
                        </Text>
                        {r.sourceUrl ? (
                          <Text
                            style={[styles.recipeLink, { color: colors.primary }]}
                            numberOfLines={1}
                          >
                            Open recipe
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {msg.role === 'assistant' && 'fullRecipe' in msg && msg.fullRecipe ? (
                  <View
                    style={[
                      styles.fullRecipeCard,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.fullRecipeHeader}>
                      <Text
                        style={[styles.fullRecipeHeadline, { color: colors.text }]}
                        numberOfLines={2}
                      >
                        {msg.fullRecipe.title}
                      </Text>
                      <Pressable
                        onPress={() => void onRecipeStarPress(msg.fullRecipe!)}
                        hitSlop={12}
                        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          savedToQuest?.spoonacularId === msg.fullRecipe.spoonacularId
                            ? 'Remove recipe from quest'
                            : 'Save recipe to quest'
                        }
                      >
                        <Ionicons
                          name={
                            savedToQuest?.spoonacularId === msg.fullRecipe.spoonacularId
                              ? 'star'
                              : 'star-outline'
                          }
                          size={26}
                          color={colors.primary}
                        />
                      </Pressable>
                    </View>
                    {msg.fullRecipe.image ? (
                      <Image
                        source={{ uri: msg.fullRecipe.image }}
                        style={styles.fullRecipeHero}
                      />
                    ) : null}
                    {msg.fullRecipe.servings != null || msg.fullRecipe.readyInMinutes != null ? (
                      <Text style={[styles.fullRecipeMeta, { color: colors.textSecondary }]}>
                        {[
                          msg.fullRecipe.servings != null
                            ? `${msg.fullRecipe.servings} servings`
                            : null,
                          msg.fullRecipe.readyInMinutes != null
                            ? `${msg.fullRecipe.readyInMinutes} min`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={[styles.fullRecipeSectionLabel, { color: colors.text }]}>
                      Ingredients
                    </Text>
                    <ScrollView
                      nestedScrollEnabled
                      style={styles.fullRecipeScroll}
                      showsVerticalScrollIndicator
                    >
                      {msg.fullRecipe.ingredientLines.map((line, i) => (
                        <Text
                          key={`ing-${msg.id}-${i}`}
                          style={[styles.fullRecipeLine, { color: colors.text }]}
                        >
                          • {line}
                        </Text>
                      ))}
                      <Text
                        style={[
                          styles.fullRecipeSectionLabel,
                          styles.fullRecipeStepsLabel,
                          { color: colors.text },
                        ]}
                      >
                        Steps
                      </Text>
                      {msg.fullRecipe.stepLines.map((line, i) => (
                        <Text
                          key={`st-${msg.id}-${i}`}
                          style={[styles.fullRecipeLine, { color: colors.text }]}
                        >
                          {i + 1}. {line}
                        </Text>
                      ))}
                    </ScrollView>
                    {msg.fullRecipe.sourceUrl ? (
                      <Pressable
                        onPress={() => void Linking.openURL(msg.fullRecipe!.sourceUrl!)}
                      >
                        <Text style={[styles.recipeLink, { color: colors.primary }]}>
                          Open original recipe
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>

          <Animated.View
            style={[
              styles.composer,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                opacity: inputFade,
              },
            ]}
            pointerEvents={introDone ? 'auto' : 'none'}
          >
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Ask anything about this quest…"
              placeholderTextColor={colors.textSecondary}
              value={input}
              onChangeText={setInput}
              editable={introDone && !sending}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={() => void onSend()}
              disabled={!introDone || sending || !input.trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: colors.primary,
                  opacity:
                    !introDone || sending || !input.trim()
                      ? 0.45
                      : pressed
                        ? 0.88
                        : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#ffffff" />
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 88,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  topBarSpacer: { minWidth: 88 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  introText: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 30,
  },
  msgBlock: {
    marginBottom: spacing.md,
  },
  bubble: {
    maxWidth: '92%',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleAssistant: { alignSelf: 'flex-start' },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  recipeList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  recipeCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: spacing.sm,
  },
  recipeImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#e8e8e8',
  },
  recipeTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  recipeLink: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  fullRecipeCard: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    maxHeight: 420,
  },
  fullRecipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fullRecipeHeadline: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  fullRecipeHero: {
    width: '100%',
    height: 120,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
    backgroundColor: '#e8e8e8',
  },
  fullRecipeMeta: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  fullRecipeSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  fullRecipeStepsLabel: {
    marginTop: spacing.md,
  },
  fullRecipeScroll: {
    maxHeight: 220,
  },
  fullRecipeLine: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
