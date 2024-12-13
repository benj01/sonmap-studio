// app/(app)/layout.tsx
import { createClient } from '@/utils/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      redirect('/sign-in')
    }

    return <>{children}</>
  } catch (error) {
    console.error('Error fetching session:', error)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2">Please try refreshing the page</p>
        </div>
      </div>
    )
  }
}