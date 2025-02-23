// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LogManager } from '@/core/logging/log-manager'

const SOURCE = 'SupabaseServer';
const logManager = LogManager.getInstance();

const logger = {
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error);
  }
};

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = cookieStore.get(name)
          return cookie?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            logger.error('Error setting cookie', error)
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.delete({ name, ...options })
          } catch (error) {
            logger.error('Error removing cookie', error)
          }
        },
      },
    }
  )
}

export default createClient;
