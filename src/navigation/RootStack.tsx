import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import { DailyReflectionOverlay } from '../components/DailyReflectionOverlay';
import { FirstTimeOnboardingOverlay } from '../components/FirstTimeOnboardingOverlay';
import { PostLoginGreetingOverlay } from '../components/PostLoginGreetingOverlay';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useAuthUser } from '../context/AuthUserContext';
import {
  getReflectionDismissedDate,
  setReflectionDismissedForToday,
} from '../lib/dailyReflectionIntent';
import {
  ensureDailyReflectionNotificationScheduled,
  shouldOpenReflectionFromLastNotificationResponse,
} from '../lib/progressReflectionNotifications';
import {
  formatLocalDateYyyyMmDd,
  hasProgressJournalOnDate,
} from '../services/supabase/progressJournalRepository';
import { profileNeedsOnboarding } from '../services/supabase/profileRepository';
import { buildGreetingMessage } from '../lib/buildGreetingMessage';
import {
  consumeGreetingIntent,
  type GreetingAccountKind,
} from '../lib/greetingIntent';
import { supabase } from '../lib/supabase';
import { displayNameFromUser } from '../lib/userDisplayName';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAppTheme } from '../theme/ThemeProvider';
import { MainAppStack } from './MainStack';
import { type RootTabParamList } from './RootTabs';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type PostLoginGreetingContextValue = {
  showGreeting: boolean;
  greetingAccountKind: GreetingAccountKind;
  greetingDisplayName: string;
  onGreetingFinished: () => void;
  showFirstTimeOnboarding: boolean;
  onFirstTimeOnboardingFinished: () => void;
};

const PostLoginGreetingContext =
  createContext<PostLoginGreetingContextValue | null>(null);

