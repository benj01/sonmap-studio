'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { LoadingState } from '@/components/shared/loading-state'
import { UserSettings } from '@/components/settings/user-settings'

export default function SettingsPage() {
  const router = useRouter()
  const { user, initialized } = useAuth()

  useEffect(() => {
    if (initialized && !user) {
      router.push('/login')
    }
  }, [user, initialized, router])

  if (!initialized) {
    return <LoadingState text="Loading..." />
  }

  if (!user) {
    return null
  }

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <UserSettings />
    </div>
  )
}