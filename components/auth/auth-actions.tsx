'use client'

import { useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function AuthActions() {
  const { user, signOut, isLoading } = useAuthStore()

  if (isLoading) return null

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
