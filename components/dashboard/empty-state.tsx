import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <h3 className="mt-2 text-lg font-semibold">No projects yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Get started by creating your first project.
      </p>
      <Button asChild className="mt-4">
        <a href="/projects/new">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </a>
      </Button>
    </div>
  )
} 