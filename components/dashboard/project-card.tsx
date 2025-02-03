'use client'

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, MoreVertical, Archive } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from 'date-fns'
import { Database } from '@/types/supabase'

type ProjectStatus = 'active' | 'archived' | 'deleted'
type ProjectRow = Database['public']['Tables']['projects']['Row']

interface ProjectMember {
  count: number
}

interface Project extends ProjectRow {
  project_members: ProjectMember[]
  status: ProjectStatus
}

interface ProjectCardProps {
  project: Project
  onDelete?: (id: string) => void
  onArchive?: (id: string) => void
}

export function ProjectCard({ project, onDelete, onArchive }: ProjectCardProps) {
  const router = useRouter()

  return (
    <Card className="group relative hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div 
            className="cursor-pointer"
            onClick={() => router.push(`/projects/${project.id}`)}
          >
            <CardTitle className="line-clamp-1">{project.name}</CardTitle>
            <CardDescription className="line-clamp-2">
              {project.description || 'No description'}
            </CardDescription>
            <CardDescription className="mt-2">
              Created {formatDistanceToNow(new Date(project.created_at))} ago
              {project.project_members?.[0]?.count > 0 && (
                <span className="ml-2">
                  • {project.project_members[0].count} collaborator{project.project_members[0].count !== 1 ? 's' : ''}
                </span>
              )}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onArchive && project.status === 'active' && (
                <DropdownMenuItem onClick={() => onArchive(project.id)}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={() => onDelete(project.id)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
    </Card>
  )
}