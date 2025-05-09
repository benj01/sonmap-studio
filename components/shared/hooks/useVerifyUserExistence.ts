'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import createClient from '@/utils/supabase/client';
import { dbLogger } from '@/utils/logging/dbLogger';

const LOG_SOURCE = 'useVerifyUserExistence';

export function useVerifyUserExistence() {
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(true);

  const verifyUser = useCallback(async () => {
    setIsVerifying(true);
    const supabase = createClient();
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        await dbLogger.error('Failed to get session', { 
          source: LOG_SOURCE, 
          error: sessionError 
        });
        setIsVerifying(false);
        return;
      }
      
      if (!session?.user) {
        await dbLogger.info('No active session found', { source: LOG_SOURCE });
        setIsVerifying(false);
        return;
      }
      
      const userId = session.user.id;
      await dbLogger.debug('Verifying user existence', { 
        source: LOG_SOURCE, 
        userId 
      });

      const { data, error, status } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (error && status !== 406) {
        await dbLogger.error('Error fetching profile during verification', { 
          source: LOG_SOURCE, 
          error,
          userId 
        });
      } else if (!data) {
        await dbLogger.warn('User profile not found, logging out', { 
          source: LOG_SOURCE, 
          userId 
        });
        await supabase.auth.signOut();
        router.replace('/sign-in?reason=account_not_found');
        return;
      } else {
        await dbLogger.debug('User profile verification successful', { 
          source: LOG_SOURCE, 
          userId 
        });
      }
    } catch (error) {
      await dbLogger.error('Caught exception during user verification', { 
        source: LOG_SOURCE, 
        error 
      });
    } finally {
      setIsVerifying(false);
    }
  }, [router]);

  useEffect(() => {
    // Handle the promise rejection in useEffect
    verifyUser().catch(async (error) => {
      await dbLogger.error('Failed to verify user in useEffect', {
        source: LOG_SOURCE,
        error
      });
    });
  }, [verifyUser]);

  return { isVerifying };
} 