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

type Tables = Database['public']['Tables']
type ProjectRow = Tables['projects']['Row']

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

interface ProjectMemberCount {
  project_id: string
  count: number
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
        // First fetch owned projects
        const { data: ownedProjects, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false })

        if (projectsError) throw projectsError

        // Then fetch projects where user is a member (corrected syntax)
        const { data: memberProjects, error: memberProjectsError } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('user_id', user.id)
          .not('joined_at', 'is', null)

        if (memberProjectsError) throw memberProjectsError

        // Fetch full project details for member projects
        let memberProjectDetails = []
        if (memberProjects && memberProjects.length > 0) {
          const { data: details, error: memberDetailsError } = await supabase
            .from('projects')
            .select('*')
            .in('id', memberProjects.map(mp => mp.project_id))
            .order('updated_at', { ascending: false })

          if (memberDetailsError) throw memberDetailsError
          memberProjectDetails = details || []
        }

        // Combine the results
        const allProjects = [...(ownedProjects || []), ...memberProjectDetails]

        // Then fetch member counts
        const { data: membersData, error: membersError } = await supabase
          .rpc('get_project_member_counts', {
            project_ids: allProjects.map(p => p.id)
          })

        if (membersError) throw membersError

        // Format projects with member counts
        const projectsWithMembers = allProjects.map(project => ({
          ...project,
          project_members: [{
            count: membersData?.find(m => m.project_id === project.id)?.count || 0
          }]
        })) as Project[]

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