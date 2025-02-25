// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export const createClient = () => {
  if (supabaseClient) return supabaseClient

  supabaseClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return document.cookie
            .split('; ')
            .find((row) => row.startsWith(`${name}=`))
            ?.split('=')[1]
        },
        set(name: string, value: string, options: { path?: string; maxAge?: number; domain?: string; secure?: boolean }) {
          const encodedValue = encodeURIComponent(value)
          document.cookie = `${name}=${encodedValue}${options?.path ? `; path=${options.path}` : '; path=/'}${
            options?.maxAge ? `; max-age=${options.maxAge}` : ''
          }${options?.domain ? `; domain=${options.domain}` : ''}; secure; samesite=lax`
        },
        remove(name: string, options: { path?: string }) {
          document.cookie = `${name}=; max-age=0${options?.path ? `; path=${options.path}` : '; path=/'}`
        },
      },
    }
  )

  return supabaseClient
}

export default createClient
