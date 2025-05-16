// utils/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { dbLogger } from '@/utils/logging/dbLogger'
import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

const SOURCE = 'SupabaseServerClient'

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not set');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      db: {
        schema: 'public',
      },
      global: {
        // Enable notice capturing
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            headers: {
              ...options?.headers,
              'X-Client-Info': 'sonmap-studio',
              'Prefer': 'return=representation,count=exact,headers=notice'
            }
          })
        }
      },
      cookies: {
        get: (name: string) => {
          try {
            return cookieStore.get(name)?.value ?? ''
          } catch {
            // If you want to log here, make this async and await dbLogger
            return ''
          }
        },
        set: async (name: string, value: string, options: Partial<ResponseCookie>) => {
          try {
            cookieStore.set(name, value, {
              ...options,
              path: options.path ?? '/',
              secure: true,
              sameSite: 'lax'
            })
          } catch (error) {
            await dbLogger.error('Error setting cookie', { name, error, options }, { source: SOURCE })
          }
        },
        remove: async (name: string) => {
          try {
            cookieStore.delete(name)
          } catch (error) {
            await dbLogger.error('Error removing cookie', { name, error }, { source: SOURCE })
          }
        }
      }
    }
  )
}

export default createClient