function MainShell() {
  const ctx = useContext(PostLoginGreetingContext);
  if (!ctx) {
    throw new Error('MainShell requires PostLoginGreetingContext');
  }
  const { goals, goalsStorageReady, submitProgressJournal } = useActiveGoals();
  const { userId, authReady } = useAuthUser();
  const [showReflection, setShowReflection] = useState(false);
  const launchNotifAutoOpenHandledRef = useRef(false);

  const preparing = ctx.showGreeting && !goalsStorageReady;
  const message = useMemo(() => {
    if (!ctx.showGreeting || !goalsStorageReady) return '';
    return buildGreetingMessage(
      ctx.greetingAccountKind,
      ctx.greetingDisplayName,
      goals,
    );
  }, [
    ctx.showGreeting,
    ctx.greetingAccountKind,
    ctx.greetingDisplayName,
    goals,
    goalsStorageReady,
  ]);

  useEffect(() => {
    if (!authReady || !userId || !goalsStorageReady) return;
    void ensureDailyReflectionNotificationScheduled();
  }, [authReady, userId, goalsStorageReady]);

  useEffect(() => {
    if (!authReady || !userId || !goalsStorageReady) return;
    if (ctx.showGreeting) return;
    if (ctx.showFirstTimeOnboarding) return;
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const fromNotif = await shouldOpenReflectionFromLastNotificationResponse();
      if (cancelled) return;
      if (fromNotif && !launchNotifAutoOpenHandledRef.current) {
        launchNotifAutoOpenHandledRef.current = true;
        setShowReflection(true);
        return;
      }
      const today = formatLocalDateYyyyMmDd();
      const dismissed = await getReflectionDismissedDate();
      if (dismissed === today) return;
      const has = await hasProgressJournalOnDate(userId, today);
      if (has) return;
      if (new Date().getHours() < 17) return;
      setShowReflection(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, userId, goalsStorageReady, ctx.showGreeting, ctx.showFirstTimeOnboarding]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'DAILY_REFLECTION') {
        setShowReflection(true);
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  const onReflectionNotNow = useCallback(async () => {
    await setReflectionDismissedForToday(formatLocalDateYyyyMmDd());
  }, []);

  const onReflectionAfterClose = useCallback(() => {
    setShowReflection(false);
  }, []);

  const onReflectionSubmit = useCallback(
    async (body: string) => {
      return submitProgressJournal(body, 'reflection');
    },
    [submitProgressJournal],
  );

  const reflectionVisible =
    showReflection &&
    !ctx.showGreeting &&
    !ctx.showFirstTimeOnboarding &&
    goalsStorageReady;

  return (
    <View style={{ flex: 1 }}>
      <MainAppStack />
      <FirstTimeOnboardingOverlay
        visible={ctx.showFirstTimeOnboarding}
        onFinished={ctx.onFirstTimeOnboardingFinished}
      />
      <PostLoginGreetingOverlay
        visible={ctx.showGreeting}
        preparing={preparing}
        message={message}
        onFinished={ctx.onGreetingFinished}
      />
      <DailyReflectionOverlay
        visible={reflectionVisible}
        onNotNow={onReflectionNotNow}
        onAfterClose={onReflectionAfterClose}
        onSubmit={onReflectionSubmit}
      />
    </View>
  );
}

export function RootStack() {
  const { colors } = useAppTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [greetingUser, setGreetingUser] = useState<User | null>(null);
  const [greetingAccountKind, setGreetingAccountKind] =
    useState<GreetingAccountKind>('returning');
  const [showGreeting, setShowGreeting] = useState(false);
  const [showFirstTimeOnboarding, setShowFirstTimeOnboarding] = useState(false);
  const greetingKindCacheRef = useRef<{
    userId: string;
    kind: GreetingAccountKind;
  } | null>(null);
  const reconcileGenerationRef = useRef(0);

  const onGreetingFinished = useCallback(() => {
    setShowGreeting(false);
    setGreetingUser(null);
  }, []);

  const onFirstTimeOnboardingFinished = useCallback(() => {
    setShowFirstTimeOnboarding(false);
    setGreetingUser(null);
  }, []);

  const greetingDisplayName = greetingUser
    ? displayNameFromUser(greetingUser)
    : 'Player';

  const postLoginGreeting = useMemo(
    () => ({
      showGreeting,
      greetingAccountKind,
      greetingDisplayName,
      onGreetingFinished,
      showFirstTimeOnboarding,
      onFirstTimeOnboardingFinished,
    }),
    [
      showGreeting,
      greetingAccountKind,
      greetingDisplayName,
      onGreetingFinished,
      showFirstTimeOnboarding,
      onFirstTimeOnboardingFinished,
    ],
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      setSession(nextSession);

      if (event === 'SIGNED_OUT') {
        reconcileGenerationRef.current += 1;
        greetingKindCacheRef.current = null;
        setShowGreeting(false);
        setShowFirstTimeOnboarding(false);
        setGreetingUser(null);
        setGreetingAccountKind('returning');
        return;
      }

      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') {
        return;
      }

      const user = nextSession?.user;
      if (!user) {
        return;
      }

      const gen = ++reconcileGenerationRef.current;
      const isFreshSignIn = event === 'SIGNED_IN';

      void (async () => {
        let kind: GreetingAccountKind = 'returning';
        if (greetingKindCacheRef.current?.userId === user.id) {
          kind = greetingKindCacheRef.current.kind;
        } else if (isFreshSignIn) {
          const consumed = await consumeGreetingIntent(user);
          kind = consumed ?? 'returning';
          greetingKindCacheRef.current = { userId: user.id, kind };
        }

        const need = await profileNeedsOnboarding(user.id);
        if (gen !== reconcileGenerationRef.current) {
          return;
        }

        setGreetingUser(user);
        setGreetingAccountKind(kind);
        if (need === true) {
          setShowFirstTimeOnboarding(true);
          setShowGreeting(false);
        } else if (isFreshSignIn) {
          setShowFirstTimeOnboarding(false);
          setShowGreeting(true);
        } else {
          setShowFirstTimeOnboarding(false);
          setShowGreeting(false);
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <PostLoginGreetingContext.Provider value={postLoginGreeting}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Main" component={MainShell} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </PostLoginGreetingContext.Provider>
  );
}
