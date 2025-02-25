// utils/supabase/server-client.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LogManager } from '@/core/logging/log-manager'
import { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

const SOURCE = 'SupabaseServerClient'
const logManager = LogManager.getInstance()

const logger = {
  info: (message: string, data?: any) => {
    logManager.info(SOURCE, message, data)
  },
  warn: (message: string, error?: any) => {
    logManager.warn(SOURCE, message, error)
  },
  error: (message: string, error?: any) => {
    logManager.error(SOURCE, message, error)
  }
}

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            logger.error('Error setting cookie', { name, error })
          }
        },
        remove(name: string, options: Partial<ResponseCookie>) {
          try {
            cookieStore.delete(name, {
              ...options,
              path: options.path ?? '/'
            })
          } catch (error) {
            logger.error('Error removing cookie', { name, error })
          }
        }
      }
    }
  )
}

export default createClient
