'use client'

import { createClient } from "@/utils/supabase/client"
import { useEffect, useState } from "react"
import { redirect } from 'next/navigation'
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/card"
import { User } from '@supabase/supabase-js'
import { Loader2 } from "lucide-react"

export default function ProfilePage() {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const checkUser = async () => {
            try {
                const supabase = createClient()
                const { data, error } = await supabase.auth.getUser()

                if (error || !data.user) {
                    redirect('/sign-in')
                }

                setUser(data.user)
            } catch (err) {
                console.error('Error fetching user:', err)
                setError('Failed to load user profile')
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        checkUser()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full w-full py-12">
                <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading profile...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full w-full py-12">
                <div className="text-center">
                    <p className="text-destructive">{error}</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        )
    }

    if (!user) {
        return null
    }

    return (
        <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2">
            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Your account information</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-medium">Email</h3>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium">User ID</h3>
                            <p className="text-sm text-muted-foreground">{user.id}</p>
                        </div>
                        {user.last_sign_in_at && (
                            <div>
                                <h3 className="text-sm font-medium">Last Sign In</h3>
                                <p className="text-sm text-muted-foreground">
                                    {new Date(user.last_sign_in_at).toLocaleString()}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
