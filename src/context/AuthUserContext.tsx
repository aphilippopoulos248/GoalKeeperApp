import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

export type AuthUserContextValue = {
  userId: string | null;
  /** False until the first `getSession` completes. */
  authReady: boolean;
};

const AuthUserContext = createContext<AuthUserContextValue | null>(null);

export function AuthUserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      userId,
      authReady,
    }),
    [userId, authReady],
  );

  return <AuthUserContext.Provider value={value}>{children}</AuthUserContext.Provider>;
}

export function useAuthUser(): AuthUserContextValue {
  const ctx = useContext(AuthUserContext);
  if (!ctx) {
    throw new Error('useAuthUser must be used within AuthUserProvider');
  }
  return ctx;
}
