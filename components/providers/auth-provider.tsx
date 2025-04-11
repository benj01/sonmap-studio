'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'
import { LogManager } from '@/core/logging/log-manager'
import { useUIStore } from '@/lib/stores/ui'

interface AuthContextType {
  user: User | null
  initialized: boolean
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const SOURCE = 'AuthProvider'
const logger = LogManager.getInstance()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const { closeAllModals } = useUIStore()
  const isRedirecting = useRef(false)

  useEffect(() => {
    // Initial session check
    const checkSession = async () => {
      logger.info('AuthProvider', 'Checking initial session...')
      try {
        const { data: { session } } = await supabase.auth.getSession()
        logger.info('AuthProvider', 'Initial session check', !!session?.user)
        setUser(session?.user ?? null)
      } catch (error) {
        logger.error('AuthProvider', 'Error checking session', error)
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
      logger.info('AuthProvider', 'Auth state change', {
        event,
        hasUser: !!session?.user,
        currentPath: window.location.pathname,
        userEmail: session?.user?.email
      })
      
      // Update user state regardless of event type
      setUser(session?.user ?? null)
      
      // Handle specific auth events
      if (event === 'SIGNED_IN') {
        // Close all modals immediately
        logger.debug('AuthProvider', 'Closing all modals after sign in')
        closeAllModals()
        
        // Only handle redirect if we're on the sign-in page or if there's a redirect parameter
        const isAuthPage = window.location.pathname.includes('/auth-pages/')
        const hasRedirect = searchParams.get('redirect')
        
        logger.debug('AuthProvider', 'Sign in event details', {
          isAuthPage,
          hasRedirect,
          currentPath: window.location.pathname
        })
        
        if (isAuthPage || hasRedirect) {
          // Prevent multiple redirects in dev mode
          if (isRedirecting.current) {
            logger.debug('AuthProvider', 'Already redirecting, skipping')
            return
          }
          
          isRedirecting.current = true
          
          try {
            const redirectTo = searchParams.get('redirect') || '/dashboard'
            logger.info('AuthProvider', 'Redirecting after sign in', redirectTo)
            router.push(redirectTo)
          } finally {
            // Reset the redirecting flag after a delay to handle React 18's double-mounting
            setTimeout(() => {
              isRedirecting.current = false
            }, 1000)
          }
        } else {
          logger.debug('AuthProvider', 'No redirect needed after sign in')
        }
      } else if (event === 'SIGNED_OUT') {
        logger.info('AuthProvider', 'User signed out, redirecting to sign-in')
        router.push('/auth-pages/sign-in')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, searchParams, supabase, closeAllModals])

  const signOut = async () => {
    try {
      setIsLoading(true)
      await supabase.auth.signOut()
      setUser(null)
      router.push('/auth-pages/sign-in')
    } catch (error) {
      logger.error('AuthProvider', 'Error signing out', error)
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