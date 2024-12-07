'use client'

import { type ReactNode } from 'react'
import { useAuthStore, useUIStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/lib/imports'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/stores/auth'

export function Header() {
  const { user, isLoading, signOut } = useAuthStore()
  const toggleModal = useUIStore(state => state.toggleModal)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-16">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <header className="border-b">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="font-semibold">
          Your App
        </Link>

        <nav className="flex items-center gap-4">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar
                    className="h-8 w-8"
                    user={{ name: user.email || 'User' }}
                  />
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
                  onClick={() => signOut()}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => toggleModal('login')}
              >
                Sign in
              </Button>
              <Button
                onClick={() => toggleModal('register')}
              >
                Sign up
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}