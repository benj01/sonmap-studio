'use client'

import { createContext, useContext, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useAuthUI } from '@/lib/stores/auth'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  initialized: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  initialized: false
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [initialized, setInitialized] = useState(false)
  const { setError } = useAuthUI()
  const supabase = createClient()

  useEffect(() => {
    async function initializeAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Auth initialization failed')
      } finally {
        setInitialized(true)
      }
    }

    // Initial auth check
    initializeAuth()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        
        if (event === 'SIGNED_OUT') {
          router.push('/sign-in')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, setError])

  return (
    <AuthContext.Provider value={{ user, initialized }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}