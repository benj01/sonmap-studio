import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { dbLogger } from '@/utils/logging/dbLogger';

export function useAuth() {
  const [hasUser, setHasUser] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const checkInitialSession = useCallback(async () => {
    try {
      await dbLogger.debug('Checking initial session...', { source: 'useAuth.checkInitialSession' });
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        await dbLogger.error('Failed to get initial session', { source: 'useAuth.checkInitialSession', error });
        return;
      }
      setHasUser(!!session?.user);
      await dbLogger.debug('Initial session check', { source: 'useAuth.checkInitialSession', hasUser: !!session?.user });
    } catch (err) {
      await dbLogger.error('Exception in checkInitialSession', { source: 'useAuth.checkInitialSession', error: err });
    }
  }, [supabase]);

  const handleAuthStateChange = useCallback(async (event: AuthChangeEvent, session: Session | null) => {
    const hasUser = !!session?.user;
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    await dbLogger.debug('Auth state change', {
      source: 'useAuth.handleAuthStateChange',
      event,
      hasUser,
      currentPath
    });
    setHasUser(hasUser);
    if (event === 'SIGNED_OUT') {
      router.push('/sign-in');
    }
  }, [router]);

  useEffect(() => {
    // Wrap async calls in IIFE for useEffect
    (async () => {
      await checkInitialSession();
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, checkInitialSession, handleAuthStateChange]);

  return {
    hasUser
  };
} 