'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const { user, isLoading, initialized, checkUser } = useAuthStore()

  useEffect(() => {
    if (!initialized) {
      checkUser()
    }
  }, [initialized, checkUser])

  useEffect(() => {
    if (initialized && !isLoading && !user) {
      router.replace('/sign-in')
    }
  }, [initialized, isLoading, user, router])

  if (isLoading || !initialized) {
    return (
      <div className="flex items-center justify-center h-full w-full py-12">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
} 