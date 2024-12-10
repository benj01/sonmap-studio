'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { LoadingState } from '@/components/shared/loading-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { createClient } from '@/utils/supabase/client'
import { ProjectCard } from '@/components/dashboard/project-card'
import { DashboardStats as DashboardStatsComponent } from '@/components/dashboard/dashboard-stats'
import { Database } from '@/types/supabase'

type ProjectRow = Database['public']['Tables']['projects']['Row']

interface ProjectMember {
  count: number
}

interface Project extends ProjectRow {
  project_members: ProjectMember[]
}

interface DashboardStats {
  totalProjects: number
  activeProjects: number
  totalStorage: number
  collaborators: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, initialized } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    activeProjects: 0,
    totalStorage: 0,
    collaborators: 0
  })

  useEffect(() => {
    if (initialized && !user) {
      router.push('/login')
    }
  }, [user, initialized, router])

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      const supabase = createClient()
      
      try {
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*, project_members(count)')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false })

        if (projectsError) {
          throw projectsError
        }

        const typedProjects = (projectsData || []) as Project[]
        setProjects(typedProjects)

        // Calculate stats with proper typing
        const activeProjects = typedProjects.filter((p) => p.status === 'active').length
        const totalStorage = typedProjects.reduce((acc, p) => acc + (p.storage_used || 0), 0)
        const collaborators = typedProjects.reduce((acc, p) => 
          acc + (p.project_members?.[0]?.count || 0), 0)

        setStats({
          totalProjects: typedProjects.length,
          activeProjects,
          totalStorage,
          collaborators
        })
      } catch (error) {
        console.error('Error fetching projects:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  if (!initialized || loading) {
    return <LoadingState text="Loading your dashboard..." />
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <Button onClick={() => router.push('/projects/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <DashboardStatsComponent stats={stats} />

      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Recent Projects</h3>
          <Button variant="outline" onClick={() => router.push('/projects')}>
            View All
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.slice(0, 6).map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  )
}