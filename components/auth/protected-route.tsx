'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/stores/auth'
import { LoadingState } from '@/components/shared/loading-state'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, initialized } = useAuth()

  if (!initialized) {
    return <LoadingState text="Loading..." />
  }

  if (!user) {
    return null // Middleware handles redirect
  }

  if (allowedRoles && user.app_metadata?.role && !allowedRoles.includes(user.app_metadata.role)) {
    router.push('/unauthorized')
    return null
  }

  return <>{children}</>
}