import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import createClient from '@/utils/supabase/client';
// import { LogManager } from '@/core/logging/log-manager'; // Uncomment if LogManager is available client-side

export function useVerifyUserExistence() {
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(true);
  // const logger = LogManager.getInstance(); // Uncomment if LogManager is available client-side

  const verifyUser = useCallback(async () => {
    setIsVerifying(true);
    const supabase = createClient();
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        // logger.error('Failed to get session', sessionError);
        console.error('Failed to get session', sessionError);
        setIsVerifying(false);
        return;
      }
      if (!session?.user) {
        // logger.info('No active session found.');
        setIsVerifying(false);
        return;
      }
      const userId = session.user.id;
      // logger.debug(`Verifying existence for user ID: ${userId}`);
      const { data, error, status } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (error && status !== 406) {
        // logger.error('Error fetching profile during verification', error);
        console.error('Error fetching profile during verification:', error);
      } else if (!data) {
        // logger.warn(`User profile not found for ID: ${userId}. Logging out.`);
        console.warn(`User profile not found for ID: ${userId}. Logging out.`);
        await supabase.auth.signOut();
        router.replace('/sign-in?reason=account_not_found');
        return;
      } else {
        // logger.debug(`User profile found for ID: ${userId}. Verification successful.`);
      }
    } catch (catchError) {
      // logger.error('Caught exception during user verification', catchError);
      console.error('Caught exception during user verification:', catchError);
    } finally {
      setIsVerifying(false);
    }
  }, [router]);

  useEffect(() => {
    verifyUser();
  }, [verifyUser]);

  return { isVerifying };
} 