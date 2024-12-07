'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/stores/auth'
import { useUIStore } from '@/lib/stores/ui'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { UserAvatar } from '@/components/ui/user-avatar'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Upload } from 'lucide-react'

export function UserSettings() {
  const { user } = useAuth()
  const { theme, setTheme } = useUIStore()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
  })

  // ... existing handleThemeChange and handleNotificationChange ...

  if (!user) {
    return (
      <Alert>
        <AlertDescription>
          Please sign in to view settings.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* New Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Manage your profile information and avatar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center space-x-4">
          <UserAvatar user={user} size="lg" />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Change Avatar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Avatar</DialogTitle>
                <DialogDescription>
                  Upload a new avatar image. The image should be square and at least 128x128 pixels.
                </DialogDescription>
              </DialogHeader>
              {/* Add file upload component here */}
              <DialogFooter>
                <Button variant="outline" type="button">Cancel</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Existing Appearance Card */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the app looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select
              value={theme}
              onValueChange={handleThemeChange}
            >
              <SelectTrigger id="theme" className="w-[200px]">
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

      {/* Existing Notifications Card */}
      <Card>
        {/* ... existing notifications card content ... */}
      </Card>
    </div>
  )
}