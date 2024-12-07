'use client'

import { useEffect, useState } from 'react'
import { useAuthStore, useDataStore } from '@/lib/stores'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { createClient } from '@/utils/supabase/client'
import { Loader2 } from 'lucide-react'

interface Profile {
  id: string
  username?: string
  full_name?: string
  avatar_url?: string
  updated_at: string
}

export default function ProfilePage() {
  const { user } = useAuthStore()
  const { fetchData, cache, invalidateCache } = useDataStore()
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateSuccess, setUpdateSuccess] = useState(false)

  const profileCacheKey = `profile-${user?.id}`

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const supabase = createClient()
        await fetchData<Profile>(
          profileCacheKey,
          async () => {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .single()

            if (error) throw error
            return data
          }
        )
      }

      fetchProfile()
    }
  }, [user, fetchData, profileCacheKey])

  const handleUpdateProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user) return

    setIsUpdating(true)
    setUpdateError(null)
    setUpdateSuccess(false)

    const formData = new FormData(e.currentTarget)
    const updates = {
      id: user.id,
      username: formData.get('username')?.toString(),
      full_name: formData.get('full_name')?.toString(),
      updated_at: new Date().toISOString()
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .upsert(updates)

      if (error) throw error

      invalidateCache(profileCacheKey)
      setUpdateSuccess(true)
    } catch (error) {
      setUpdateError(
        error instanceof Error ? error.message : 'Failed to update profile'
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const cachedProfile = cache[profileCacheKey]

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-bold">Profile Settings</h1>

        {!cachedProfile ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : cachedProfile.error ? (
          <Alert variant="destructive">
            {cachedProfile.error}
          </Alert>
        ) : (
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {updateError && (
              <Alert variant="destructive">{updateError}</Alert>
            )}
            
            {updateSuccess && (
              <Alert>Profile updated successfully!</Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
              />
              <p className="text-sm text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                defaultValue={cachedProfile.data.username || ''}
                disabled={isUpdating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={cachedProfile.data.full_name || ''}
                disabled={isUpdating}
              />
            </div>

            <Button
              type="submit"
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Profile'
              )}
            </Button>
          </form>
        )}
      </div>
    </ProtectedRoute>
  )
}
