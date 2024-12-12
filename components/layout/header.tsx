'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useUIStore } from '@/lib/stores/ui'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'

export function Header() {
  const { user, initialized, signOut } = useAuth()
  const router = useRouter()
  const toggleModal = useUIStore(state => state.toggleModal)

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-16">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <header className="border-b">
      <div className="container flex items-center justify-between h-16">
        {/* App Name */}
        <Link href="/" className="font-semibold">
          Your App
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-4">
          {/* Show Dashboard Link for Logged-in Users Only */}
          {user && (
            <Link
              href="/dashboard"
              className="text-sm font-medium hover:underline"
            >
              Dashboard
            </Link>
          )}

          {/* User Menu or Sign-In/Sign-Up Buttons */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <UserAvatar className="h-8 w-8" user={user} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notes">My Notes</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={signOut}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleModal('login')}
              >
                Sign In
              </Button>
              <Button onClick={() => router.push('/sign-up')}>
                Sign Up
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
