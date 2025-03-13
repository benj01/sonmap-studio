// utils/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLogger } from '@/utils/logger'
import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

const SOURCE = 'SupabaseServerClient'
const logger = createLogger(SOURCE)

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        get(name: string) {
          try {
            return cookieStore.get(name)?.value ?? ''
          } catch (error) {
            logger.error('Error getting cookie', { name, error })
            return ''
          }
        },
        set(name: string, value: string, options: Partial<ResponseCookie>) {
          try {
            // Ensure consistent cookie options
            cookieStore.set(name, value, {
              ...options,
              path: options.path ?? '/',
              secure: true,
              sameSite: 'lax'
            })
          } catch (error) {
            logger.error('Error setting cookie', { name, error, options })
          }
        },
        remove(name: string, options: Partial<ResponseCookie>) {
          try {
            cookieStore.delete(name, {
              ...options,
              path: options.path ?? '/'
            })
          } catch (error) {
            logger.error('Error removing cookie', { name, error, options })
          }
        }
      }
    }
  )
}

export default createClient
