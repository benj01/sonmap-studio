'use client'

import { useRouter } from 'next/navigation'
import  createClient  from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Settings, Users, Files, Map, Beaker } from 'lucide-react'
import { LoadingState } from '@/components/shared/loading-state'
import { FileManager } from '@/components/files/components/manager'
import { useEffect, useState, useRef } from 'react'
import { MapContainer } from '@/components/map/components/MapContainer'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { env } from '@/env.mjs'

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
  const [activeTab, setActiveTab] = useState('map')
  const mapContainerRef = useRef<HTMLDivElement>(null)
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

  // Handle tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Give the DOM time to update before triggering resize
    requestAnimationFrame(() => {
      const mapboxgl = document.querySelector('.mapboxgl-map');
      const cesiumViewer = document.querySelector('.cesium-viewer');
      if (value === 'map') {
        if (mapboxgl) {
          // @ts-ignore - we know this exists
          mapboxgl._map?.resize();
        }
        if (cesiumViewer) {
          // @ts-ignore - we know this exists
          cesiumViewer._cesiumWidget?.resize();
        }
      }
    });
  };

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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{project?.name || 'Loading...'}</h1>
            <p className="text-sm text-muted-foreground">
              {project?.description || 'No description'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="map" className="space-y-4" onValueChange={handleTabChange}>
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
        <TabsContent value="map" className="space-y-4 min-h-[calc(100vh-12rem)]">
          <Card className="flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle>Map View</CardTitle>
              <CardDescription>
                Visualize your project data on the map. Toggle between 2D and 3D views using the control in the top right.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              <div 
                ref={mapContainerRef}
                className={cn(
                  "min-h-[800px] rounded-lg",
                  activeTab === 'map' ? 'block' : 'hidden'
                )}
              >
                <MapContainer 
                  accessToken={env.NEXT_PUBLIC_MAPBOX_TOKEN}
                  style="mapbox://styles/mapbox/satellite-streets-v12"
                  initialViewState2D={{
                    latitude: 0,
                    longitude: 0,
                    zoom: 2
                  }}
                  initialViewState3D={{
                    latitude: 0,
                    longitude: 0,
                    height: 10000000
                  }}
                  projectId={projectId}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files" className="space-y-4">
          <FileManager projectId={projectId} />
        </TabsContent>
        <TabsContent value="members">
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
