import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PostLoginGreetingOverlay } from '../components/PostLoginGreetingOverlay';
import { useActiveGoals } from '../context/ActiveGoalsContext';
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
import { RootTabs, type RootTabParamList } from './RootTabs';

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
};

const PostLoginGreetingContext =
  createContext<PostLoginGreetingContextValue | null>(null);

function MainShell() {
  const ctx = useContext(PostLoginGreetingContext);
  if (!ctx) {
    throw new Error('MainShell requires PostLoginGreetingContext');
  }
  const { goals, goalsStorageReady } = useActiveGoals();

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

  return (
    <View style={{ flex: 1 }}>
      <RootTabs />
      <PostLoginGreetingOverlay
        visible={ctx.showGreeting}
        preparing={preparing}
        message={message}
        onFinished={ctx.onGreetingFinished}
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

  const onGreetingFinished = useCallback(() => {
    setShowGreeting(false);
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
    }),
    [
      showGreeting,
      greetingAccountKind,
      greetingDisplayName,
      onGreetingFinished,
    ],
  );

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' && nextSession?.user) {
        const kind = consumeGreetingIntent() ?? 'returning';
        setGreetingAccountKind(kind);
        setGreetingUser(nextSession.user);
        setShowGreeting(true);
      }
      if (event === 'SIGNED_OUT') {
        setShowGreeting(false);
        setGreetingUser(null);
        setGreetingAccountKind('returning');
      }
      setSession(nextSession);
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
