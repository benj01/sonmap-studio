import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBytes } from "@/lib/utils"

interface DashboardStats {
  totalProjects: number
  activeProjects: number
  totalStorage: number
  collaborators: number
}

interface DashboardStatsProps {
  stats: DashboardStats
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalProjects}</div>
          <p className="text-xs text-muted-foreground">
            {stats.activeProjects} active
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeProjects}</div>
          <p className="text-xs text-muted-foreground">
            {((stats.activeProjects / stats.totalProjects) * 100).toFixed(0)}% of total
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatBytes(stats.totalStorage)}</div>
          <p className="text-xs text-muted-foreground">
            Across all projects
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Collaborators</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.collaborators}</div>
          <p className="text-xs text-muted-foreground">
            Active team members
          </p>
        </CardContent>
      </Card>
    </div>
  )
}