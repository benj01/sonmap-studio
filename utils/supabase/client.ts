// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'
import { dbLogger } from '@/utils/logging/dbLogger'

let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    (async () => { await dbLogger.error('Supabase env vars missing in client', { supabaseUrl, supabaseAnonKey }, { source: 'SupabaseClient' }) })();
    throw new Error('Supabase environment variables are not set');
  }

  if (supabaseClient) return supabaseClient

  supabaseClient = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          if (typeof window === 'undefined') return undefined
          try {
            return document.cookie
              .split('; ')
              .find((row) => row.startsWith(`${name}=`))
              ?.split('=')[1]
          } catch (error) {
            (async () => { await dbLogger.error('Error getting cookie', { name, error }, { source: 'SupabaseClient' }) })();
            return undefined;
          }
        },
        set(name: string, value: string, options: { path?: string; maxAge?: number; domain?: string; secure?: boolean }) {
          if (typeof window === 'undefined') return
          try {
            const encodedValue = encodeURIComponent(value)
            document.cookie = `${name}=${encodedValue}${options?.path ? `; path=${options.path}` : '; path=/'}${
              options?.maxAge ? `; max-age=${options.maxAge}` : ''
            }${options?.domain ? `; domain=${options.domain}` : ''}; secure; samesite=lax`
          } catch (error) {
            (async () => { await dbLogger.error('Error setting cookie', { name, value, options, error }, { source: 'SupabaseClient' }) })();
          }
        },
        remove(name: string, options: { path?: string }) {
          if (typeof window === 'undefined') return
          try {
            document.cookie = `${name}=; max-age=0${options?.path ? `; path=${options.path}` : '; path=/'}`
          } catch (error) {
            (async () => { await dbLogger.error('Error removing cookie', { name, options, error }, { source: 'SupabaseClient' }) })();
          }
        },
      },
    }
  )

  return supabaseClient
}

export default createClient
