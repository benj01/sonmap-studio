'use client'

import { Database } from '@/types/supabase'
import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { LoadingState } from '@/components/shared/loading-state'
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ProjectCard } from '@/components/dashboard/project-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { dbLogger } from '@/utils/logging/dbLogger'
import { useVerifyUserExistence } from '@/components/shared/hooks/useVerifyUserExistence'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type ProjectStatus = 'active' | 'archived' | 'deleted'

interface ProjectMember {
  count: number
}

interface Project extends ProjectRow {
  project_members: ProjectMember[]
  status: ProjectStatus
}

export default function DashboardPage() {
  const { user, initialized } = useAuth()
  const { isVerifying } = useVerifyUserExistence()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      const supabase = createClient()

      try {
        // Check session first
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          await dbLogger.error('DashboardPage.sessionError', { error: sessionError })
          return
        }

        // Fetch projects
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })

        if (projectsError) {
          await dbLogger.error('DashboardPage.projectsError', { error: projectsError })
          return
        }

        // For each project, fetch its member count
        const projectsWithMembers = await Promise.all(
          (projects || []).map(async (project: ProjectRow) => {
            const { count } = await supabase
              .from('project_members')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id)

            return {
              ...project,
              status: 'active' as const,
              project_members: [{ count: count || 0 }]
            }
          })
        )

        setProjects(projectsWithMembers as Project[])
      } catch (error) {
        await dbLogger.error('DashboardPage.fetchError', { error })
      } finally {
        setLoading(false)
      }
    }

    // Handle the promise rejection
    fetchData().catch(async (error) => {
      await dbLogger.error('DashboardPage.unhandledError', { error })
      setLoading(false)
    })
  }, [user])

  if (isVerifying) {
    return <LoadingState text="Verifying your account..." />
  }

  if (!initialized || loading) {
    return <LoadingState text="Loading your dashboard..." />
  }

  if (!user) {
    return null
  }

  const handleDelete = async (projectId: string) => {
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) {
        await dbLogger.error('DashboardPage.deleteError', { error, projectId })
        return
      }

      // Refresh the projects list
      const { data: projects, error: refreshError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (refreshError) {
        await dbLogger.error('DashboardPage.refreshError', { error: refreshError })
        return
      }

      if (projects) {
        setProjects(projects.map(project => ({
          ...project,
          status: 'active' as const,
          project_members: [{ count: 0 }]
        })))
      }
    } catch (error) {
      await dbLogger.error('DashboardPage.handleDeleteError', { error, projectId })
    }
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Projects</h1>
        {projects.length > 0 && (
          <Button asChild>
            <a href="/projects/new">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </a>
          </Button>
        )}
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
