'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  initialized: boolean
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const isHandlingRedirect = useRef(false)
  const currentPath = useRef('')

  useEffect(() => {
    // Initial session check
    const checkSession = async () => {
      console.log('Checking initial session...')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Initial session check:', { hasUser: !!session?.user })
        setUser(session?.user ?? null)
      } catch (error) {
        console.error('Error checking session:', error)
      } finally {
        setInitialized(true)
        setIsLoading(false)
      }
    }

    checkSession()

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', { event, hasUser: !!session?.user, currentPath: window.location.pathname })
      
      // Update user state regardless of event type
      setUser(session?.user ?? null)
      
      // Handle specific auth events
      if (event === 'SIGNED_IN') {
        // Only handle redirect if we're on the sign-in page or if there's a redirect parameter
        const isAuthPage = window.location.pathname.includes('/auth-pages/')
        const hasRedirect = searchParams.get('redirect')
        
        if (isAuthPage || hasRedirect) {
          const redirectTo = searchParams.get('redirect') || '/dashboard'
          console.log('Redirecting after sign in to:', redirectTo)
          router.push(redirectTo)
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out, redirecting to sign-in')
        router.push('/auth-pages/sign-in')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, searchParams, supabase])

  const signOut = async () => {
    try {
      setIsLoading(true)
      await supabase.auth.signOut()
      setUser(null)
      router.push('/auth-pages/sign-in')
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, initialized, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}