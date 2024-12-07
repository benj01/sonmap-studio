'use client'

import { useAuthStore } from '@/lib/stores'
import { Loader2 } from 'lucide-react'

export function AuthStatus() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {user.email}
      </span>
    </div>
  )
}
