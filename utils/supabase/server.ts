// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { dbLogger } from '@/utils/logging/dbLogger'

const SOURCE = 'SupabaseServer';

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    await dbLogger.error('Missing Supabase environment variables', { supabaseUrl, supabaseAnonKey }, { source: SOURCE });
    throw new Error('Supabase environment variables are not set');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          const cookie = cookieStore.get(name)
          return cookie?.value
        },
        set: async (name: string, value: string, options: Record<string, unknown>) => {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            await dbLogger.error('Error setting cookie', { error, name, options }, { source: SOURCE });
          }
        },
        remove: async (name: string, options: Record<string, unknown>) => {
          try {
            cookieStore.delete({ name, ...options })
          } catch (error) {
            await dbLogger.error('Error removing cookie', { error, name, options }, { source: SOURCE });
          }
        },
      },
    }
  )
}

export default createClient;
