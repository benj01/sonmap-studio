'use client'

import { useEffect } from "react"
import { redirect } from 'next/navigation'
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/lib/stores"
import { Button } from "@/components/ui/button"

export default function ProfilePage() {
    const { user, loading, error, checkUser, resetError } = useAuthStore()

    useEffect(() => {
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
                <div className="text-center space-y-4">
                    <p className="text-destructive">{error.message}</p>
                    <Button 
                        onClick={() => {
                            resetError()
                            checkUser()
                        }}
                        variant="outline"
                    >
                        Try Again
                    </Button>
                </div>
            </div>
        )
    }

    if (!user) {
        redirect('/sign-in')
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
