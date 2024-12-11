import { Header } from '@/components/layout/header'
import { SiteNavigation } from '@/components/layout/site-navigation'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <Header />
      <SiteNavigation />
      {children}
    </div>
  )
}