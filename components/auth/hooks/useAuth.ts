import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

export function useAuth() {
  const [hasUser, setHasUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const checkInitialSession = async () => {
    logger.debug('Checking initial session...');
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      logger.error('Failed to get initial session', error);
      return;
    }

    setHasUser(!!session?.user);
    logger.debug('Initial session check', { hasUser: !!session?.user });
  };

  const handleAuthStateChange = (event: AuthChangeEvent, session: Session | null) => {
    const hasUser = !!session?.user;
    const currentPath = window.location.pathname;

    logger.debug('Auth state change', {
      event,
      hasUser,
      currentPath
    });

    setHasUser(hasUser);
    
    if (event === 'SIGNED_OUT') {
      router.push('/sign-in');
    }
  };

  useEffect(() => {
    checkInitialSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    hasUser,
    isLoading
  };
} 