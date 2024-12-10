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
import { useAuth } from '@/lib/stores/auth' // Updated import
import { Database } from '@/types/supabase'
import { ProtectedRoute } from '@/components/auth/protected-route'

type ProjectInsert = Database['public']['Tables']['projects']['Insert']

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth() // Using auth store instead of provider
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !user?.id) return
    
    setIsLoading(true)

    try {
      const supabase = createClient()
      
      const newProject: ProjectInsert = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        status: 'active',
        owner_id: user.id,
        storage_used: 0
      }

      const { data, error } = await supabase
        .from('projects')
        .insert(newProject)
        .select()
        .single()

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Project created successfully'
      })

      router.push(`/projects/${data.id}`)
    } catch (error) {
      console.error('Error creating project:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create project. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="container max-w-2xl py-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
            <CardDescription>
              Create a new project to start organizing your work.
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
                  disabled={isLoading}
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
                  disabled={isLoading}
                />
              </div>
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || !formData.name.trim()}
                >
                  {isLoading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}