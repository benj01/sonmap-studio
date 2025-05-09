'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'
import { dbLogger } from '@/utils/logging/dbLogger'
import { useUIStore } from '@/lib/stores/ui'

interface AuthContextType {
  user: User | null
  initialized: boolean
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LOG_SOURCE = 'AuthProvider'

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
      await dbLogger.info('Checking initial session...', { source: LOG_SOURCE })
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await dbLogger.info('Initial session check', { 
          source: LOG_SOURCE,
          hasUser: !!session?.user 
        })
        setUser(session?.user ?? null)
      } catch (error) {
        await dbLogger.error('Error checking session', { 
          source: LOG_SOURCE,
          error 
        })
      } finally {
        setInitialized(true)
        setIsLoading(false)
      }
    }

    // Create an async function to handle both initial check and subscription
    const initAuth = async () => {
      await checkSession()

      // Subscribe to auth changes
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        await dbLogger.info('Auth state change', {
          source: LOG_SOURCE,
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
          closeAllModals()
          
          // Only handle redirect if we're on the sign-in page or if there's a redirect parameter
          const isAuthPage = window.location.pathname.includes('/auth-pages/')
          const redirectParam = searchParams?.get('redirect')
          const hasRedirect = !!redirectParam
          
          if (isAuthPage || hasRedirect) {
            // Prevent multiple redirects in dev mode
            if (isRedirecting.current) {
              return
            }
            
            isRedirecting.current = true
            
            try {
              const redirectTo = redirectParam || '/dashboard'
              await dbLogger.info('Redirecting after sign in', { 
                source: LOG_SOURCE,
                redirectTo 
              })
              router.push(redirectTo)
            } finally {
              // Reset the redirecting flag after a delay to handle React 18's double-mounting
              setTimeout(() => {
                isRedirecting.current = false
              }, 1000)
            }
          }
        } else if (event === 'SIGNED_OUT') {
          await dbLogger.info('User signed out, redirecting to sign-in', { 
            source: LOG_SOURCE 
          })
          router.push('/auth-pages/sign-in')
        }
      })

      return () => {
        subscription.unsubscribe()
      }
    }

    // Handle the promise returned by initAuth
    initAuth().catch(async (error) => {
      await dbLogger.error('Error in auth initialization', {
        source: LOG_SOURCE,
        error
      })
    })

  }, [router, searchParams, supabase, closeAllModals])

  const signOut = async () => {
    try {
      setIsLoading(true)
      await supabase.auth.signOut()
      setUser(null)
      router.push('/auth-pages/sign-in')
    } catch (error) {
      await dbLogger.error('Error signing out', { 
        source: LOG_SOURCE,
        error 
      })
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