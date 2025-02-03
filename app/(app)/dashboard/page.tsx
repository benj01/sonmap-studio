'use client'

import { Database } from '@/types/supabase'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { LoadingState } from '@/components/shared/loading-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ProjectCard } from '@/components/dashboard/project-card'
import { DashboardStats as DashboardStatsComponent } from '@/components/dashboard/dashboard-stats'
import { EmptyState } from '@/components/dashboard/empty-state'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectStatus = 'active' | 'archived' | 'deleted'

interface ProjectMember {
  count: number
}

interface Project extends ProjectRow {
  project_members: ProjectMember[]
  status: ProjectStatus
}

interface ProjectMemberCount {
  project_id: string
  count: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, initialized } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    totalStorage: 0,
    collaborators: 0
  })

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      const supabase = createClient()

      try {
        // Fetch projects
        const { data: projects } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })

        // Fetch member counts
        const { data: membersData } = await supabase
          .from('project_member_counts')
          .select('project_id, count')

        // Combine data
        const projectsWithMembers = (projects?.map((project: ProjectRow) => ({
          ...project,
          status: 'active' as const,
          project_members: [{
            count: membersData?.find((m: ProjectMemberCount) => m.project_id === project.id)?.count || 0
          }]
        })) as Project[]) || []

        setProjects(projectsWithMembers)

        // Calculate stats
        const activeProjects = projectsWithMembers.filter((p) => p.status === 'active').length
        const totalStorage = projectsWithMembers.reduce((acc, p) => acc + (p.storage_used || 0), 0)
        const collaborators = (membersData || []).reduce((acc: number, m) => 
          acc + (m.count || 0), 0)

        setStats({
          totalProjects: projectsWithMembers.length,
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

  const handleDelete = async (projectId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (error) {
      console.error('Error deleting project:', error)
    } else {
      // Refresh the projects list
      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (projects) {
        setProjects(projects.map(project => ({
          ...project,
          status: 'active' as const,
          project_members: [{ count: 0 }]
        })))
      }
    }
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button asChild>
          <a href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </a>
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
