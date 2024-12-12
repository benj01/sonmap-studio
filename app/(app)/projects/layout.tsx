import { Header } from '@/components/layout/header'
import { SiteNavigation } from '@/components/layout/site-navigation'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header>
        <Header />
      </header>
      <div className="flex flex-1">
        <aside>
          <SiteNavigation />
        </aside>
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
