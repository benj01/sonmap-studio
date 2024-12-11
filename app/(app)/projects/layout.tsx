import { SiteHeader } from '@/components/layout/site-header'
import { SiteNavigation } from '@/components/layout/site-navigation'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex flex-1">
        <SiteNavigation />
        <main className="flex-1 bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}