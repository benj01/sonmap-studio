'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores'
import { LoadingState } from '@/components/shared/loading-state'

export function AuthProvider({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { initialized, checkUser } = useAuthStore()

  useEffect(() => {
    if (!initialized) {
      checkUser()
    }
  }, [initialized, checkUser])

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState text="Loading authentication..." />
      </div>
    )
  }

  return <>{children}</>
}
