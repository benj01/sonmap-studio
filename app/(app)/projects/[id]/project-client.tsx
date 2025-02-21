'use client'

import { useRouter } from 'next/navigation'
import  createClient  from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Settings, Users, Files, Map } from 'lucide-react'
import { LoadingState } from '@/components/shared/loading-state'
import { FileManager } from '@/components/files/components/manager'
import { useEffect, useState } from 'react'

type ProjectStatus = 'active' | 'archived' | 'deleted'

interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  created_at: string
  storage_used: number
}

interface ProjectClientProps {
  projectId: string;
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function ProjectClient({ projectId, searchParams }: ProjectClientProps) {
  const [project, setProject] = useState<Project | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProject() {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (error) {
          setError(error.message)
          toast({
            title: 'Error',
            description: error.message,
            action: (
              <Button variant="link" onClick={() => router.refresh()}>
                Retry
              </Button>
            ),
          })
          return
        }

        setProject(data)
      } catch (err) {
        console.error("Error loading project:", err);
        setError('An unexpected error occurred while loading the project.')
      } finally {
        setIsLoading(false)
      }
    }

    loadProject()
  }, [projectId, supabase, toast, router])

  if (isLoading) {
    return <LoadingState text="Loading project..." />
  }

  if (error || !project) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              {error || 'Project not found'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{project?.name || 'Loading...'}</h1>
            {project?.description && (
              <p className="text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/projects/${projectId}/settings`)}
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>

      <Tabs defaultValue="map" className="space-y-4">
        <TabsList>
          <TabsTrigger value="map">
            <Map className="mr-2 h-4 w-4" />
            Map View
          </TabsTrigger>
          <TabsTrigger value="files">
            <Files className="mr-2 h-4 w-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="mr-2 h-4 w-4" />
            Members
          </TabsTrigger>
        </TabsList>
        <TabsContent value="map" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Map View</CardTitle>
              <CardDescription>
                Visualize your project data on the map.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] bg-muted rounded-lg flex items-center justify-center">
                Map Component Coming Soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files" className="space-y-4">
          <FileManager projectId={projectId} />
        </TabsContent>
        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage project collaborators and permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-muted rounded-lg flex items-center justify-center">
                Team Management Coming Soon
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
