'use client'

import { useUIStore, useAuthStore } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

export function UserSettings() {
  const { theme, setTheme } = useUIStore()
  const { user } = useAuthStore()
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdatePreferences = async () => {
    setIsUpdating(true)
    try {
      // Here you would typically update user preferences in your backend
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulated API call
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the application looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={theme}
              onValueChange={(value: typeof theme) => setTheme(value)}
            >
              <SelectTrigger id="theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure how you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="email-notifications">
              Email Notifications
            </Label>
            <Switch
              id="email-notifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={handleUpdatePreferences}
            disabled={isUpdating}
          >
            {isUpdating ? 'Saving...' : 'Save preferences'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
} 