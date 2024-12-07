'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/stores/auth'
import { useRouter, usePathname } from 'next/navigation'

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/reset-password']

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, isLoading, initialized, checkUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!initialized) {
      checkUser()
    }
  }, [initialized, checkUser])

  useEffect(() => {
    if (initialized && !isLoading) {
      const isPublicPath = PUBLIC_PATHS.includes(pathname)
      
      if (!user && !isPublicPath) {
        // Redirect to sign in if trying to access protected route while not authenticated
        router.push('/sign-in')
      } else if (user && pathname === '/sign-in') {
        // Redirect to dashboard if already authenticated
        router.push('/dashboard')
      }
    }
  }, [user, initialized, isLoading, pathname, router])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}