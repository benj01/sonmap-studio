'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/stores/auth'
import { UserSettings } from '@/components/settings/user-settings'

export default function SettingsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/sign-in')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return null
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