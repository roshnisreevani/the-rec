import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { recordActivityToday } from '@/lib/activity-streak';
import { supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };

// Where Supabase's password-reset email link sends the user back to. Must be
// added to this project's Auth > URL Configuration > Redirect URLs allowlist
// in the Supabase dashboard, or resetPasswordForEmail's link will silently
// fail to redirect here.
const RESET_PASSWORD_REDIRECT = Linking.createURL('reset-password');

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  // True once the app has opened via a password-reset email link and
  // exchanged it for a recovery session — drives showing the "set a new
  // password" screen instead of the normal signed-in app.
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePasswordAndFinishRecovery: (newPassword: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    // Handles the incoming therec://reset-password?code=... link: supabase-js
    // doesn't auto-parse deep links on React Native (that's a browser-only
    // thing gated by detectSessionInUrl), so the code has to be handed over
    // manually here. Covers both a cold start (app wasn't running) and the
    // app already being open in the background.
    const exchangeIfResetLink = async (url: string | null) => {
      if (!url || !url.includes('reset-password')) return;
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (!error) setIsPasswordRecovery(true);
      } catch {
        // If this isn't actually a valid recovery link, just let the user
        // land on the normal signed-in/signed-out screen as usual.
      }
    };

    Linking.getInitialURL().then(exchangeIfResetLink);
    const urlSub = Linking.addEventListener('url', ({ url }) => exchangeIfResetLink(url));

    return () => {
      listener.subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  // Log today as an "active day" for the streak (see lib/activity-streak.ts)
  // whenever a signed-in session is present — covers cold start, foreground
  // resume, and sign-in alike. Upserted server-side, so this firing more than
  // once a day is harmless.
  useEffect(() => {
    if (session?.user.id) {
      recordActivityToday(session.user.id);
    }
  }, [session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      isPasswordRecovery,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: RESET_PASSWORD_REDIRECT,
        });
        return { error: error?.message ?? null };
      },
      updatePasswordAndFinishRecovery: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (!error) setIsPasswordRecovery(false);
        return { error: error?.message ?? null };
      },
    }),
    [session, initializing, isPasswordRecovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
