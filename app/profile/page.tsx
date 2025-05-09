'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

type Profile = {
  id: string
  username?: string | null
  full_name?: string | null
  avatar_url?: string | null
  updated_at: string
}

type ProfileUpdate = {
  id: string
  username: string | null
  full_name: string | null
  updated_at: string
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, initialized, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (initialized && !user) {
      router.push('/login')
    }
  }, [user, initialized, router])

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, updated_at')
          .eq('id', user.id)
          .single()

        if (error) throw error
        setProfile(data as Profile)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      loadProfile().catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load profile')
        setLoading(false)
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!user?.id) return

    setSaving(true)
    setError(null)

    try {
      const formData = new FormData(e.currentTarget)
      const updates: ProfileUpdate = {
        id: user.id,
        username: formData.get('username')?.toString() || null,
        full_name: formData.get('full_name')?.toString() || null,
        updated_at: new Date().toISOString(),
      }

      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (error) throw error
      
      setProfile(prev => prev ? {
        ...prev,
        username: updates.username || undefined,
        full_name: updates.full_name || undefined,
        updated_at: updates.updated_at
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setSigningOut(true)
      await signOut()
      router.push('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out')
    } finally {
      setSigningOut(false)
    }
  }

  if (!user) {
    return (
      <Alert>
        <AlertDescription>
          Please sign in to view this page.
        </AlertDescription>
      </Alert>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-8">Profile</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user.email || ''}
            disabled
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            defaultValue={profile?.username || ''}
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={profile?.full_name || ''}
            disabled={saving}
          />
        </div>

        <div className="space-y-4">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>

          <Button 
            type="button"
            variant="outline" 
            onClick={handleSignOut}
            disabled={signingOut}
            className="ml-4"
          >
            {signingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing out...
              </>
            ) : (
              'Sign Out'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}