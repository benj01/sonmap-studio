'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NotesPage() {
  return (
    <ProtectedRoute>
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>
              This feature is coming soon. The notes functionality is currently under development.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              The notes feature will allow you to create, edit, and organize notes related to your projects.
              Check back later for updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}