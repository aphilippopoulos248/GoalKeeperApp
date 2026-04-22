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
  fallbackQuestAssistIntro,
  fetchQuestAssistReply,
} from '../services/questAssistOpenai';
import {
  fetchRecipeSuggestionsForAssist,
  type AssistRecipe,
} from '../services/spoonacularRecipes';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const INTRO_MESSAGE = 'Would you like me to help you with this quest?';
const TYPE_MS = 38;
const ENTER_MS = 320;
const INPUT_FADE_MS = 380;

type ChatRole = 'user' | 'assistant';

type ChatMessage =
  | { id: string; role: ChatRole; text: string }
  | { id: string; role: 'assistant'; text: string; recipes?: AssistRecipe[] };

export function QuestAssistScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'QuestAssist'>>();
  const { goalId, questId } = route.params;
  const { goals } = useActiveGoals();

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
    async (userMessage: string) => {
      if (!goal || !quest) return;

      const recipes = await fetchRecipeSuggestionsForAssist({
        goalTitle: goal.title,
        goalDescription: goal.description,
        goalTimeBound: goal.timeBound,
        questTitle: quest.title,
        questDescription: quest.description,
        userMessage,
      });

      const aiText =
        (await fetchQuestAssistReply({
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalTimeBound: goal.timeBound,
          questTitle: quest.title,
          questDescription: quest.description,
          userMessage,
          hasRecipeSuggestions: !!recipes && recipes.length > 0,
        })) ?? fallbackQuestAssistIntro(!!recipes && recipes.length > 0);

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: aiText,
        recipes: recipes ?? undefined,
      };
      setMessages((m) => [...m, assistantMsg]);
    },
    [goal, quest],
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
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      await runAssist(trimmed);
    } finally {
      setSending(false);
    }
  }, [input, sending, introDone, runAssist]);

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
