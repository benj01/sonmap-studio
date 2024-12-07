'use client'

import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

export function AuthActions() {
  const { user, signOut, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/sign-up">Sign up</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/profile">Profile</Link>
      </Button>
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => signOut()}
      >
        Sign out
      </Button>
    </div>
  )
}
