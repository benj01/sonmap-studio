'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { supabaseAuth } from '@/lib/stores/auth'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export function AuthActions() {
  const { user, initialized } = useAuth()

  if (!initialized) {
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
        onClick={() => supabaseAuth.signOut()}
      >
        Sign out
      </Button>
    </div>
  )
}