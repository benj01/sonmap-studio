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
import { useAuth } from '@/lib/stores/auth'
import { Database } from '@/types/supabase'
import { ProtectedRoute } from '@/components/auth/protected-route'

type ProjectInsert = Database['public']['Tables']['projects']['Insert']

export default function NewProjectPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted') // Debug log
    
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a project",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    
    try {
      const supabase = createClient()
      console.log('Creating project with data:', { // Debug log
        name: formData.name,
        description: formData.description,
        owner_id: user.id
      })
      
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

      if (error) {
        console.error('Supabase error:', error) // Debug log
        throw error
      }

      console.log('Project created:', data) // Debug log

      toast({
        title: "Success",
        description: "Project created successfully",
      })

      // Add a small delay before navigation
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 500)
    } catch (error) {
      console.error('Error creating project:', error)
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="container max-w-2xl py-8">
        <Button
          variant="ghost"
          className="mb-8"
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
                />
              </div>

              <Button 
                type="submit" 
                disabled={loading || !formData.name.trim()} 
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create Project'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}