'use client'

import { useEffect, useState } from "react"
import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import Login from "@/app/auth-pages/sign-in/page"
import { getUser, signOut } from "@/utils/auth"
import type { User } from '@supabase/supabase-js'

export default function LandingPage() {
    const [user, setUser] = useState<User | null>(null)
    const [isLoginModalOpen, setLoginModalOpen] = useState(false)

    useEffect(() => {
        const fetchUser = async () => {
            const fetchedUser = await getUser()
            if (fetchedUser) {
                setUser(fetchedUser as User)
            }
        }
        fetchUser()
    }, [])

    const handleLoginModalOpen = () => setLoginModalOpen(true)
    const handleLoginModalClose = () => setLoginModalOpen(false)

    const handleSignOut = async () => {
        await signOut()
        setUser(null)
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold">Welcome to Next.js Supabase Starter</h1>
            <p className="text-lg mt-4">The fastest way to build apps with Supabase and Next.js</p>

            {user ? (
                <div className="mt-8">
                    <DropdownMenu>
                        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <span className="text-xl font-bold uppercase">
                                {user.email?.[0] ?? 'U'}
                            </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleSignOut}>
                                Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : (
                <div className="mt-8">
                    <button
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                        onClick={handleLoginModalOpen}
                    >
                        Sign In
                    </button>
                </div>
            )}

            {/* Login Dialog */}
            <Dialog open={isLoginModalOpen} onOpenChange={setLoginModalOpen}>
                <DialogContent>
                    <Login />
                </DialogContent>
            </Dialog>
        </div>
    )
}