'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/components/providers/auth-provider'
import { Database } from '@/types/supabase'
import { LoadingState } from '@/components/shared/loading-state'

type ProjectInsert = Database['public']['Tables']['projects']['Insert']

export default function NewProjectPage() {
  const router = useRouter()
  const { user, initialized, isLoading } = useAuth()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  })

  // Show loading state while auth is initializing
  if (!initialized || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState text="Loading..." />
      </div>
    )
  }

  // Redirect if not authenticated
  if (initialized && !user) {
    router.push('/sign-in')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    setSubmitting(true)
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: formData.name,
          description: formData.description || null,
          owner_id: user.id,
          status: 'active',
          storage_used: 0,
          metadata: {}
        } as ProjectInsert)
        .select()
        .single()

      if (error) throw error

      toast({
        title: "Success",
        description: "Project created successfully",
      })

      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Error creating project:', error)
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive"
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 space-y-4 p-8">
      <Button
        variant="ghost"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create New Project</CardTitle>
          <CardDescription>
            Create a new project to start collaborating with your team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter project name"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter project description (optional)"
                rows={4}
                disabled={submitting}
              />
            </div>

            <Button 
              type="submit" 
              disabled={submitting || !formData.name.trim()} 
              className="w-full"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}