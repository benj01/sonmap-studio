// app/(app)/layout.tsx
import { redirect } from 'next/navigation'
import createClient from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    const supabase = await createClient()
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
