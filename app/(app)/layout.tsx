import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

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

    // Return children without duplicating navigation
    return <>{children}</>
  } catch (error) {
    console.error('Error fetching session:', error)
    // Optionally, redirect to a custom error page or fallback
    redirect('/error')
  }
}
