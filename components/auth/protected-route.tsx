'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/stores/auth'
import type { User } from '@supabase/supabase-js'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, initialized } = useAuth()

  useEffect(() => {
    if (initialized && !isLoading) {
      if (!user) {
        sessionStorage.setItem('redirectTo', pathname)
        router.push('/sign-in')
      } else if (allowedRoles && user.app_metadata?.role && !allowedRoles.includes(user.app_metadata.role)) {
        router.push('/unauthorized')
      }
    }
  }, [user, isLoading, initialized, router, pathname, allowedRoles])

  if (isLoading || !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}